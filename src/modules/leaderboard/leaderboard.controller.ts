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

// GET /leaderboard/xp — XP leaders (all users including zero-score)
leaderboardRouter.get('/xp', optionalAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { timeframe = 'all_time', limit = '100' } = req.query;
    const maxResults = Number(limit);
    const now = new Date();
    let leaderboard: any[];

    // Fetch ALL users for merging zero-score users
    const allUsers = await prisma.user.findMany({
      select: { walletAddress: true, username: true, avatarUrl: true, xpTotal: true, createdAt: true },
    });

    if (timeframe === 'daily') {
      // Daily: XP earned today from XP transactions
      const dayStart = new Date(now); dayStart.setUTCHours(0, 0, 0, 0);
      const dailyXP = await prisma.xPTransaction.groupBy({
        by: ['walletAddress'],
        where: { createdAt: { gte: dayStart } },
        _sum: { amount: true },
      });
      const xpMap = new Map(dailyXP.map(x => [x.walletAddress, x._sum.amount || 0]));

      const entries = allUsers.map(u => ({
        ...u,
        periodXP: xpMap.get(u.walletAddress) || 0,
      }));

      const scorers = entries.filter(e => e.periodXP > 0).sort((a, b) => b.periodXP - a.periodXP);
      const nonScorers = entries.filter(e => e.periodXP === 0).sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
      leaderboard = [...scorers, ...nonScorers].slice(0, maxResults);

    } else if (timeframe === 'weekly') {
      // Weekly: Accumulated XP from last 7 days
      const weekStart = new Date(now); weekStart.setDate(now.getDate() - 7);
      const weeklyXP = await prisma.xPTransaction.groupBy({
        by: ['walletAddress'],
        where: { createdAt: { gte: weekStart } },
        _sum: { amount: true },
      });
      const xpMap = new Map(weeklyXP.map(x => [x.walletAddress, x._sum.amount || 0]));

      const entries = allUsers.map(u => ({
        ...u,
        periodXP: xpMap.get(u.walletAddress) || 0,
      }));

      const scorers = entries.filter(e => e.periodXP > 0).sort((a, b) => b.periodXP - a.periodXP);
      const nonScorers = entries.filter(e => e.periodXP === 0).sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
      leaderboard = [...scorers, ...nonScorers].slice(0, maxResults);

    } else if (timeframe === 'monthly') {
      // Monthly: Accumulated XP from last 30 days
      const monthStart = new Date(now); monthStart.setMonth(now.getMonth() - 1);
      const monthlyXP = await prisma.xPTransaction.groupBy({
        by: ['walletAddress'],
        where: { createdAt: { gte: monthStart } },
        _sum: { amount: true },
      });
      const xpMap = new Map(monthlyXP.map(x => [x.walletAddress, x._sum.amount || 0]));

      const entries = allUsers.map(u => ({
        ...u,
        periodXP: xpMap.get(u.walletAddress) || 0,
      }));

      const scorers = entries.filter(e => e.periodXP > 0).sort((a, b) => b.periodXP - a.periodXP);
      const nonScorers = entries.filter(e => e.periodXP === 0).sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
      leaderboard = [...scorers, ...nonScorers].slice(0, maxResults);

    } else {
      // all_time: Total XP, zero-score at bottom by createdAt
      const scorers = allUsers.filter(u => u.xpTotal > 0).sort((a, b) => b.xpTotal - a.xpTotal);
      const nonScorers = allUsers.filter(u => u.xpTotal === 0).sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
      leaderboard = [...scorers, ...nonScorers].slice(0, maxResults);
    }

    // Find current user rank via Redis sorted set
    let currentUserRank = null;
    if (req.user) {
      currentUserRank = await leaderboardService.getUserXPRank(req.user.wallet);
    }

    const usePeriodXP = timeframe !== 'all_time';

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
        xp: usePeriodXP ? (u.periodXP ?? u.xpTotal) : u.xpTotal,
      })),
      current_user_rank: currentUserRank,
    });
  } catch (err) {
    next(err);
  }
});

// GET /leaderboard/accuracy — Top predictors by win rate (all users including zero-accuracy)
leaderboardRouter.get('/accuracy', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { limit = '100', timeframe = 'all_time' } = req.query;
    const maxResults = Number(limit);
    const now = new Date();

    // Fetch ALL users
    const allUsers = await prisma.user.findMany({
      select: { walletAddress: true, username: true, avatarUrl: true, currentStreak: true, xpTotal: true, createdAt: true },
    });
    const allWallets = allUsers.map(u => u.walletAddress);

    // Build date filter for positions based on timeframe
    let dateFilter: any = {};
    if (timeframe === 'daily') {
      const dayStart = new Date(now); dayStart.setUTCHours(0, 0, 0, 0);
      dateFilter = { updatedAt: { gte: dayStart } };
    } else if (timeframe === 'weekly') {
      const weekStart = new Date(now); weekStart.setDate(now.getDate() - 7);
      dateFilter = { updatedAt: { gte: weekStart } };
    } else if (timeframe === 'monthly') {
      const monthStart = new Date(now); monthStart.setMonth(now.getMonth() - 1);
      dateFilter = { updatedAt: { gte: monthStart } };
    }
    // all_time: no date filter

    // Get win/loss counts for all users within the time period
    const [posResults, winResults] = await Promise.all([
      prisma.position.groupBy({
        by: ['walletAddress'],
        where: { walletAddress: { in: allWallets }, status: { in: ['WON', 'LOST'] }, ...dateFilter },
        _count: { _all: true },
      }),
      prisma.position.groupBy({
        by: ['walletAddress'],
        where: { walletAddress: { in: allWallets }, status: 'WON', ...dateFilter },
        _count: { _all: true },
      }),
    ]);
    const totalMap = new Map(posResults.map(r => [r.walletAddress, r._count._all]));
    const winMap = new Map(winResults.map(r => [r.walletAddress, r._count._all]));

    const entries = allUsers.map(u => {
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
    const sorted = [...scorers, ...nonScorers].slice(0, maxResults);

    res.json({
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
  } catch (err) {
    next(err);
  }
});