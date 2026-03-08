import { PrismaService } from '../../core/config/prisma.service';
import { RedisService } from '../../core/config/redis.service';
import { AppError } from '../../core/config/error.handler';
import { logger } from '../../core/logger/logger';

export class PredictionsService {
    private readonly prisma = PrismaService.getInstance();
    private readonly redis = RedisService.getInstance();

    /**
     * Get all Homer Baba AI predictions with stats
     */
    async getAIPredictions(filter: { status?: string; result?: string; limit?: number; offset?: number }) {
        const { status, result, limit = 20, offset = 0 } = filter;

        const where: any = {};
        if (status === 'pending') where.resolved = false;
        if (status === 'resolved') where.resolved = true;
        if (result) where.result = result.toUpperCase();

        const [predictions, total] = await Promise.all([
            this.prisma.aIPrediction.findMany({
                where,
                include: { market: true },
                orderBy: { createdAt: 'desc' },
                take: limit,
                skip: offset,
            }),
            this.prisma.aIPrediction.count({ where }),
        ]);

        // Calculate stats
        const allResolved = await this.prisma.aIPrediction.findMany({
            where: { resolved: true },
        });
        const wins = allResolved.filter(p => p.result === 'WIN').length;
        const losses = allResolved.filter(p => p.result === 'LOSS').length;

        return {
            predictions: predictions.map(p => ({
                id: p.id,
                market: {
                    id: p.market.id,
                    question: p.market.title,
                    closes_at: p.market.closesAt || p.market.expiry,
                    image: p.market.image,
                },
                prediction: p.prediction,
                confidence: p.confidence,
                commentary: p.commentary,
                created_at: p.createdAt,
                resolved: p.resolved,
                result: p.result,
            })),
            stats: {
                total_predictions: allResolved.length + await this.prisma.aIPrediction.count({ where: { resolved: false } }),
                wins,
                losses,
                accuracy: allResolved.length > 0 ? wins / allResolved.length : 0,
            },
            total,
            limit,
            offset,
        };
    }

    /**
     * Track when user clicks "Trade YES/NO" — create position + award XP
     */
    async trackPrediction(wallet: string, data: { marketId: string; side: string; referralCode?: string }) {
        const market = await this.prisma.market.findUnique({ where: { id: data.marketId } });
        if (!market) throw new AppError('Market not found', 404);

        // Check for existing prediction on this market
        const existing = await this.prisma.position.findFirst({
            where: { walletAddress: wallet, marketId: data.marketId },
        });
        if (existing) throw new AppError('Already predicted on this market', 409);

        // Create position
        const tokenMint = data.side === 'YES' ? market.yesTokenMint : market.noTokenMint;
        const position = await this.prisma.position.create({
            data: {
                walletAddress: wallet,
                marketId: data.marketId,
                tokenMint,
                side: data.side,
                entryOdds: data.side === 'YES' ? (market.yesPrice || 0.5) : (market.noPrice || 0.5),
                amount: 0,
                status: 'ACTIVE',
            },
        });

        // Award +20 XP
        await this.awardXP(wallet, 20, 'prediction_made', { market_id: data.marketId });

        // Handle referral attribution
        if (data.referralCode) {
            const creatorMarket = await this.prisma.creatorMarket.findUnique({
                where: { referralCode: data.referralCode },
            });
            if (creatorMarket) {
                await this.prisma.attribution.create({
                    data: {
                        creatorId: creatorMarket.creatorId,
                        userId: wallet,
                        marketId: data.marketId,
                        referralCode: data.referralCode,
                        converted: true,
                        tradePlatform: market.source,
                    },
                });
            }
        }

        // Build redirect URL
        const redirectUrl = market.sourceUrl || `https://polymarket.com`;

        return {
            position_id: position.id,
            xp_awarded: 20,
            redirect_url: redirectUrl,
        };
    }

    /**
     * Get user's prediction history
     */
    async getUserPredictions(userId: string, filter: { status?: string; limit?: number; offset?: number }) {
        const { status, limit = 20, offset = 0 } = filter;

        const where: any = { walletAddress: userId };
        if (status) where.status = status.toUpperCase();

        const [predictions, total] = await Promise.all([
            this.prisma.position.findMany({
                where,
                include: { market: true },
                orderBy: { predictedAt: 'desc' },
                take: limit,
                skip: offset,
            }),
            this.prisma.position.count({ where }),
        ]);

        const allPositions = await this.prisma.position.findMany({
            where: { walletAddress: userId },
        });
        const wins = allPositions.filter(p => p.status === 'WON').length;
        const losses = allPositions.filter(p => p.status === 'LOST').length;
        const active = allPositions.filter(p => p.status === 'ACTIVE').length;

        return {
            predictions: predictions.map(p => ({
                id: p.id,
                market: {
                    id: p.market.id,
                    question: p.market.title,
                    source: p.market.source,
                },
                side: p.side,
                entry_odds: p.entryOdds,
                predicted_at: p.predictedAt,
                status: p.status,
            })),
            stats: {
                total: allPositions.length,
                wins,
                losses,
                active,
                win_rate: (wins + losses) > 0 ? wins / (wins + losses) : 0,
            },
            total,
            limit,
            offset,
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
