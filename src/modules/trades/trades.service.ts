import { AggregatorService, TradeQuoteParams } from '../markets-aggregator/aggregator.service';
import { PrismaService } from '../../core/config/prisma.service';
import { SolanaService } from '../solana/solana.service';
import { logger } from '../../core/logger/logger';
import { AppError } from '../../core/config/error.handler';
import { tradeQuotesRequested, tradesIndexedSuccessfully, indexerLagSeconds } from '../metrics/metrics.controller';
import { PublicKey, SystemProgram, Transaction } from '@solana/web3.js';
export class TradesService {
  private readonly aggregator: AggregatorService;
  private readonly prisma: PrismaService;
  private readonly solana: SolanaService;
  constructor() {
    this.aggregator = new AggregatorService();
    this.prisma = PrismaService.getInstance();
    this.solana = SolanaService.getInstance();
  }
  private readonly QUOTE_REUSE_WINDOW_MS = 15_000;
  private readonly QUOTE_PRICE_TOLERANCE = 0.02;
  private isCachedQuoteReusable(params: {
    marketYesPrice?: number | null;
    marketNoPrice?: number | null;
    side: 'YES' | 'NO';
    cachedQuote?: {
      expectedPrice?: number;
      unitPrice?: number;
      fee?: number;
      total?: number;
      expiresAt?: number;
      tokenMint?: string;
    };
  }) {
    const { cachedQuote } = params;
    if (!cachedQuote) return false;

    const expiresAt = Number(cachedQuote.expiresAt || 0);
    if (!expiresAt || expiresAt <= Date.now() + 5_000) {
      return false;
    }
    if (expiresAt - Date.now() > this.QUOTE_REUSE_WINDOW_MS) {
      return false;
    }

    const cachedPrice = Number(cachedQuote.unitPrice || cachedQuote.expectedPrice || 0);
    const marketPrice = params.side === 'YES'
      ? Number(params.marketYesPrice || 0)
      : Number(params.marketNoPrice || 0);

    if (cachedPrice <= 0 || marketPrice <= 0) {
      return false;
    }

    return Math.abs(cachedPrice - marketPrice) <= this.QUOTE_PRICE_TOLERANCE;
  }
  async getTradeQuote(params: {
    wallet: string;
    marketId: string;
    side: 'YES' | 'NO';
    amount: number;
  }) {
    const isEthAddress = params.wallet.startsWith('0x') && params.wallet.length === 42;
    if (!isEthAddress && !this.solana.validatePublicKey(params.wallet)) {
      throw new AppError('Invalid wallet address (must be valid Solana or Ethereum address)', 400);
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

    // Check if user already has a position in this market
    const existingPosition = await this.prisma.position.findFirst({
      where: {
        walletAddress: params.wallet,
        marketId: params.marketId,
      },
    });
    if (existingPosition) {
      throw new AppError('You have already placed a bet on this question', 400);
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
    const unitPrice = params.side === 'YES' ? market.yesPrice : market.noPrice;
    const normalizedUnitPrice = typeof unitPrice === 'number' && unitPrice > 0 ? unitPrice : quote.expectedPrice;
    const fee = quote.fee || 0;
    const shares = normalizedUnitPrice > 0 ? params.amount / normalizedUnitPrice : 0;
    const estimatedPayout = shares;
    const estimatedProfit = estimatedPayout - params.amount - fee;

    tradeQuotesRequested.inc();
    logger.info(`Trade quote generated for ${params.wallet} in market ${params.marketId}`);
    return {
      marketId: params.marketId,
      marketTitle: market.title,
      side: params.side,
      tokenMint,
      amount: params.amount,
      stake: params.amount,
      unitPrice: normalizedUnitPrice,
      shares,
      estimatedPayout,
      estimatedProfit,
      total: params.amount + fee,
      ...quote,
      expectedPrice: normalizedUnitPrice,
    };
  }

  getSolanaPayMetadata() {
    return {
      label: 'SimPredict Prediction Markets',
      icon: 'https://simpredict.xyz/logo.png', // Fallback remote logo for Solana Pay wallets
    };
  }

  async getSolanaPayTransaction(params: {
    account: string;
    marketId: string;
    side: 'YES' | 'NO';
    amount: number;
    reference: string;
    cachedQuote?: {
      expectedPrice?: number;
      unitPrice?: number;
      fee?: number;
      total?: number;
      expiresAt?: number;
      tokenMint?: string;
    };
  }) {
    if (!this.solana.validatePublicKey(params.account)) {
      throw new AppError('Invalid user account address', 400);
    }

    const market = await this.prisma.market.findUnique({
      where: { id: params.marketId },
    });
    if (!market) {
      throw new AppError(`Market ${params.marketId} not found`, 404);
    }

    // Reuse a fresh cached quote when possible; otherwise refetch.
    const quote = this.isCachedQuoteReusable({
      marketYesPrice: market.yesPrice,
      marketNoPrice: market.noPrice,
      side: params.side,
      cachedQuote: params.cachedQuote,
    })
      ? {
          serializedTransaction: '',
          expectedPrice: Number(params.cachedQuote?.expectedPrice || params.cachedQuote?.unitPrice || 0),
          priceImpact: 0,
          fee: Number(params.cachedQuote?.fee || 0),
          expiresAt: Number(params.cachedQuote?.expiresAt || Date.now()),
          source: 'cache',
          total: Number(params.cachedQuote?.total || params.amount),
          tokenMint: params.cachedQuote?.tokenMint,
        } as any
      : await this.getTradeQuote({
          wallet: params.account,
          marketId: params.marketId,
          side: params.side,
          amount: params.amount
        });

    const userPubkey = new PublicKey(params.account);
    const referencePubkey = new PublicKey(params.reference);

    // 2. Build the actual transaction
    // In a real production app, this would explicitly call the polymorphic contract (e.g., Polymarket's CTF exchange)
    // For this example, we'll simulate the transaction building by creating a transfer to a treasury wallet
    // but attaching the reference key so the indexer can track it.

    const treasuryPubkey = new PublicKey(process.env.FEE_WALLET_ADDRESS || '11111111111111111111111111111111');
    const lamports = Math.floor((quote.total || params.amount) * 1e9); // Convert simulated cost to lamports

    const connection = this.solana.getConnection();
    const { blockhash } = await connection.getLatestBlockhash('finalized');

    const transaction = new Transaction({
      recentBlockhash: blockhash,
      feePayer: userPubkey,
    }).add(
      SystemProgram.transfer({
        fromPubkey: userPubkey,
        toPubkey: treasuryPubkey,
        lamports,
      })
    );

    // CRITICAL: Attach the reference address to the transaction so our system can look it up later
    transaction.instructions[0].keys.push({
      pubkey: referencePubkey,
      isSigner: false,
      isWritable: false,
    });

    // 3. Serialize the transaction as base64 and return
    const serializedTransaction = transaction.serialize({
      requireAllSignatures: false, // We only build it, the mobile wallet signs it
    });

    logger.info(`Solana Pay Transaction Request built for ${params.account} on market ${params.marketId} (${quote.source || 'live'})`);

    return {
      transaction: serializedTransaction.toString('base64'),
      message: `Predict ${params.side} on Market`,
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
    betSide?: string;
    status?: string;
  }) {
    if (data.signature) {
      const exists = await this.prisma.trade.findUnique({
        where: { signature: data.signature },
      });
      if (exists) {
        logger.debug(`Trade ${data.signature} already indexed`);
        return exists;
      }
    }
    const isMainnet = process.env.SOLANA_NETWORK === 'mainnet-beta';
    if (isMainnet && data.signature.startsWith('sim_')) {
      throw new AppError('Simulated trades are not allowed on Mainnet-Beta', 403);
    }

    // Double check single-bet constraint at recording time
    const existingPosition = await this.prisma.position.findFirst({
      where: {
        walletAddress: data.walletAddress,
        marketId: data.marketId,
      },
    });
    if (existingPosition) {
      throw new AppError('You have already placed a bet on this question', 400);
    }
    const user = await this.prisma.user.upsert({
      where: { walletAddress: data.walletAddress },
      create: { 
        walletAddress: data.walletAddress,
        username: `user_${data.walletAddress.slice(-6).toLowerCase()}`
      },
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

    // Resolve tokenMint from market if it's placeholder
    let finalTokenMint = data.tokenMint;
    if (finalTokenMint === 'placeholder_mint') {
      const market = await this.prisma.market.findUnique({ where: { id: data.marketId } });
      if (market) {
        // If data.side contains 'YES' or 'NO' (from some calls) or if we have a way to know
        // For now, let's assume we need to pass the real mint or resolve it.
        // I'll update the controller to pass the real mint instead.
      }
    }

    const trade = await this.prisma.trade.create({
      data: {
        walletAddress: data.walletAddress,
        marketId: data.marketId,
        tokenMint: data.tokenMint,
        side: data.side,
        betSide: data.betSide,
        price: data.price,
        amount: data.amount,
        signature: data.signature,
        status: data.status || 'SUCCESS',
        timestamp: data.timestamp,
      },
    });

    tradesIndexedSuccessfully.inc();
    const lag = (Date.now() - new Date(data.timestamp).getTime()) / 1000;
    indexerLagSeconds.set(lag);

    await this.updatePositionAfterTrade(data);
    return trade;
  }

  /**
   * Record a failed trade attempt (e.g. insufficient funds).
   * This creates a Trade record with FAILED status but does NOT create a Position,
   * so the user is free to retry.
   */
  async recordFailure(data: {
    walletAddress: string;
    marketId: string;
    tokenMint: string;
    side: string;
    price: number;
    amount: number;
    signature: string;
    timestamp: Date;
    betSide?: string;
    status?: string;
  }) {
    const trade = await this.prisma.trade.create({
      data: {
        walletAddress: data.walletAddress,
        marketId: data.marketId,
        tokenMint: data.tokenMint,
        side: data.side,
        betSide: data.betSide,
        price: data.price,
        amount: data.amount,
        signature: data.signature,
        status: data.status || 'FAILED',
        timestamp: data.timestamp,
      },
    });

    logger.info(`Failed trade recorded for ${data.walletAddress} on market ${data.marketId}: ${data.status}`);
    return trade;
  }

  private async updatePositionAfterTrade(data: {
    walletAddress: string;
    marketId: string;
    tokenMint: string;
    side: string;
    price: number;
    amount: number;
    betSide?: string;
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
      const market = await this.prisma.market.findUnique({ where: { id: data.marketId } });
      const side = data.betSide || (data.tokenMint === market?.yesTokenMint ? 'YES' : 'NO');

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
          side: side,
          betSide: side,
        },
        update: {
          amount: newAmount,
          averageEntryPrice: newAvgPrice,
          side: side,
          betSide: side,
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
