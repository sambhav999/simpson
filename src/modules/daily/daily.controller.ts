import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { PrismaService } from '../../core/config/prisma.service';
import { requireAuth, optionalAuth } from '../../core/config/auth.middleware';
import { AppError } from '../../core/config/error.handler';

const router = Router();
const prisma = PrismaService.getInstance();

// GET /api/daily — Today's Daily battle
router.get('/', optionalAuth, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        let battle = await prisma.dailyBattle.findFirst({
            orderBy: { date: 'desc' },
            include: {
                markets: {
                    include: {
                        market: {
                            select: { id: true, title: true, yesPrice: true, noPrice: true, source: true, image: true, closesAt: true, expiry: true, status: true, category: true },
                        },
                    },
                    orderBy: { position: 'asc' },
                },
            },
        });

        if (!battle) {
            // Auto-generate today's battle if it doesn't exist
            const unfeaturedMarkets = await prisma.market.findMany({
                where: {
                    status: 'active',
                    resolved: false,
                    aiPredictions: { none: {} },
                },
            });

            if (unfeaturedMarkets.length < 10) {
                return res.json({ message: 'Not enough active markets to generate a daily battle today', markets: [] });
            }

            // Shuffle and pick 36
            const shuffled = unfeaturedMarkets.sort(() => 0.5 - Math.random());
            const numMarkets = 36;
            const selectedMarkets = shuffled.slice(0, numMarkets);

            battle = await prisma.dailyBattle.create({
                data: {
                    date: today,
                    status: 'active',
                    markets: {
                        create: selectedMarkets.map((m, idx) => ({
                            marketId: m.id,
                            position: idx + 1,
                            homerPrediction: Math.random() > 0.5 ? 'YES' : 'NO',
                            homerConfidence: Math.floor(Math.random() * 41) + 50, // 50 to 90
                            homerCommentary: 'Homer Baba sees this outcome clearly in the decentralized stars.',
                        })),
                    },
                },
                include: {
                    markets: {
                        include: {
                            market: {
                                select: { id: true, title: true, yesPrice: true, noPrice: true, source: true, image: true, closesAt: true, expiry: true, status: true, category: true },
                            },
                        },
                        orderBy: { position: 'asc' },
                    },
                },
            });
        }

        // Get user predictions if logged in
        let userPredictions: any[] = [];
        if (req.user) {
            userPredictions = await prisma.userDailyPrediction.findMany({
                where: {
                    userId: req.user.wallet,
                    dailyBattleMarketId: { in: battle.markets.map(m => m.id) },
                },
            });
        }

        const userPredMap = new Map(userPredictions.map(p => [p.dailyBattleMarketId, p.prediction]));

        res.json({
            id: battle.id,
            date: battle.date,
            status: battle.status,
            markets: battle.markets.map(m => ({
                id: m.id,
                position: m.position,
                market: {
                    id: m.market.id,
                    question: m.market.title,
                    yes_price: m.market.yesPrice,
                    no_price: m.market.noPrice,
                    source: m.market.source,
                    image_url: m.market.image,
                    closes_at: m.market.closesAt || m.market.expiry,
                    status: m.market.status,
                    category: m.market.category,
                },
                homer_prediction: m.homerPrediction,
                homer_confidence: m.homerConfidence,
                homer_commentary: m.homerCommentary,
                result: m.result,
                user_prediction: userPredMap.get(m.id) || null,
            })),
            user_stats: {
                participated: userPredictions.length > 0,
                predictions_made: userPredictions.length,
            },
        });
    } catch (err) {
        next(err);
    }
});

// POST /api/daily/predict — Submit predictions for today's Daily
router.post('/predict', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const schema = z.object({
            predictions: z.array(z.object({
                daily_battle_market_id: z.string(),
                prediction: z.enum(['YES', 'NO']),
            })).min(1),
        });
        const { predictions } = schema.parse(req.body);
        const wallet = req.user!.wallet;

        // Check user hasn't already submitted
        const existingCount = await prisma.userDailyPrediction.count({
            where: {
                userId: wallet,
                dailyBattleMarketId: { in: predictions.map(p => p.daily_battle_market_id) },
            },
        });
        if (existingCount > 0) throw new AppError('Already submitted predictions for today', 409);

        // Create all predictions
        await prisma.userDailyPrediction.createMany({
            data: predictions.map(p => ({
                userId: wallet,
                dailyBattleMarketId: p.daily_battle_market_id,
                prediction: p.prediction,
            })),
        });

        // Award +10 XP
        await prisma.$transaction([
            prisma.xPTransaction.create({
                data: { walletAddress: wallet, amount: 10, reason: 'daily_participation' },
            }),
            prisma.user.update({
                where: { walletAddress: wallet },
                data: { xpTotal: { increment: 10 } },
            }),
        ]);

        res.json({
            success: true,
            predictions_submitted: 5,
            xp_awarded: 10,
            message: 'Predictions submitted! Check back when markets resolve.',
        });
    } catch (err) {
        next(err);
    }
});

