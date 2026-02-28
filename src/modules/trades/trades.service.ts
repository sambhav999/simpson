import { AggregatorService, TradeQuoteParams } from '../markets-aggregator/aggregator.service';
import { PrismaService } from '../../core/config/prisma.service';
import { SolanaService } from '../solana/solana.service';
import { logger } from '../../core/logger/logger';
import { AppError } from '../../core/config/error.handler';
import { tradeQuotesRequested, tradesIndexedSuccessfully, indexerLagSeconds } from '../metrics/metrics.controller';
export class TradesService {
  private readonly aggregator: AggregatorService;
  private readonly prisma: PrismaService;
  private readonly solana: SolanaService;
  constructor() {
    this.aggregator = new AggregatorService();
    this.prisma = PrismaService.getInstance();
    this.solana = SolanaService.getInstance();
  }
  async getTradeQuote(params: {
    wallet: string;
    marketId: string;
    side: 'YES' | 'NO';
    amount: number;
  }) {
    if (!this.solana.validatePublicKey(params.wallet)) {
      throw new AppError('Invalid wallet address', 400);
    }
    if (params.amount <= 0) {
      throw new AppError('Amount must be positive', 400);
    }
    const market = await this.prisma.market.findUnique({
      where: { id: params.marketId },
    });
    if (!market) {
      throw new AppError(`Market ${params.marketId} not found`, 404);
    }
    if (market.status !== 'active') {
      throw new AppError(`Market ${params.marketId} is not active`, 400);
    }
    const tokenMint = params.side === 'YES' ? market.yesTokenMint : market.noTokenMint;

    // Skip Solana public key validation for tokenMint because Polymarket IDs are large strings, not Solana keys.
    // if (!this.solana.validatePublicKey(tokenMint)) {
    //   throw new AppError('Market has invalid token mint configuration', 500);
    // }
    const quoteParams: TradeQuoteParams = {
      wallet: params.wallet,
      marketId: market.externalId || params.marketId,
      side: params.side,
      amount: params.amount,
    };
    const quote = await this.aggregator.getTradeQuote(quoteParams);

    tradeQuotesRequested.inc();
    logger.info(`Trade quote generated for ${params.wallet} in market ${params.marketId}`);
    return {
      marketId: params.marketId,
      marketTitle: market.title,
      side: params.side,
      tokenMint,
      amount: params.amount,
      total: params.amount + (quote.fee || 0),
      ...quote,
    };
  }
  async recordTrade(data: {
    walletAddress: string;
    marketId: string;
    tokenMint: string;
    side: string;
    price: number;
    amount: number;
    signature: string;
    timestamp: Date;
  }) {
    const exists = await this.prisma.trade.findUnique({
      where: { signature: data.signature },
    });
    if (exists) {
      logger.debug(`Trade ${data.signature} already indexed`);
      return exists;
    }
    const user = await this.prisma.user.upsert({
      where: { walletAddress: data.walletAddress },
      create: { walletAddress: data.walletAddress },
      update: {},
    });

    // Extract local midnight logic for streak calculation
    const now = new Date();
    const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

    let currentStreak = user.currentStreak;
    let highestStreak = user.highestStreak;

    if (user.lastTradeDate) {
      const lastTradeDate = new Date(user.lastTradeDate);
      const diffTime = Math.abs(today.getTime() - lastTradeDate.getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      if (diffDays === 1) {
        currentStreak++;
      } else if (diffDays > 1) {
        currentStreak = 1;
      }
      // if diffDays === 0, keep same streak
    } else {
      currentStreak = 1;
    }

    if (currentStreak > highestStreak) {
      highestStreak = currentStreak;
    }

    await this.prisma.user.update({
      where: { walletAddress: data.walletAddress },
      data: {
        lastTradeDate: today,
        currentStreak,
        highestStreak,
      }
    });

    const trade = await this.prisma.trade.create({
      data: {
        walletAddress: data.walletAddress,
        marketId: data.marketId,
        tokenMint: data.tokenMint,
        side: data.side,
        price: data.price,
        amount: data.amount,
        signature: data.signature,
        timestamp: data.timestamp,
      },
    });

    tradesIndexedSuccessfully.inc();
    const lag = (Date.now() - new Date(data.timestamp).getTime()) / 1000;
    indexerLagSeconds.set(lag);

    await this.updatePositionAfterTrade(data);
    return trade;
  }
  private async updatePositionAfterTrade(data: {
    walletAddress: string;
    marketId: string;
    tokenMint: string;
    side: string;
    price: number;
    amount: number;
  }) {
    const existing = await this.prisma.position.findUnique({
      where: {
        walletAddress_marketId_tokenMint: {
          walletAddress: data.walletAddress,
          marketId: data.marketId,
          tokenMint: data.tokenMint,
        },
      },
    });
    if (data.side === 'BUY') {
      const newAmount = (existing?.amount || 0) + data.amount;
      const totalCost =
        (existing?.amount || 0) * (existing?.averageEntryPrice || 0) +
        data.amount * data.price;
      const newAvgPrice = newAmount > 0 ? totalCost / newAmount : data.price;
      await this.prisma.position.upsert({
        where: {
          walletAddress_marketId_tokenMint: {
            walletAddress: data.walletAddress,
            marketId: data.marketId,
            tokenMint: data.tokenMint,
          },
        },
        create: {
          walletAddress: data.walletAddress,
          marketId: data.marketId,
          tokenMint: data.tokenMint,
          amount: newAmount,
          averageEntryPrice: newAvgPrice,
        },
        update: {
          amount: newAmount,
          averageEntryPrice: newAvgPrice,
        },
      });
    } else if (data.side === 'SELL' && existing) {
      const newAmount = Math.max(0, existing.amount - data.amount);
      const realizedPnl =
        existing.realizedPnl +
        data.amount * (data.price - existing.averageEntryPrice);
      await this.prisma.position.update({
        where: {
          walletAddress_marketId_tokenMint: {
            walletAddress: data.walletAddress,
            marketId: data.marketId,
            tokenMint: data.tokenMint,
          },
        },
        data: {
          amount: newAmount,
          realizedPnl,
        },
      });
    }
  }
}