import { Router, Request, Response, NextFunction } from 'express';
import { LeaderboardService } from './leaderboard.service';
import { PrismaService } from '../../core/config/prisma.service';
import { optionalAuth } from '../../core/config/auth.middleware';

export const leaderboardRouter = Router();
const leaderboardService = new LeaderboardService();
const prisma = PrismaService.getInstance();

type XPLeaderboardTimeframe = 'daily' | 'weekly' | 'monthly' | 'all_time';

function getRankBadge(xpTotal: number): string {
  if (xpTotal >= 50001) return 'Legendary Baba';
  if (xpTotal >= 10001) return 'Grand Oracle';
  if (xpTotal >= 2001) return 'Oracle Prophet';
  if (xpTotal >= 501) return 'Market Caller';
  if (xpTotal >= 101) return 'Degen Prophet';
  return 'Apprentice Prophet';
}

function getAccuracyStatus(winRate: number, totalPredictions: number): string {
  if (totalPredictions === 0) return 'Unranked Seer';
  if (winRate >= 0.9) return 'Mythic Forecaster';
  if (winRate >= 0.8) return 'Elite Oracle';
  if (winRate >= 0.7) return 'Sharp Prophet';
  if (winRate >= 0.6) return 'Skilled Predictor';
  if (winRate >= 0.5) return 'Rising Analyst';
  return 'Learning Apprentice';
}

function normalizeXPTimeframe(value: string): XPLeaderboardTimeframe {
  if (value === 'daily' || value === 'weekly' || value === 'monthly') {
    return value;
  }
  return 'all_time';
}

function getTimeframeStart(now: Date, timeframe: Exclude<XPLeaderboardTimeframe, 'all_time'>): Date {
  const start = new Date(now);

  if (timeframe === 'daily') {
    start.setUTCHours(0, 0, 0, 0);
    return start;
  }

  if (timeframe === 'weekly') {
    start.setUTCDate(now.getUTCDate() - 7);
    return start;
  }

  start.setUTCMonth(now.getUTCMonth() - 1);
  return start;
}

// GET /leaderboard — XP leaderboard (existing, enhanced)
leaderboardRouter.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { page, limit, sortBy, timeframe } = req.query;
    const result = await leaderboardService.getLeaderboard({
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
      sortBy: sortBy as string | undefined,
      timeframe: timeframe as string | undefined,
    });
    res.json(result);
  } catch (error) {
    next(error);
  }
});

