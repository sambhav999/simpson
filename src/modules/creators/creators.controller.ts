import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import crypto from 'crypto';
import { PrismaService } from '../../core/config/prisma.service';
import { requireAuth } from '../../core/config/auth.middleware';
import { AppError } from '../../core/config/error.handler';

const router = Router();
const prisma = PrismaService.getInstance();

function getRankBadge(xpTotal: number): string {
    if (xpTotal >= 50001) return 'Legendary Baba';
    if (xpTotal >= 10001) return 'Grand Oracle';
    if (xpTotal >= 2001) return 'Oracle Prophet';
    if (xpTotal >= 501) return 'Market Caller';
    if (xpTotal >= 101) return 'Degen Prophet';
    return 'Apprentice Prophet';
}

// POST /api/creators/host — Host a market
router.post('/host', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const schema = z.object({
            market_id: z.string(),
            caption: z.string().min(1).max(280),
        });
        const { market_id, caption } = schema.parse(req.body);
        const wallet = req.user!.wallet;

        const market = await prisma.market.findUnique({ where: { id: market_id } });
        if (!market) throw new AppError('Market not found', 404);

        // Generate unique referral code
        const referralCode = crypto.randomBytes(4).toString('hex').slice(0, 8);

        const creatorMarket = await prisma.creatorMarket.create({
            data: {
                creatorId: wallet,
                marketId: market_id,
                caption,
                referralCode,
            },
        });

        // Award +25 XP
        await prisma.$transaction([
            prisma.xPTransaction.create({
                data: { walletAddress: wallet, amount: 25, reason: 'market_hosted', metadata: { market_id } },
            }),
            prisma.user.update({
                where: { walletAddress: wallet },
                data: { xpTotal: { increment: 25 } },
            }),
        ]);

        res.status(201).json({
            id: creatorMarket.id,
            market_id: creatorMarket.marketId,
            caption: creatorMarket.caption,
            referral_code: creatorMarket.referralCode,
            referral_url: `https://simpredicts.com/m/${creatorMarket.referralCode}`,
            hosted_at: creatorMarket.hostedAt,
        });
    } catch (err) {
        next(err);
    }
});

// GET /api/creators/:id — Creator profile
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const user = await prisma.user.findUnique({
            where: { walletAddress: req.params.id },
            include: {
                _count: {
                    select: {
                        followers: true,
                        following: true,
                        creatorMarkets: true,
                    },
                },
            },
        });
        if (!user) throw new AppError('Creator not found', 404);

        // Calculate accuracy
        const positions = await prisma.position.findMany({
            where: { walletAddress: req.params.id, status: { in: ['WON', 'LOST'] } },
        });
        const wins = positions.filter(p => p.status === 'WON').length;
        const accuracy = positions.length > 0 ? wins / positions.length : 0;

        res.json({
            id: user.walletAddress,
            wallet_address: user.walletAddress,
            username: user.username,
            bio: user.bio,
            avatar_url: user.avatarUrl,
            xp_total: user.xpTotal,
            rank: getRankBadge(user.xpTotal),
            followers_count: user._count.followers,
            following_count: user._count.following,
            markets_hosted: user._count.creatorMarkets,
            accuracy,
            created_at: user.createdAt,
        });
    } catch (err) {
        next(err);
    }
});

// GET /api/creators/:id/markets — Markets hosted by creator
router.get('/:id/markets', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { status, limit = '20', offset = '0' } = req.query;

        const where: any = { creatorId: req.params.id };
        if (status === 'active') where.market = { resolved: false };
        if (status === 'resolved') where.market = { resolved: true };

        const markets = await prisma.creatorMarket.findMany({
            where,
            include: {
                market: { select: { id: true, title: true, yesPrice: true, noPrice: true, volume: true, closesAt: true, resolved: true, source: true } },
            },
            orderBy: { hostedAt: 'desc' },
            take: Number(limit),
            skip: Number(offset),
        });

        // Get click/conversion counts from attributions
        const results = await Promise.all(markets.map(async (cm) => {
            const [clicks, conversions] = await Promise.all([
                prisma.attribution.count({ where: { referralCode: cm.referralCode } }),
                prisma.attribution.count({ where: { referralCode: cm.referralCode, converted: true } }),
            ]);
            return {
                id: cm.id,
                market: cm.market,
                caption: cm.caption,
                referral_code: cm.referralCode,
                hosted_at: cm.hostedAt,
                clicks,
                conversions,
            };
        }));

        res.json({ markets: results });
    } catch (err) {
        next(err);
    }
});

// GET /api/creators/:id/stats — Creator analytics
router.get('/:id/stats', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const creatorId = req.params.id;
        const [marketsHosted, totalClicks, totalConversions, followersCount, user] = await Promise.all([
            prisma.creatorMarket.count({ where: { creatorId } }),
            prisma.attribution.count({ where: { creatorId } }),
            prisma.attribution.count({ where: { creatorId, converted: true } }),
            prisma.follow.count({ where: { followingId: creatorId } }),
            prisma.user.findUnique({ where: { walletAddress: creatorId }, select: { xpTotal: true } }),
        ]);

        res.json({
            markets_hosted: marketsHosted,
            total_clicks: totalClicks,
            total_conversions: totalConversions,
            conversion_rate: totalClicks > 0 ? totalConversions / totalClicks : 0,
            followers: followersCount,
            xp_total: user?.xpTotal || 0,
            rank: getRankBadge(user?.xpTotal || 0),
        });
    } catch (err) {
        next(err);
    }
});

export { router as creatorsRouter };
