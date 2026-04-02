import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { PrismaService } from '../../core/config/prisma.service';
import { requireAuth, optionalAuth } from '../../core/config/auth.middleware';

const commentsRouter = Router();
const followRouter = Router();
const feedRouter = Router();
const prisma = PrismaService.getInstance();

// ─── Comments ───────────────────────────────────────────────────────

// POST /api/comments — Create comment
commentsRouter.post('/', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const schema = z.object({
            market_id: z.string(),
            text: z.string().min(1).max(500),
            parent_id: z.string().optional(),
        });
        const { market_id, text, parent_id } = schema.parse(req.body);
        const wallet = req.user!.wallet;

        const comment = await prisma.comment.create({
            data: {
                userId: wallet,
                marketId: market_id,
                text,
                parentId: parent_id ?? null,
            },
            include: {
                user: { select: { walletAddress: true, username: true, avatarUrl: true, xpTotal: true } },
            },
        });

        // Award +5 XP
        await prisma.$transaction([
            prisma.xPTransaction.create({
                data: { walletAddress: wallet, amount: 5, reason: 'comment_posted', metadata: { market_id } },
            }),
            prisma.user.update({
                where: { walletAddress: wallet },
                data: { xpTotal: { increment: 5 } },
            }),
        ]);

        res.status(201).json({
            id: comment.id,
            user: {
                id: comment.user.walletAddress,
                username: comment.user.username,
                avatar_url: comment.user.avatarUrl,
                rank_badge: getRankBadge(comment.user.xpTotal),
            },
            market_id: comment.marketId,
            parent_id: comment.parentId,
            text: comment.text,
            upvotes: comment.upvotes,
            created_at: comment.createdAt,
        });
    } catch (err) {
        next(err);
    }
});

// GET /api/comments/market/:marketId — List comments with replies
commentsRouter.get('/market/:marketId', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { sort = 'newest', limit = '20', offset = '0' } = req.query;
        const orderBy: any = sort === 'top' ? { upvotes: 'desc' } : sort === 'oldest' ? { createdAt: 'asc' } : { createdAt: 'desc' };

        const comments = await prisma.comment.findMany({
            where: {
                marketId: req.params.marketId,
                OR: [
                    { parentId: null },
                    { parentId: { isSet: false } as any },
                ],
            },
            include: {
                user: { select: { walletAddress: true, username: true, avatarUrl: true, xpTotal: true } },
                replies: {
                    include: {
                        user: { select: { walletAddress: true, username: true, avatarUrl: true, xpTotal: true } },
                    },
                    orderBy: { createdAt: 'asc' },
                },
            },
            orderBy,
            take: Number(limit),
            skip: Number(offset),
        });

        res.json({
            comments: comments.map(c => ({
                id: c.id,
                user: { id: c.user.walletAddress, username: c.user.username, avatar_url: c.user.avatarUrl, rank_badge: getRankBadge(c.user.xpTotal) },
                text: c.text,
                upvotes: c.upvotes,
                created_at: c.createdAt,
                replies: c.replies.map(r => ({
                    id: r.id,
                    user: { id: r.user.walletAddress, username: r.user.username, avatar_url: r.user.avatarUrl, rank_badge: getRankBadge(r.user.xpTotal) },
                    text: r.text,
                    upvotes: r.upvotes,
                    created_at: r.createdAt,
                })),
            })),
        });
    } catch (err) {
        next(err);
    }
});

// POST /api/comments/:id/upvote
commentsRouter.post('/:id/upvote', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const comment = await prisma.comment.update({
            where: { id: req.params.id },
            data: { upvotes: { increment: 1 } },
        });

        // Award +5 XP to comment author (max 50/day handled by checking ledger)
        if (comment.userId !== req.user!.wallet) {
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const todayXP = await prisma.xPTransaction.aggregate({
                where: { walletAddress: comment.userId, reason: 'comment_upvoted', createdAt: { gte: today } },
                _sum: { amount: true },
            });
            if ((todayXP._sum.amount || 0) < 50) {
                await prisma.$transaction([
                    prisma.xPTransaction.create({
                        data: { walletAddress: comment.userId, amount: 5, reason: 'comment_upvoted' },
                    }),
                    prisma.user.update({
                        where: { walletAddress: comment.userId },
                        data: { xpTotal: { increment: 5 } },
                    }),
                ]);
            }
        }

        res.json({ comment_id: comment.id, upvotes: comment.upvotes });
    } catch (err) {
        next(err);
    }
});

// ─── Follow ─────────────────────────────────────────────────────────

// POST /api/follow — Follow user
followRouter.post('/', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { following_id } = z.object({ following_id: z.string() }).parse(req.body);
        const wallet = req.user!.wallet;

        if (wallet === following_id) {
            return res.status(400).json({ error: 'Cannot follow yourself' });
        }

        const follow = await prisma.follow.create({
            data: { followerId: wallet, followingId: following_id },
        });

        // Award +25 XP to followed user
        await prisma.$transaction([
            prisma.xPTransaction.create({
                data: { walletAddress: following_id, amount: 25, reason: 'new_follower', metadata: { follower: wallet } },
            }),
            prisma.user.update({
                where: { walletAddress: following_id },
                data: { xpTotal: { increment: 25 } },
            }),
        ]);

        res.status(201).json({
            follower_id: follow.followerId,
            following_id: follow.followingId,
            created_at: follow.createdAt,
        });
    } catch (err) {
        next(err);
    }
});

// DELETE /api/follow/:userId — Unfollow
followRouter.delete('/:userId', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
    try {
        await prisma.follow.delete({
            where: {
                followerId_followingId: {
                    followerId: req.user!.wallet,
                    followingId: req.params.userId,
                },
            },
        });
        res.json({ success: true });
    } catch (err) {
        next(err);
    }
});

// ─── Activity Feed ──────────────────────────────────────────────────

// GET /api/feed — Activity feed from followed users
feedRouter.get('/', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { limit = '20', offset = '0' } = req.query;
        const wallet = req.user!.wallet;

        // Get users this person follows
        const follows = await prisma.follow.findMany({
            where: { followerId: wallet },
            select: { followingId: true },
        });
        const followingIds = follows.map(f => f.followingId);

        if (followingIds.length === 0) {
            return res.json({ activities: [] });
        }

        // Get recent XP transactions as activities
        const activities = await prisma.xPTransaction.findMany({
            where: { walletAddress: { in: followingIds } },
            include: {
                user: { select: { walletAddress: true, username: true, avatarUrl: true } },
            },
            orderBy: { createdAt: 'desc' },
            take: Number(limit),
            skip: Number(offset),
        });

        res.json({
            activities: activities.map(a => ({
                id: a.id,
                type: a.reason,
                user: { id: a.user.walletAddress, username: a.user.username, avatar_url: a.user.avatarUrl },
                metadata: a.metadata,
                created_at: a.createdAt,
            })),
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

export { commentsRouter, followRouter, feedRouter };
