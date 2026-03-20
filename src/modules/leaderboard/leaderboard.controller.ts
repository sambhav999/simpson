import { Router, Request, Response, NextFunction } from 'express';
import { LeaderboardService } from './leaderboard.service';
import { PrismaService } from '../../core/config/prisma.service';
import { optionalAuth } from '../../core/config/auth.middleware';

export const leaderboardRouter = Router();
const leaderboardService = new LeaderboardService();
const prisma = PrismaService.getInstance();

function getRankBadge(xpTotal: number): string {
  if (xpTotal >= 50001) return 'Legendary Baba';
  if (xpTotal >= 10001) return 'Grand Oracle';
  if (xpTotal >= 2001) return 'Oracle Prophet';
  if (xpTotal >= 501) return 'Market Caller';
  if (xpTotal >= 101) return 'Degen Prophet';
  return 'Apprentice Prophet';
}

// GET /leaderboard — XP leaderboard (existing, enhanced)
leaderboardRouter.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { page, limit, sortBy } = req.query;
    const result = await leaderboardService.getLeaderboard({
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
      sortBy: sortBy as string | undefined,
    });
    res.json(result);
  } catch (error) {
    next(error);
  }
});

// GET /leaderboard/xp — XP leaders
leaderboardRouter.get('/xp', optionalAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { timeframe = 'all_time', limit = '100' } = req.query;

    const now = new Date();
    let leaderboard: any[];

    if (timeframe === 'daily') {
      // Daily: Show all users active today, sorted by XP desc; zero-XP users at bottom by FCFS (createdAt asc)
      const dayStart = new Date(now); dayStart.setUTCHours(0, 0, 0, 0);
      const dailyUsers = await prisma.user.findMany({
        where: { updatedAt: { gte: dayStart } },
        select: { walletAddress: true, username: true, avatarUrl: true, xpTotal: true, createdAt: true },
      });
      // Split into scorers (xp > 0) and non-scorers
      const scorers = dailyUsers.filter(u => u.xpTotal > 0).sort((a, b) => b.xpTotal - a.xpTotal);
      const nonScorers = dailyUsers.filter(u => u.xpTotal === 0).sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
      leaderboard = [...scorers, ...nonScorers].slice(0, Number(limit));
    } else if (timeframe === 'all_time') {
      leaderboard = await prisma.user.findMany({
        orderBy: { xpTotal: 'desc' },
        take: Number(limit),
        select: { walletAddress: true, username: true, avatarUrl: true, xpTotal: true, createdAt: true },
      });
    } else {
      // weekly / monthly: Aggregate XP from transactions in the period
      let dateFilter: any = {};
      if (timeframe === 'weekly') {
        const start = new Date(now); start.setDate(now.getDate() - 7);
        dateFilter = { createdAt: { gte: start } };
      } else if (timeframe === 'monthly') {
        const start = new Date(now); start.setMonth(now.getMonth() - 1);
        dateFilter = { createdAt: { gte: start } };
      }
      const xpByUser = await prisma.xPTransaction.groupBy({
        by: ['walletAddress'],
        where: dateFilter,
        _sum: { amount: true },
        orderBy: { _sum: { amount: 'desc' } },
        take: Number(limit),
      });
      const userIds = xpByUser.map(x => x.walletAddress);
      const users = await prisma.user.findMany({
        where: { walletAddress: { in: userIds } },
        select: { walletAddress: true, username: true, avatarUrl: true, xpTotal: true },
      });
      const userMap = new Map(users.map(u => [u.walletAddress, u]));
      leaderboard = xpByUser.map(x => ({
        ...userMap.get(x.walletAddress),
        periodXP: x._sum.amount || 0,
      }));
    }

    // Find current user rank via Redis sorted set
    let currentUserRank = null;
    if (req.user) {
      currentUserRank = await leaderboardService.getUserXPRank(req.user.wallet);
    }

    res.json({
      total_players: leaderboard.length,
      leaderboard: leaderboard.map((u: any, idx: number) => ({
        rank: idx + 1,
        user: {
          id: u.walletAddress,
          username: u.username,
          avatar_url: u.avatarUrl,
          xp_total: u.xpTotal,
          rank_badge: getRankBadge(u.xpTotal || 0),
        },
        xp: timeframe === 'all_time' || timeframe === 'daily' ? u.xpTotal : u.periodXP,
      })),
      current_user_rank: currentUserRank,
    });
  } catch (err) {
    next(err);
  }
});

