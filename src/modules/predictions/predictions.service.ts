import { PrismaService } from '../../core/config/prisma.service';
import { RedisService } from '../../core/config/redis.service';
import { AppError } from '../../core/config/error.handler';
import { logger } from '../../core/logger/logger';

export class PredictionsService {
    private readonly prisma = PrismaService.getInstance();
    private readonly redis = RedisService.getInstance();

    /**
     * Get 3-tier AI predictions: Today's (100), Old (All Active), and Expired (500)
     */
    async getAIPredictions() {
        const [todays_raw, old_raw, expired_raw] = await Promise.all([
            this.prisma.aIPrediction.findMany({
                where: { 
                    featured: true,
                    market: {
                        OR: [
                            { closesAt: { gt: new Date() } },
                            { expiry: { gt: new Date() } }
                        ]
                    }
                },
                include: { market: true },
                orderBy: { featuredRank: 'asc' },
                take: 100
            }),
            this.prisma.aIPrediction.findMany({
                where: { 
                    featured: false, 
                    resolved: false,
                    market: {
                        OR: [
                            { closesAt: { gt: new Date() } },
                            { expiry: { gt: new Date() } }
                        ]
                    }
                },
                include: { market: true },
                orderBy: { createdAt: 'desc' }
            }),
            // 3. Expired Markets (Resolved)
            this.prisma.aIPrediction.findMany({
                where: { resolved: true },
                include: { market: true },
                orderBy: { createdAt: 'desc' },
                take: 500
            })
        ]);

        const mapPrediction = (p: any) => ({
            id: p.id,
            market: {
                id: p.market.id,
                question: p.market.title,
                closes_at: p.market.closesAt || p.market.expiry,
                image: p.market.image,
                source: p.market.source,
            },
            prediction: p.prediction,
            confidence: p.confidence,
            summary_commentary: p.summaryCommentary,
            bullish_commentary: p.bullishCommentary,
            bearish_commentary: p.bearishCommentary,
            commentary: p.commentary,
            created_at: p.createdAt,
            resolved: p.resolved,
            result: p.result,
            featured_rank: p.featuredRank
        });

        // Calculate stats
        const [wins, losses, pending] = await Promise.all([
            this.prisma.aIPrediction.count({ where: { resolved: true, result: 'WIN' } }),
            this.prisma.aIPrediction.count({ where: { resolved: true, result: 'LOSS' } }),
            this.prisma.aIPrediction.count({ where: { resolved: false } })
        ]);
        const totalResolved = wins + losses;

        return {
            todays_predictions: todays_raw.map(mapPrediction),
            old_predictions: old_raw.map(mapPrediction),
            expired_predictions: expired_raw.map(mapPrediction),
            stats: {
                total_predictions: totalResolved + pending,
                wins,
                losses,
                accuracy: totalResolved > 0 ? wins / totalResolved : 0,
            }
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

    async getBigMisses(limit = 10) {
        const misses = await this.prisma.aIPrediction.findMany({
            where: { resolved: true, result: 'LOSS' },
            include: { market: { include: { positions: true } } },
            orderBy: { createdAt: 'desc' },
            take: limit,
        });

        return misses.map(m => {
            const communityWins = m.market.positions.filter(p => p.status === 'WON').length;
            const totalCommunity = m.market.positions.filter(p => p.status !== 'ACTIVE').length;

            return {
                id: m.id,
                market: {
                    id: m.market.id,
                    question: m.market.title,
                    image: m.market.image,
                },
                oracle_prediction: m.prediction,
                oracle_confidence: m.confidence,
                summary: m.summaryCommentary,
                community_accuracy: totalCommunity > 0 ? communityWins / totalCommunity : 0,
                community_wins: communityWins,
                resolved_at: m.market.updatedAt,
            };
        });
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

        const [wins, losses, active] = await Promise.all([
            this.prisma.position.count({ where: { walletAddress: userId, status: 'WON' } }),
            this.prisma.position.count({ where: { walletAddress: userId, status: 'LOST' } }),
            this.prisma.position.count({ where: { walletAddress: userId, status: 'ACTIVE' } })
        ]);

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
                total: wins + losses + active,
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
