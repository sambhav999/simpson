
import { PrismaService } from '../../core/config/prisma.service';
import { config } from '../../core/config/config';
import { logger } from '../../core/logger/logger';
import { PriceOracleService } from './price-oracle.service';
import { AggregatorService } from '../markets-aggregator/aggregator.service';
import { SolanaService } from '../solana/solana.service';

export class ResolutionService {
  private readonly prisma: PrismaService;
  private readonly oracle: PriceOracleService;
  private readonly aggregator: AggregatorService;
  private readonly solana: SolanaService;

  constructor() {
    this.prisma = PrismaService.getInstance();
    this.oracle = new PriceOracleService();
    this.aggregator = new AggregatorService();
    this.solana = SolanaService.getInstance();
  }

  /**
   * Scans for resolved and expired markets and updates associated positions
   */
  async resolveMarkets(): Promise<{ resolvedPositions: number }> {
    logger.info('[ResolutionService] Starting market resolution check...');
    
    // 1. Find markets that are resolved or expired but have active positions
    const pendingMarkets = await this.prisma.market.findMany({
      where: { 
        status: { in: ['resolved', 'expired'] },
        positions: { some: { status: 'ACTIVE' } }
      },
      include: {
        positions: { where: { status: 'ACTIVE' } }
      }
    });

    if (pendingMarkets.length === 0) {
      logger.info('[ResolutionService] No markets found pending resolution.');
      return { resolvedPositions: 0 };
    }

    let resolvedCount = 0;

    for (const market of pendingMarkets) {
      const suggested = await this.getResolutionSuggestionForMarket(market);
      if (!suggested.outcome) {
        logger.info(`[ResolutionService] Market ${market.id} is not yet officially resolved by source, staying pending...`);
        continue;
      }

      resolvedCount += await this.resolveLoadedMarket(market, suggested.outcome);
    }

    logger.info(`[ResolutionService] Successfully resolved ${resolvedCount} positions.`);
    return { resolvedPositions: resolvedCount };
  }

  async resolveMarketById(marketId: string, outcome: 'YES' | 'NO') {
    const market = await this.prisma.market.findUnique({
      where: { id: marketId },
      include: {
        positions: { where: { status: 'ACTIVE' } },
      },
    });

    if (!market) {
      throw new Error(`Market ${marketId} not found`);
    }

    const resolvedPositions = await this.resolveLoadedMarket(market, outcome);
    return { marketId, outcome, resolvedPositions };
  }

