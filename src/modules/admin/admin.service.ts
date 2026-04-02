import { PrismaService } from '../../core/config/prisma.service';
import { AppError } from '../../core/config/error.handler';
import { logger } from '../../core/logger/logger';
import { ResolutionService } from '../markets/resolution.service';

export class AdminService {
    private readonly prisma = PrismaService.getInstance();
    private readonly resolutionService = new ResolutionService();

    /**
     * Get markets that don't have Homer Baba predictions yet
     */
    async getUnfeaturedMarkets(limit = 50) {
        const markets = await this.prisma.market.findMany({
            where: {
                status: 'active',
                resolved: false,
                aiPredictions: { none: {} },
            },
            orderBy: { createdAt: 'desc' },
            take: limit,
            select: {
                id: true,
                title: true,
                yesPrice: true,
                noPrice: true,
                volume: true,
                closesAt: true,
                expiry: true,
                source: true,
            },
        });

        return { markets };
    }

    /**
     * Create a Homer Baba AI prediction
     */
    async createPrediction(data: {
        marketId: string;
        prediction: string;
        confidence: number;
        commentary: string;
        createdBy?: string;
    }) {
        const market = await this.prisma.market.findUnique({ where: { id: data.marketId } });
        if (!market) throw new AppError('Market not found', 404);

        if (data.confidence < 1 || data.confidence > 100) {
            throw new AppError('Confidence must be 1-100', 400);
        }
        if (data.commentary.length < 30 || data.commentary.length > 280) {
            throw new AppError('Commentary must be 30-280 characters', 400);
        }

        const prediction = await this.prisma.aIPrediction.create({
            data: {
                marketId: data.marketId,
                prediction: data.prediction,
                confidence: data.confidence,
                commentary: data.commentary,
                featured: true,
                createdBy: data.createdBy,
            },
        });

        logger.info(`Homer Baba prediction created for market ${data.marketId}: ${data.prediction}`);
        return prediction;
    }

    /**
     * Create a Daily battle
     */
    async createDailyBattle(data: {
        date: string;
        markets: Array<{
            marketId: string;
            position: number;
            homerPrediction: string;
            homerConfidence: number;
            homerCommentary?: string;
        }>;
    }) {
        if (data.markets.length < 1) {
            throw new AppError('Must include at least 1 market', 400);
        }

        // Check for existing battle on this date
        const existing = await this.prisma.dailyBattle.findUnique({
            where: { date: new Date(data.date) },
        });
        if (existing) throw new AppError('Battle already exists for this date', 409);

        // Validate all markets exist
        for (const m of data.markets) {
            const market = await this.prisma.market.findUnique({ where: { id: m.marketId } });
            if (!market) throw new AppError(`Market ${m.marketId} not found`, 404);
        }

        const battle = await this.prisma.dailyBattle.create({
            data: {
                date: new Date(data.date),
                status: 'active',
                markets: {
                    create: data.markets.map(m => ({
                        marketId: m.marketId,
                        position: m.position,
                        homerPrediction: m.homerPrediction,
                        homerConfidence: m.homerConfidence,
                        homerCommentary: m.homerCommentary,
                    })),
                },
            },
            include: { markets: true },
        });

        logger.info(`Daily battle created for ${data.date}`);
        return { id: battle.id, date: data.date, status: battle.status, markets_count: data.markets.length };
    }