// GET /leaderboard/accuracy — Top predictors by win rate
leaderboardRouter.get('/accuracy', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { min_predictions = '0', limit = '100', timeframe = 'all_time' } = req.query;
    const minPreds = Number(min_predictions);
    const now = new Date();

    if (timeframe === 'daily') {
      // Daily: Show ALL users active today + their accuracy, zero-accuracy at bottom by FCFS
      const dayStart = new Date(now); dayStart.setUTCHours(0, 0, 0, 0);
      const dailyUsers = await prisma.user.findMany({
        where: { updatedAt: { gte: dayStart } },
        select: { walletAddress: true, username: true, avatarUrl: true, currentStreak: true, xpTotal: true, createdAt: true },
      });
      const allWallets = dailyUsers.map(u => u.walletAddress);

      // Get win/loss counts for daily users
      const [posResults, winResults] = await Promise.all([
        prisma.position.groupBy({
          by: ['walletAddress'],
          where: { walletAddress: { in: allWallets }, status: { in: ['WON', 'LOST'] } },
          _count: { _all: true },
        }),
        prisma.position.groupBy({
          by: ['walletAddress'],
          where: { walletAddress: { in: allWallets }, status: 'WON' },
          _count: { _all: true },
        }),
      ]);
      const totalMap = new Map(posResults.map(r => [r.walletAddress, r._count._all]));
      const winMap = new Map(winResults.map(r => [r.walletAddress, r._count._all]));

      const entries = dailyUsers.map(u => {
        const total = totalMap.get(u.walletAddress) || 0;
        const wins = winMap.get(u.walletAddress) || 0;
        return {
          wallet: u.walletAddress, user: u,
          total, wins, losses: total - wins,
          winRate: total > 0 ? wins / total : 0,
          createdAt: u.createdAt,
        };
      });

      // Scorers (have resolved predictions) sorted by winRate desc, then non-scorers by FCFS
      const scorers = entries.filter(e => e.total > 0).sort((a, b) => b.winRate - a.winRate);
      const nonScorers = entries.filter(e => e.total === 0).sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
      const sorted = [...scorers, ...nonScorers].slice(0, Number(limit));

      return res.json({
        total_players: sorted.length,
        leaderboard: sorted.map((l, idx) => ({
          rank: idx + 1,
          user: { id: l.wallet, username: l.user.username, avatar_url: l.user.avatarUrl },
          win_rate: l.winRate,
          total_predictions: l.total,
          wins: l.wins,
          losses: l.losses,
          current_streak: l.user.currentStreak || 0,
        })),
      });
    }

    // Non-daily timeframes: original logic
    let dateFilter: any = {};
    if (timeframe === 'weekly') {
      const start = new Date(now); start.setDate(now.getDate() - 7);
      dateFilter = { updatedAt: { gte: start } };
    } else if (timeframe === 'monthly') {
      const start = new Date(now); start.setMonth(now.getMonth() - 1);
      dateFilter = { updatedAt: { gte: start } };
    }

    const results = await prisma.position.groupBy({
      by: ['walletAddress'],
      where: { status: { in: ['WON', 'LOST'] }, ...dateFilter },
      _count: { _all: true },
    });
    const qualified = results.filter(r => r._count._all >= minPreds);
    const wallets = qualified.map(r => r.walletAddress);

    const winCounts = await prisma.position.groupBy({
      by: ['walletAddress'],
      where: { walletAddress: { in: wallets }, status: 'WON', ...dateFilter },
      _count: { _all: true },
    });
    const winMap = new Map(winCounts.map(w => [w.walletAddress, w._count._all]));
    const totalMap = new Map(qualified.map(q => [q.walletAddress, q._count._all]));

    const users = await prisma.user.findMany({
      where: { walletAddress: { in: wallets } },
      select: { walletAddress: true, username: true, avatarUrl: true, currentStreak: true, xpTotal: true },
    });
    const userMap = new Map(users.map(u => [u.walletAddress, u]));

    const leaderboard = wallets
      .map(w => ({
        wallet: w,
        wins: winMap.get(w) || 0,
        total: totalMap.get(w) || 0,
        winRate: (totalMap.get(w) || 0) > 0 ? (winMap.get(w) || 0) / (totalMap.get(w) || 0) : 0,
      }))
      .sort((a, b) => b.winRate - a.winRate)
      .slice(0, Number(limit));

    res.json({
      total_players: leaderboard.length,
      leaderboard: leaderboard.map((l, idx) => {
        const user = userMap.get(l.wallet);
        return {
          rank: idx + 1,
          user: { id: l.wallet, username: user?.username, avatar_url: user?.avatarUrl },
          win_rate: l.winRate,
          total_predictions: l.total,
          wins: l.wins,
          losses: l.total - l.wins,
          current_streak: user?.currentStreak || 0,
        };
      }),
    });
  } catch (err) {
    next(err);
  }
});