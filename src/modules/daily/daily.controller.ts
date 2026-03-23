import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { PrismaService } from '../../core/config/prisma.service';
import { RedisService } from '../../core/config/redis.service';
import { requireAuth, optionalAuth } from '../../core/config/auth.middleware';
import { logger } from '../../core/logger/logger';
import { AppError } from '../../core/config/error.handler';

const router = Router();
const prisma = PrismaService.getInstance();
const redis = RedisService.getInstance();
const CACHE_TTL = 300; // 5 minutes

// GET /api/daily — 3-tier Daily challenges
router.get('/', optionalAuth, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        // Fetch latest battle for "Today's Challenges"
        const latestBattle = await prisma.dailyBattle.findFirst({
            orderBy: { date: 'desc' },
            include: {
                markets: {
                    where: {
                        market: {
                            OR: [
                                { closesAt: { gt: today } },
                                { expiry: { gt: today } }
                            ]
                        }
                    },
                    include: {
                        market: {
                            select: { id: true, title: true, yesPrice: true, noPrice: true, source: true, image: true, closesAt: true, expiry: true, status: true, category: true },
                        },
                    },
                    orderBy: { position: 'asc' },
                },
            },
        });

        if (!latestBattle) {
            return res.json({ status: 'success', data: { todays_challenges: [], old_challenges: [], expired_challenges: [] } });
        }

        // Fetch user predictions for filtering/display
        let userPredictions: any[] = [];
        if (req.user) {
            userPredictions = await prisma.userDailyPrediction.findMany({
                where: { userId: req.user.wallet },
            });
        }
        const userPredMap = new Map(userPredictions.map(p => [
            p.dailyBattleMarketId, 
            { prediction: p.prediction, result: p.result }
        ]));

        // 1. Today's Challenges
        const todays = latestBattle.markets.map(m => ({
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
        }));

        // 2. Old Challenges (Active markets from previous battles)
        // Find all DailyBattleMarket IDs that are NOT in the latest battle
        const latestMarketIds = latestBattle.markets.map(m => m.id);
        const oldMarkets = await prisma.dailyBattleMarket.findMany({
            where: {
                id: { notIn: latestMarketIds },
                result: 'PENDING',
                market: {
                    status: 'active',
                    resolved: false,
                    OR: [
                        { closesAt: { gt: today } },
                        { expiry: { gt: today } }
                    ]
                }
            },
            include: {
                market: {
                    select: { id: true, title: true, yesPrice: true, noPrice: true, source: true, image: true, closesAt: true, expiry: true, status: true, category: true },
                }
            },
            orderBy: { dailyBattle: { date: 'desc' } },
            take: 100
        });

        const old = oldMarkets.map(m => ({
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
        }));

        // 3. Expired Challenges (Resolved battle markets)
        const expiredMarkets = await prisma.dailyBattleMarket.findMany({
            where: {
                result: { in: ['WIN', 'LOSS'] }
            },
            include: {
                market: {
                    select: { id: true, title: true, yesPrice: true, noPrice: true, source: true, image: true, closesAt: true, expiry: true, status: true, category: true },
                }
            },
            orderBy: { dailyBattle: { date: 'desc' } },
            take: 500
        });

        const expired = expiredMarkets.map(m => ({
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
        }));

        res.json({
            status: 'success',
            data: {
                todays_challenges: todays,
                old_challenges: old,
                expired_challenges: expired,
                user_stats: {
                    participated_today: userPredictions.some(p => latestMarketIds.includes(p.dailyBattleMarketId)),
                    total_participated: userPredictions.length
                }
            }
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
        const cacheKey = 'daily:scoreboard';
        const cached = await redis.get(cacheKey);
        if (cached) return res.json(JSON.parse(cached));

        const [homerWins, homerTotal, communityWins, communityTotal] = await Promise.all([
            prisma.dailyBattleMarket.count({ where: { result: 'WIN' } }),
            prisma.dailyBattleMarket.count({ where: { result: { in: ['WIN', 'LOSS'] } } }),
            prisma.userDailyPrediction.count({ where: { result: 'WIN' } }),
            prisma.userDailyPrediction.count({ where: { result: { in: ['WIN', 'LOSS'] } } }),
        ]);

        const result = {
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
        };

        await redis.setex(cacheKey, CACHE_TTL, JSON.stringify(result));
        res.json(result);
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
        const cacheKey = `daily:leaderboard:${limit}`;
        const cached = await redis.get(cacheKey);
        if (cached) return res.json(JSON.parse(cached));

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

        const result = {
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
        };

        await redis.setex(cacheKey, CACHE_TTL, JSON.stringify(result));
        res.json(result);
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