    /**
     * Resolve a Daily battle
     */
    async resolveDailyBattle(battleId: string, resolutions: Array<{ dailyBattleMarketId: string; outcome: string }>) {
        const battle = await this.prisma.dailyBattle.findUnique({
            where: { id: battleId },
            include: { markets: { include: { userPredictions: true } } },
        });
        if (!battle) throw new AppError('Battle not found', 404);
        if (battle.status === 'resolved') throw new AppError('Battle already resolved', 409);

        let homerScore = 0;
        const totalMarkets = battle.markets.length;
        const userScores: Record<string, number> = {};

        for (const resolution of resolutions) {
            const battleMarket = battle.markets.find(m => m.id === resolution.dailyBattleMarketId);
            if (!battleMarket) continue;

            const homerResult = battleMarket.homerPrediction === resolution.outcome ? 'WIN' : 'LOSS';
            if (homerResult === 'WIN') homerScore++;

            // Update homer result
            await this.prisma.dailyBattleMarket.update({
                where: { id: battleMarket.id },
                data: { result: homerResult },
            });

            // Update user predictions
            for (const userPred of battleMarket.userPredictions) {
                const userResult = userPred.prediction === resolution.outcome ? 'WIN' : 'LOSS';
                await this.prisma.userDailyPrediction.update({
                    where: { id: userPred.id },
                    data: { result: userResult },
                });

                if (!userScores[userPred.userId]) userScores[userPred.userId] = 0;
                if (userResult === 'WIN') userScores[userPred.userId]++;
            }
        }

        // Award bonus XP
        let usersWhoBeatHomer = 0;
        let perfectScores = 0;

        for (const [userId, score] of Object.entries(userScores)) {
            if (score >= totalMarkets * 0.8 && score < totalMarkets) {
                await this.awardXP(userId, 50, 'daily_high_score', { score, battleId });
            }
            if (score === totalMarkets) {
                await this.awardXP(userId, 250, 'daily_perfect', { battleId });
                perfectScores++;
            }
            if (score > homerScore) {
                await this.awardXP(userId, 100, 'daily_beat_homer', { battleId, userScore: score, homerScore });
                usersWhoBeatHomer++;
            }
        }

        // Mark battle resolved
        await this.prisma.dailyBattle.update({
            where: { id: battleId },
            data: { status: 'resolved' },
        });

        return {
            battle_id: battleId,
            status: 'resolved',
            homer_score: `${homerScore}/${totalMarkets}`,
            users_who_beat_homer: usersWhoBeatHomer,
            perfect_scores: perfectScores,
        };
    }

    async manuallyResolveMarket(marketId: string, outcome: 'YES' | 'NO', note?: string) {
        const market = await this.prisma.market.findUnique({ where: { id: marketId } });
        if (!market) throw new AppError('Market not found', 404);

        const result = await this.resolutionService.resolveMarketById(marketId, outcome);
        logger.info(`[AdminService] Market ${marketId} manually resolved to ${outcome}${note ? ` (${note})` : ''}`);

        return {
            ...result,
            method: 'manual_admin',
            note: note || null,
        };
    }

    async resolveMarketFromSource(marketId: string) {
        const suggestion = await this.resolutionService.getResolutionSuggestion(marketId);
        if (!suggestion.outcome || !['source_feed', 'source_url', 'oracle_title'].includes(suggestion.method)) {
            throw new AppError('No deterministic source-backed resolution available for this market yet', 400);
        }

        const result = await this.resolutionService.resolveMarketById(marketId, suggestion.outcome as 'YES' | 'NO');
        logger.info(`[AdminService] Market ${marketId} resolved from ${suggestion.method} as ${suggestion.outcome}`);

        return {
            ...result,
            method: suggestion.method,
            confidence: suggestion.confidence,
            rationale: suggestion.rationale,
        };
    }

    async getAIMarketResolutionSuggestion(marketId: string) {
        const market = await this.prisma.market.findUnique({
            where: { id: marketId },
            select: { id: true, title: true, sourceUrl: true, source: true, closesAt: true, resolved: true, resolution: true },
        });
        if (!market) throw new AppError('Market not found', 404);

        const suggestion = await this.resolutionService.getResolutionSuggestion(marketId);
        return {
            market: {
                id: market.id,
                title: market.title,
                source: market.source,
                source_url: market.sourceUrl,
                closes_at: market.closesAt,
                resolved: market.resolved,
                resolution: market.resolution,
            },
            suggestion,
            next_step: 'Review the suggestion and confirm with POST /api/admin/markets/:id/resolve',
        };
    }

    private async awardXP(wallet: string, amount: number, reason: string, metadata?: any) {
        await this.prisma.$transaction([
            this.prisma.xPTransaction.create({
                data: { walletAddress: wallet, amount, reason, metadata },
            }),
            this.prisma.user.update({
                where: { walletAddress: wallet },
                data: { xpTotal: { increment: amount } },
            }),
        ]);
    }
}