  async getResolutionSuggestion(marketId: string) {
    const market = await this.prisma.market.findUnique({
      where: { id: marketId },
      include: {
        aiPredictions: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    if (!market) {
      throw new Error(`Market ${marketId} not found`);
    }

    const sourceSuggestion = await this.getResolutionSuggestionForMarket(market);
    if (sourceSuggestion.outcome) {
      return {
        marketId: market.id,
        outcome: sourceSuggestion.outcome,
        confidence: sourceSuggestion.confidence,
        rationale: sourceSuggestion.rationale,
        method: sourceSuggestion.method,
        admin_confirmation_required: true,
      };
    }

    const latestAi = market.aiPredictions[0];
    if (latestAi) {
      return {
        marketId: market.id,
        outcome: latestAi.prediction,
        confidence: latestAi.confidence,
        rationale: latestAi.commentary || latestAi.summaryCommentary || 'Latest AI Oracle prediction used as suggestion.',
        method: 'ai_prediction',
        admin_confirmation_required: true,
      };
    }

    const yesPrice = typeof market.yesPrice === 'number' ? (market.yesPrice <= 1 ? market.yesPrice * 100 : market.yesPrice) : 50;
    const noPrice = typeof market.noPrice === 'number' ? (market.noPrice <= 1 ? market.noPrice * 100 : market.noPrice) : 100 - yesPrice;
    const impliedOutcome = yesPrice >= noPrice ? 'YES' : 'NO';
    const impliedConfidence = Math.max(55, Math.round(Math.max(yesPrice, noPrice)));

    return {
      marketId: market.id,
      outcome: impliedOutcome,
      confidence: impliedConfidence,
      rationale: `No source-backed resolution signal was found, so this suggestion falls back to current market-implied probability (${Math.round(yesPrice)}% YES / ${Math.round(noPrice)}% NO).`,
      method: 'market_probabilities',
      admin_confirmation_required: true,
    };
  }

  private async resolveLoadedMarket(market: any, outcome: 'YES' | 'NO'): Promise<number> {
    logger.info(`[ResolutionService] Resolving market ${market.id} with outcome: ${outcome} (${market.positions.length} positions)`);

    const winPos = market.positions.filter((p: any) => {
      const side = p.betSide || p.side || (p.tokenMint === market.yesTokenMint ? 'YES' : 'NO');
      return side === outcome;
    });
    const lossPos = market.positions.filter((p: any) => {
      const side = p.betSide || p.side || (p.tokenMint === market.yesTokenMint ? 'YES' : 'NO');
      return side !== outcome;
    });

    for (const position of winPos) {
      await this.settleWinningPosition(market, position, outcome);
    }

    for (const position of lossPos) {
      await this.prisma.position.update({
        where: { id: position.id },
        data: {
          amount: 0,
          status: 'LOST',
        },
      });
    }

    const lossWallets = Array.from(new Set(lossPos.map((position: any) => position.walletAddress))) as string[];
    if (lossWallets.length > 0) {
      await this.prisma.user.updateMany({
        where: { walletAddress: { in: lossWallets } },
        data: { currentStreak: 0 },
      });
    }

    await this.prisma.market.update({
      where: { id: market.id },
      data: {
        resolved: true,
        resolution: outcome,
        status: 'resolved',
      },
    });

    return market.positions.length;
  }

  private async getResolutionSuggestionForMarket(market: any): Promise<{
    outcome: 'YES' | 'NO' | null;
    confidence: number;
    rationale: string;
    method: 'oracle_title' | 'source_feed' | 'source_url' | 'unavailable';
  }> {
    if (market.resolution === 'YES' || market.resolution === 'NO') {
      return {
        outcome: market.resolution,
        confidence: 100,
        rationale: 'Market already has a stored final resolution.',
        method: 'source_feed',
      };
    }

    const oracleOutcome = await this.oracle.getResolution(market.title);
    if (oracleOutcome) {
      return {
        outcome: oracleOutcome,
        confidence: 95,
        rationale: 'Title-based oracle rule matched a supported price market and produced a deterministic outcome.',
        method: 'oracle_title',
      };
    }

    const directSourceOutcome = await this.aggregator.getMarketResolution(market.source, market.externalId || '');
    if (directSourceOutcome) {
      return {
        outcome: directSourceOutcome,
        confidence: 99,
        rationale: 'Resolution was fetched directly from the linked source market.',
        method: 'source_feed',
      };
    }

    const inferred = this.inferSourceFromUrl(market.sourceUrl || '');
    if (inferred?.externalId) {
      const sourceUrlOutcome = await this.aggregator.getMarketResolution(inferred.source, inferred.externalId);
      if (sourceUrlOutcome) {
        return {
          outcome: sourceUrlOutcome,
          confidence: 95,
          rationale: `Resolution was inferred from the configured source URL (${inferred.source}).`,
          method: 'source_url',
        };
      }
    }

    return {
      outcome: null,
      confidence: 0,
      rationale: 'No deterministic source or oracle rule could resolve this market yet.',
      method: 'unavailable',
    };
  }

  private inferSourceFromUrl(sourceUrl?: string | null): { source: string; externalId: string } | null {
    if (!sourceUrl) return null;

    try {
      const url = new URL(sourceUrl);
      const hostname = url.hostname.toLowerCase();
      const path = url.pathname.replace(/^\/+|\/+$/g, '');

      if (hostname.includes('kalshi.com') && path) {
        const ticker = path.split('/').pop();
        if (ticker) {
          return { source: 'kalshi', externalId: ticker.startsWith('KAL-') ? ticker : `KAL-${ticker}` };
        }
      }

      if (hostname.includes('manifold.markets') && path) {
        const id = path.split('/').pop();
        if (id) {
          return { source: 'manifold', externalId: id.startsWith('MNF-') ? id : `MNF-${id}` };
        }
      }

      if (hostname.includes('polymarket.com')) {
        const id = url.searchParams.get('id') || url.searchParams.get('market');
        if (id) {
          return { source: 'polymarket', externalId: id.startsWith('POLY-') ? id : `POLY-${id}` };
        }
      }
    } catch {
      return null;
    }

    return null;
  }

  private async settleWinningPosition(market: any, position: any, outcome: string): Promise<void> {
    const payoutAmount = Number((position.amount * config.TREASURY_PAYOUT_MULTIPLIER).toFixed(9));
    const costBasis = Number((position.amount * position.averageEntryPrice).toFixed(9));
    const realizedPnl = Number((payoutAmount - costBasis).toFixed(9));
    const side = position.betSide || position.side || (position.tokenMint === market.yesTokenMint ? 'YES' : 'NO');

    let payoutSignature: string | null = null;
    if (payoutAmount > 0) {
      payoutSignature = await this.solana.sendTreasuryPayout(position.walletAddress, payoutAmount);
    } else {
      logger.warn(`[ResolutionService] Skipping zero-amount payout for position ${position.id}`);
    }

    await this.prisma.$transaction([
      this.prisma.position.update({
        where: { id: position.id },
        data: {
          amount: 0,
          realizedPnl,
          status: 'WON',
        },
      }),
      this.prisma.trade.create({
        data: {
          walletAddress: position.walletAddress,
          marketId: market.id,
          tokenMint: position.tokenMint,
          side: 'PAYOUT',
          betSide: side,
          price: 1,
          amount: payoutAmount,
          fee: 0,
          signature: payoutSignature || `payout_${market.id}_${position.id}`,
          status: payoutSignature ? 'SUCCESS' : 'SIMULATED_PAYOUT',
          timestamp: new Date(),
        },
      }),
      this.prisma.xPTransaction.create({
        data: {
          walletAddress: position.walletAddress,
          amount: 50,
          reason: 'prediction_win',
          metadata: {
            market_id: market.id,
            position_id: position.id,
            payout_amount: payoutAmount,
            payout_signature: payoutSignature,
            outcome,
          },
        },
      }),
      this.prisma.user.update({
        where: { walletAddress: position.walletAddress },
        data: { xpTotal: { increment: 50 }, currentStreak: { increment: 1 } },
      }),
    ]);

    logger.info(
      `[ResolutionService] Paid ${payoutAmount} SOL to ${position.walletAddress} for market ${market.id}`
    );
  }
}