// GET /api/daily/scoreboard — AI vs Community scoreboard
router.get('/scoreboard', async (_req: Request, res: Response, next: NextFunction) => {
    try {
        const [homerWins, homerTotal, communityWins, communityTotal] = await Promise.all([
            prisma.dailyBattleMarket.count({ where: { result: 'WIN' } }),
            prisma.dailyBattleMarket.count({ where: { result: { in: ['WIN', 'LOSS'] } } }),
            prisma.userDailyPrediction.count({ where: { result: 'WIN' } }),
            prisma.userDailyPrediction.count({ where: { result: { in: ['WIN', 'LOSS'] } } }),
        ]);

        res.json({
            all_time: {
                homer_baba: {
                    total_predictions: homerTotal,
                    wins: homerWins,
                    losses: homerTotal - homerWins,
                    accuracy: homerTotal > 0 ? homerWins / homerTotal : 0,
                },
                community: {
                    total_predictions: communityTotal,
                    wins: communityWins,
                    losses: communityTotal - communityWins,
                    accuracy: communityTotal > 0 ? communityWins / communityTotal : 0,
                },
                homer_advantage: homerTotal > 0 && communityTotal > 0
                    ? (homerWins / homerTotal) - (communityWins / communityTotal) : 0,
            },
        });
    } catch (err) {
        next(err);
    }
});

// GET /api/daily/user/stats — Personal performance vs Homer Baba
router.get('/user/stats', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const wallet = req.user!.wallet;
        const userPredictions = await prisma.userDailyPrediction.findMany({
            where: { userId: wallet, result: { in: ['WIN', 'LOSS'] } },
        });

        const wins = userPredictions.filter(p => p.result === 'WIN').length;
        const total = userPredictions.length;

        // Count distinct battles participated in
        const battlesParticipated = await prisma.userDailyPrediction.findMany({
            where: { userId: wallet },
            select: { dailyBattleMarket: { select: { dailyBattleId: true } } },
            distinct: ['dailyBattleMarketId'],
        });
        const uniqueBattles = new Set(battlesParticipated.map(p => p.dailyBattleMarket.dailyBattleId)).size;

        res.json({
            total_battles_participated: uniqueBattles,
            total_predictions: total,
            wins,
            losses: total - wins,
            accuracy: total > 0 ? wins / total : 0,
        });
    } catch (err) {
        next(err);
    }
});

// GET /api/daily/leaderboard — Top users in Daily 5
router.get('/leaderboard', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { limit = '50' } = req.query;

        // Aggregate user daily prediction wins
        const results = await prisma.userDailyPrediction.groupBy({
            by: ['userId'],
            where: { result: { in: ['WIN', 'LOSS'] } },
            _count: { _all: true },
        });

        // Get win counts separately
        const winResults = await prisma.userDailyPrediction.groupBy({
            by: ['userId'],
            where: { result: 'WIN' },
            _count: { _all: true },
        });

        const winMap = new Map(winResults.map(r => [r.userId, r._count._all]));

        const leaderboard = results
            .map(r => ({
                userId: r.userId,
                total: r._count._all,
                wins: winMap.get(r.userId) || 0,
                accuracy: r._count._all > 0 ? (winMap.get(r.userId) || 0) / r._count._all : 0,
            }))
            .sort((a, b) => b.accuracy - a.accuracy || b.wins - a.wins)
            .slice(0, Number(limit));

        // Fetch user details
        const userIds = leaderboard.map(l => l.userId);
        const users = await prisma.user.findMany({
            where: { walletAddress: { in: userIds } },
            select: { walletAddress: true, username: true, avatarUrl: true, xpTotal: true },
        });
        const userMap = new Map(users.map(u => [u.walletAddress, u]));

        res.json({
            leaderboard: leaderboard.map((l, idx) => {
                const user = userMap.get(l.userId);
                return {
                    rank: idx + 1,
                    user: {
                        id: l.userId,
                        username: user?.username,
                        avatar_url: user?.avatarUrl,
                        rank_badge: getRankBadge(user?.xpTotal || 0),
                    },
                    total_correct: l.wins,
                    accuracy: l.accuracy,
                };
            }),
        });
    } catch (err) {
        next(err);
    }
});

function getRankBadge(xpTotal: number): string {
    if (xpTotal >= 50001) return 'Legendary Baba';
    if (xpTotal >= 10001) return 'Grand Oracle';
    if (xpTotal >= 2001) return 'Oracle Prophet';
    if (xpTotal >= 501) return 'Market Caller';
    if (xpTotal >= 101) return 'Degen Prophet';
    return 'Apprentice Prophet';
}

export { router as dailyRouter };
