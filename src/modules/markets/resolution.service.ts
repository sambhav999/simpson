
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
      // Try to get real resolution from oracle for price-based markets
      let outcome = market.resolution;
      
      if (!outcome) {
        const realOutcome = await this.oracle.getResolution(market.title);
        if (realOutcome) {
          logger.info(`[ResolutionService] Real outcome found for market ${market.id}: ${realOutcome}`);
          outcome = realOutcome;
        } else {
          // Attempt to get real outcome from the external aggregator (Polymarket, Kalshi, etc.)
          const aggregatorOutcome = await this.aggregator.getMarketResolution(market.source, market.externalId || '');
          if (aggregatorOutcome) {
            logger.info(`[ResolutionService] Real external outcome found for market ${market.id}: ${aggregatorOutcome}`);
            outcome = aggregatorOutcome;
          } else {
            // Outcome not yet determined by external API or unsupported. 
            // Skip processing to leave it pending for the next cycle.
            logger.info(`[ResolutionService] Market ${market.id} is not yet officially resolved by source, staying pending...`);
            continue;
          }
        }
      }
      
      logger.info(`[ResolutionService] Resolving market ${market.id} with outcome: ${outcome} (${market.positions.length} positions)`);

      const winPos = market.positions.filter(p => {
        const side = p.betSide || p.side || (p.tokenMint === market.yesTokenMint ? 'YES' : 'NO');
        return side === outcome;
      });
      const lossPos = market.positions.filter(p => {
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

      const lossWallets = Array.from(new Set(lossPos.map((position) => position.walletAddress)));
      if (lossWallets.length > 0) {
        await this.prisma.user.updateMany({
          where: { walletAddress: { in: lossWallets } },
          data: { currentStreak: 0 },
        });
      }

      resolvedCount += market.positions.length;

      // 3. Mark market as fully resolved
      await this.prisma.market.update({
        where: { id: market.id },
        data: { 
          resolved: true, 
          resolution: outcome,
          status: 'resolved'
        }
      });
    }

    logger.info(`[ResolutionService] Successfully resolved ${resolvedCount} positions.`);
    return { resolvedPositions: resolvedCount };
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
