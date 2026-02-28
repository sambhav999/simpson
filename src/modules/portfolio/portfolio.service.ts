import { PrismaService } from '../../core/config/prisma.service';
import { SolanaService } from '../solana/solana.service';
import { RedisService } from '../../core/config/redis.service';
import { logger } from '../../core/logger/logger';
import { AppError } from '../../core/config/error.handler';
export interface PortfolioPosition {
  marketId: string;
  marketTitle: string;
  tokenMint: string;
  side: 'YES' | 'NO';
  amount: number;
  averageEntryPrice: number;
  currentValue: number;
  realizedPnl: number;
  unrealizedPnl: number;
}
export interface PortfolioSummary {
  walletAddress: string;
  totalPositions: number;
  totalValue: number;
  totalRealizedPnl: number;
  totalUnrealizedPnl: number;
  positions: PortfolioPosition[];
}
export class PortfolioService {
  private readonly prisma: PrismaService;
  private readonly solana: SolanaService;
  private readonly redis = RedisService.getInstance();
  private readonly CACHE_TTL = 30;
  constructor() {
    this.prisma = PrismaService.getInstance();
    this.solana = SolanaService.getInstance();
  }
  async getPortfolio(walletAddress: string): Promise<PortfolioSummary> {
    if (!this.solana.validatePublicKey(walletAddress)) {
      throw new AppError('Invalid wallet address', 400);
    }
    const cacheKey = `portfolio:${walletAddress}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) return JSON.parse(cached);
    await this.prisma.user.upsert({
      where: { walletAddress },
      create: { walletAddress },
      update: {},
    });
    const positions = await this.prisma.position.findMany({
      where: { walletAddress },
      include: { market: true },
    });
    const portfolioPositions: PortfolioPosition[] = positions
      .filter((p) => p.amount > 0)
      .map((p) => {
        const side = p.market.yesTokenMint === p.tokenMint ? 'YES' : 'NO';
        const currentValue = p.amount * p.averageEntryPrice;
        const unrealizedPnl = 0;
        return {
          marketId: p.marketId,
          marketTitle: p.market.title,
          tokenMint: p.tokenMint,
          side,
          amount: p.amount,
          averageEntryPrice: p.averageEntryPrice,
          currentValue,
          realizedPnl: p.realizedPnl,
          unrealizedPnl,
        };
      });
    const summary: PortfolioSummary = {
      walletAddress,
      totalPositions: portfolioPositions.length,
      totalValue: portfolioPositions.reduce((acc, p) => acc + p.currentValue, 0),
      totalRealizedPnl: portfolioPositions.reduce((acc, p) => acc + p.realizedPnl, 0),
      totalUnrealizedPnl: portfolioPositions.reduce((acc, p) => acc + p.unrealizedPnl, 0),
      positions: portfolioPositions,
    };
    await this.redis.setex(cacheKey, this.CACHE_TTL, JSON.stringify(summary));
    return summary;
  }
  async getTradeHistory(
    walletAddress: string,
    options: { page?: number; limit?: number; marketId?: string } = {}
  ) {
    if (!this.solana.validatePublicKey(walletAddress)) {
      throw new AppError('Invalid wallet address', 400);
    }
    const page = Math.max(1, options.page || 1);
    const limit = Math.min(100, Math.max(1, options.limit || 20));
    const skip = (page - 1) * limit;
    const where: Record<string, unknown> = { walletAddress };
    if (options.marketId) where['marketId'] = options.marketId;
    const [trades, total] = await Promise.all([
      this.prisma.trade.findMany({
        where,
        skip,
        take: limit,
        orderBy: { timestamp: 'desc' },
        include: { market: { select: { title: true, yesTokenMint: true, noTokenMint: true } } },
      }),
      this.prisma.trade.count({ where }),
    ]);
    return {
      data: trades.map((t) => ({
        ...t,
        tokenSide: t.market.yesTokenMint === t.tokenMint ? 'YES' : 'NO',
      })),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }
  async syncWalletPositions(walletAddress: string): Promise<void> {
    if (!this.solana.validatePublicKey(walletAddress)) {
      logger.warn(`Invalid wallet address for sync: ${walletAddress}`);
      return;
    }
    try {
      const markets = await this.prisma.market.findMany({
        where: { status: 'active' },
        select: { id: true, yesTokenMint: true, noTokenMint: true },
      });
      const tokenBalances = await this.solana.getTokenBalances(walletAddress);
      const balanceMap = new Map(tokenBalances.map((b) => [b.mint, b]));
      for (const market of markets) {
        for (const [tokenMint, label] of [
          [market.yesTokenMint, 'YES'],
          [market.noTokenMint, 'NO'],
        ]) {
          const balance = balanceMap.get(tokenMint);
          if (!balance && label) continue;
          const uiAmount = balance?.uiAmount || 0;
          if (uiAmount > 0) {
            await this.prisma.position.upsert({
              where: {
                walletAddress_marketId_tokenMint: {
                  walletAddress,
                  marketId: market.id,
                  tokenMint,
                },
              },
              create: {
                walletAddress,
                marketId: market.id,
                tokenMint,
                amount: uiAmount,
                averageEntryPrice: 0,
              },
              update: { amount: uiAmount },
            });
          }
        }
      }
      const cacheKey = `portfolio:${walletAddress}`;
      await this.redis.del(cacheKey);
      logger.debug(`Synced positions for wallet ${walletAddress}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown';
      logger.error(`Failed to sync positions for ${walletAddress}: ${message}`);
    }
  }
}