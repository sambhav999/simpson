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
export class LeaderboardService {
  private readonly prisma: PrismaService;
  private readonly redis = RedisService.getInstance();
  private readonly CACHE_TTL = 300;
  private readonly CACHE_KEY = 'leaderboard:top100';
  constructor() {
    this.prisma = PrismaService.getInstance();
  }
  async getLeaderboard(options: { page?: number; limit?: number; sortBy?: string } = {}) {
    const page = Math.max(1, options.page || 1);
    const limit = Math.min(100, Math.max(1, options.limit || 20));
    const sortBy = options.sortBy || 'totalPnl';
    const cacheKey = `${this.CACHE_KEY}:${page}:${limit}:${sortBy}`;
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
        skip,
        take: limit,
        orderBy: prismaOrder,
        include: { user: true },
      }),
      this.prisma.leaderboard.count(),
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
  async updateLeaderboard(): Promise<void> {
    logger.info('Updating leaderboard...');
    try {
      const periods = ['ALL_TIME', 'DAILY', 'WEEKLY'];
      const now = new Date();

      const dayStart = new Date(now);
      dayStart.setUTCHours(0, 0, 0, 0);

      const weekStart = new Date(now);
      weekStart.setUTCDate(now.getUTCDate() - now.getUTCDay());
      weekStart.setUTCHours(0, 0, 0, 0);

      for (const period of periods) {
        let dateFilter = {};
        if (period === 'DAILY') dateFilter = { timestamp: { gte: dayStart } };
        if (period === 'WEEKLY') dateFilter = { timestamp: { gte: weekStart } };

        const wallets = await this.prisma.trade.groupBy({
          by: ['walletAddress'],
          where: dateFilter,
          _sum: { amount: true },
          _count: { id: true },
        });

        for (const walletData of wallets) {
          const wallet = walletData.walletAddress;
          const totalVolume = walletData._sum.amount || 0;
          const tradeCount = walletData._count.id || 0;

          const positions = await this.prisma.position.findMany({
            where: { walletAddress: wallet },
            select: { realizedPnl: true },
          });
          const totalPnl = positions.reduce((acc, p) => acc + p.realizedPnl, 0); // Kept all-time for simplicity

          const profitableTrades = await this.prisma.trade.count({
            where: { walletAddress: wallet, price: { gt: 0 }, ...dateFilter },
          });
          const winRate = tradeCount > 0 ? (profitableTrades / tradeCount) * 100 : 0;

          await this.prisma.leaderboard.upsert({
            where: {
              walletAddress_period: { walletAddress: wallet, period }
            },
            create: {
              walletAddress: wallet,
              period,
              totalVolume,
              totalPnl,
              winRate,
              tradeCount,
            },
            update: {
              totalVolume,
              totalPnl,
              winRate,
              tradeCount,
            },
          });
        }
      }

      const keys = await this.redis.keys(`${this.CACHE_KEY}*`);
      if (keys.length > 0) await this.redis.del(...keys);
      logger.info(`Leaderboard updated for all periods.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown';
      logger.error(`Leaderboard update failed: ${message}`);
    }
  }
}