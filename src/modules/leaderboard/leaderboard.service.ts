import { PrismaService } from '../../core/config/prisma.service';
import { RedisService } from '../../core/config/redis.service';
import { logger } from '../../core/logger/logger';
export interface LeaderboardEntry {
  rank: number;
  walletAddress: string;
  totalVolume: number;
  totalPnl: number;
  winRate: number;
  tradeCount: number;
  highestStreak: number;
}

const XP_SORTED_SET_KEY = 'leaderboard:xp:all_time';

type LeaderboardTimeframe = 'all_time' | 'daily' | 'weekly';

export class LeaderboardService {
  private readonly prisma: PrismaService;
  private readonly redis = RedisService.getInstance();
  private readonly CACHE_TTL = 300;
  private readonly CACHE_KEY = 'leaderboard:top100';
  constructor() {
    this.prisma = PrismaService.getInstance();
  }
  async getLeaderboard(options: { page?: number; limit?: number; sortBy?: string; timeframe?: string } = {}) {
    const page = Math.max(1, options.page || 1);
    const limit = Math.min(100, Math.max(1, options.limit || 20));
    const sortBy = options.sortBy || 'totalPnl';
    const timeframe = this.normalizeTimeframe(options.timeframe);
    const period = this.timeframeToPeriod(timeframe);
    const cacheKey = `${this.CACHE_KEY}:${period}:${page}:${limit}:${sortBy}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) return JSON.parse(cached);
    const validSortFields = ['totalPnl', 'totalVolume', 'winRate', 'tradeCount', 'streak'];
    const orderField = validSortFields.includes(sortBy) ? sortBy : 'totalPnl';

    // Support relation sorting for streak
    const prismaOrder = sortBy === 'streak'
      ? { user: { highestStreak: 'desc' as const } }
      : { [orderField]: 'desc' as const };

    const skip = (page - 1) * limit;
    const [entries, total] = await Promise.all([
      this.prisma.leaderboard.findMany({
        where: { period },
        skip,
        take: limit,
        orderBy: prismaOrder,
        include: { user: true },
      }),
      this.prisma.leaderboard.count({ where: { period } }),
    ]);
    const ranked: LeaderboardEntry[] = entries.map((entry, idx) => ({
      rank: skip + idx + 1,
      walletAddress: entry.walletAddress,
      totalVolume: entry.totalVolume,
      totalPnl: entry.totalPnl,
      winRate: entry.winRate,
      tradeCount: entry.tradeCount,
      highestStreak: (entry as any).user?.highestStreak || 0,
    }));
    const result = {
      data: ranked,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
    await this.redis.setex(cacheKey, this.CACHE_TTL, JSON.stringify(result));
    return result;
  }

  /**
   * Get a user's XP rank using Redis sorted set — O(log n) instead of full table scan.
   * Returns 1-based rank or null if user not found in the set.
   */
  async getUserXPRank(walletAddress: string): Promise<number | null> {
    try {
      const rank = await this.redis.zrevrank(XP_SORTED_SET_KEY, walletAddress);
      if (rank === null) return null;
      return rank + 1; // Convert 0-based to 1-based
    } catch (error) {
      logger.warn(`Failed to get XP rank from Redis for ${walletAddress}, falling back`);
      return null;
    }
  }

  /**
   * Sync all user XP values into a Redis sorted set for instant rank lookups.
   * Called after leaderboard recalculation.
   */
  private async syncXPToRedis(): Promise<void> {
    try {
      const users = await this.prisma.user.findMany({
        select: { walletAddress: true, xpTotal: true },
        where: { xpTotal: { gt: 0 } },
      });

      if (users.length === 0) return;

      // Pipeline for efficiency — batch all ZADD commands
      const pipeline = this.redis.pipeline();
      pipeline.del(XP_SORTED_SET_KEY);
      for (const user of users) {
        pipeline.zadd(XP_SORTED_SET_KEY, user.xpTotal, user.walletAddress);
      }
      await pipeline.exec();

      logger.info(`Synced ${users.length} users' XP to Redis sorted set`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown';
      logger.error(`Failed to sync XP to Redis: ${message}`);
    }
  }

  async updateLeaderboard(): Promise<void> {
    logger.info('Updating leaderboard...');
    try {
      const periods: Array<{ period: 'ALL_TIME' | 'DAILY' | 'WEEKLY'; tradeFilter: Record<string, unknown>; positionFilter: Record<string, unknown> }> = [];
      const now = new Date();

      const dayStart = new Date(now);
      dayStart.setUTCHours(0, 0, 0, 0);

      const weekStart = new Date(now);
      weekStart.setUTCDate(now.getUTCDate() - now.getUTCDay());
      weekStart.setUTCHours(0, 0, 0, 0);

      periods.push(
        { period: 'ALL_TIME', tradeFilter: {}, positionFilter: {} },
        { period: 'DAILY', tradeFilter: { timestamp: { gte: dayStart } }, positionFilter: { updatedAt: { gte: dayStart } } },
        { period: 'WEEKLY', tradeFilter: { timestamp: { gte: weekStart } }, positionFilter: { updatedAt: { gte: weekStart } } },
      );

      for (const { period, tradeFilter, positionFilter } of periods) {
        const [tradeStats, resolvedStats, winStats] = await Promise.all([
          this.prisma.trade.groupBy({
            by: ['walletAddress'],
            where: tradeFilter,
            _sum: { amount: true },
            _count: { id: true },
          }),
          this.prisma.position.groupBy({
            by: ['walletAddress'],
            where: {
              status: { in: ['WON', 'LOST'] },
              ...positionFilter,
            },
            _sum: { realizedPnl: true },
            _count: { _all: true },
          }),
          this.prisma.position.groupBy({
            by: ['walletAddress'],
            where: {
              status: 'WON',
              ...positionFilter,
            },
            _count: { _all: true },
          }),
        ]);

        const walletSet = new Set<string>();
        const tradeMap = new Map<string, { totalVolume: number; tradeCount: number }>();
        const resolvedMap = new Map<string, { totalPnl: number; resolvedCount: number }>();
        const winMap = new Map<string, number>();

        for (const trade of tradeStats) {
          walletSet.add(trade.walletAddress);
          tradeMap.set(trade.walletAddress, {
            totalVolume: trade._sum.amount || 0,
            tradeCount: trade._count.id || 0,
          });
        }

        for (const resolved of resolvedStats) {
          walletSet.add(resolved.walletAddress);
          resolvedMap.set(resolved.walletAddress, {
            totalPnl: resolved._sum.realizedPnl || 0,
            resolvedCount: resolved._count._all || 0,
          });
        }

        for (const win of winStats) {
          walletSet.add(win.walletAddress);
          winMap.set(win.walletAddress, win._count._all || 0);
        }

        const rows = Array.from(walletSet).map((walletAddress) => {
          const trade = tradeMap.get(walletAddress);
          const resolved = resolvedMap.get(walletAddress);
          const wins = winMap.get(walletAddress) || 0;
          const resolvedCount = resolved?.resolvedCount || 0;

          return {
            walletAddress,
            period,
            totalVolume: trade?.totalVolume || 0,
            totalPnl: resolved?.totalPnl || 0,
            winRate: resolvedCount > 0 ? wins / resolvedCount : 0,
            tradeCount: trade?.tradeCount || 0,
          };
        });

        await this.prisma.leaderboard.deleteMany({ where: { period } });
        if (rows.length > 0) {
          await this.prisma.leaderboard.createMany({ data: rows });
        }
      }

      const keys = await this.redis.keys(`${this.CACHE_KEY}*`);
      if (keys.length > 0) await this.redis.del(...keys);

      // Sync XP values to Redis sorted set for O(log n) rank lookups
      await this.syncXPToRedis();

      logger.info(`Leaderboard updated for all periods.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown';
      logger.error(`Leaderboard update failed: ${message}`);
    }
  }

  private normalizeTimeframe(timeframe?: string): LeaderboardTimeframe {
    if (timeframe === 'daily' || timeframe === 'weekly') {
      return timeframe;
    }
    return 'all_time';
  }

  private timeframeToPeriod(timeframe: LeaderboardTimeframe): 'ALL_TIME' | 'DAILY' | 'WEEKLY' {
    if (timeframe === 'daily') return 'DAILY';
    if (timeframe === 'weekly') return 'WEEKLY';
    return 'ALL_TIME';
  }
}