// GET /leaderboard/xp — XP leaders (all users including zero-score)
leaderboardRouter.get('/xp', optionalAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const timeframe = normalizeXPTimeframe(String(req.query.timeframe || 'all_time'));
    const { limit = '100' } = req.query;
    const maxResults = Number(limit);
    const now = new Date();
    let fullLeaderboard: any[];

    // Fetch ALL users for merging zero-score users
    const allUsers = await prisma.user.findMany({
      select: { walletAddress: true, username: true, avatarUrl: true, xpTotal: true, createdAt: true },
    });

    if (timeframe === 'all_time') {
      // all_time: Total XP, zero-score at bottom by createdAt
      const scorers = allUsers.filter(u => u.xpTotal > 0).sort((a, b) => b.xpTotal - a.xpTotal);
      const nonScorers = allUsers.filter(u => u.xpTotal === 0).sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
      fullLeaderboard = [...scorers, ...nonScorers];
    } else {
      const start = getTimeframeStart(now, timeframe);
      const [periodXP, loginLedger] = await Promise.all([
        prisma.xPTransaction.groupBy({
          by: ['walletAddress'],
          where: { createdAt: { gte: start } },
          _sum: { amount: true },
        }),
        prisma.authLogin.findMany({
          where: { createdAt: { gte: start } },
          orderBy: { createdAt: 'asc' },
          select: { walletAddress: true, createdAt: true },
        }),
      ]);

      const xpMap = new Map<string, number>(
        periodXP.map((x) => [x.walletAddress, Number(x._sum.amount || 0)])
      );
      const firstLoginMap = new Map<string, Date>();
      for (const login of loginLedger) {
        if (!firstLoginMap.has(login.walletAddress)) {
          firstLoginMap.set(login.walletAddress, login.createdAt);
        }
      }

      const entries = allUsers
        .filter((u) => firstLoginMap.has(u.walletAddress))
        .map((u) => ({
          ...u,
          periodXP: xpMap.get(u.walletAddress) || 0,
          firstLoginAt: firstLoginMap.get(u.walletAddress)!,
        }));

      const scorers = entries
        .filter((e) => e.periodXP > 0)
        .sort((a, b) => b.periodXP - a.periodXP || a.firstLoginAt.getTime() - b.firstLoginAt.getTime());
      const nonScorers = entries
        .filter((e) => e.periodXP === 0)
        .sort((a, b) => a.firstLoginAt.getTime() - b.firstLoginAt.getTime());

      fullLeaderboard = [...scorers, ...nonScorers];
    }

    const leaderboard = fullLeaderboard.slice(0, maxResults);

    // Find current user rank via Redis sorted set
    let currentUserRank = null;
    if (req.user && timeframe === 'all_time') {
      currentUserRank = await leaderboardService.getUserXPRank(req.user.wallet);
    }
    if (req.user && timeframe !== 'all_time') {
      const fullRank = fullLeaderboard.findIndex((u: any) => u.walletAddress === req.user!.wallet);
      currentUserRank = fullRank === -1 ? null : fullRank + 1;
    }

    const usePeriodXP = timeframe !== 'all_time';
    const showStatus = timeframe === 'all_time';

    res.json({
      total_players: fullLeaderboard.length,
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
        status: showStatus ? getRankBadge(u.xpTotal || 0) : null,
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
    const { limit = '100' } = req.query;
    const timeframe = normalizeXPTimeframe(String(req.query.timeframe || 'all_time'));
    const maxResults = Number(limit);
    const now = new Date();

    // Fetch ALL users
    const allUsers = await prisma.user.findMany({
      select: { walletAddress: true, username: true, avatarUrl: true, currentStreak: true, xpTotal: true, createdAt: true },
    });
    let eligibleUsers = allUsers;
    let firstLoginMap = new Map<string, Date>();

    if (timeframe !== 'all_time') {
      const start = getTimeframeStart(now, timeframe);
      const loginLedger = await prisma.authLogin.findMany({
        where: { createdAt: { gte: start } },
        orderBy: { createdAt: 'asc' },
        select: { walletAddress: true, createdAt: true },
      });

      for (const login of loginLedger) {
        if (!firstLoginMap.has(login.walletAddress)) {
          firstLoginMap.set(login.walletAddress, login.createdAt);
        }
      }

      eligibleUsers = allUsers.filter((u) => firstLoginMap.has(u.walletAddress));
    }

    const eligibleWallets = eligibleUsers.map(u => u.walletAddress);

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
        where: { walletAddress: { in: eligibleWallets }, status: { in: ['WON', 'LOST'] }, ...dateFilter },
        _count: { _all: true },
      }),
      prisma.position.groupBy({
        by: ['walletAddress'],
        where: { walletAddress: { in: eligibleWallets }, status: 'WON', ...dateFilter },
        _count: { _all: true },
      }),
    ]);
    const totalMap = new Map(posResults.map(r => [r.walletAddress, r._count._all]));
    const winMap = new Map(winResults.map(r => [r.walletAddress, r._count._all]));

    const entries = eligibleUsers.map(u => {
      const total = totalMap.get(u.walletAddress) || 0;
      const wins = winMap.get(u.walletAddress) || 0;
      return {
        wallet: u.walletAddress, user: u,
        total, wins, losses: total - wins,
        winRate: total > 0 ? wins / total : 0,
        createdAt: u.createdAt,
        firstLoginAt: firstLoginMap.get(u.walletAddress),
      };
    });

    // Scorers (have resolved predictions) sorted by winRate desc, then non-scorers by FCFS
    const scorers = entries.filter(e => e.total > 0).sort((a, b) => b.winRate - a.winRate);
    const nonScorers = entries.filter(e => e.total === 0).sort((a, b) => {
      const left = timeframe === 'all_time' ? a.createdAt.getTime() : (a.firstLoginAt?.getTime() || 0);
      const right = timeframe === 'all_time' ? b.createdAt.getTime() : (b.firstLoginAt?.getTime() || 0);
      return left - right;
    });
    const sorted = [...scorers, ...nonScorers].slice(0, maxResults);
    const showStatus = timeframe === 'all_time';

    res.json({
      total_players: entries.length,
      leaderboard: sorted.map((l, idx) => ({
        rank: idx + 1,
        user: { id: l.wallet, username: l.user.username, avatar_url: l.user.avatarUrl },
        win_rate: l.winRate,
        total_predictions: l.total,
        wins: l.wins,
        losses: l.losses,
        current_streak: l.user.currentStreak || 0,
        status: showStatus ? getAccuracyStatus(l.winRate, l.total) : null,
      })),
    });
  } catch (err) {
    next(err);
  }
});
