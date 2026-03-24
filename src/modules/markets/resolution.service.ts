
import { PrismaService } from '../../core/config/prisma.service';
import { logger } from '../../core/logger/logger';
import { PriceOracleService } from './price-oracle.service';

export class ResolutionService {
  private readonly prisma: PrismaService;
  private readonly oracle: PriceOracleService;

  constructor() {
    this.prisma = PrismaService.getInstance();
    this.oracle = new PriceOracleService();
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
          // Fallback to YES for MVP if no real data found
          logger.warn(`[ResolutionService] No real outcome found for market ${market.id}, using fallback YES`);
          outcome = 'YES';
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

      // 1. Bulk Update Positions
      if (winPos.length > 0) {
          await this.prisma.position.updateMany({
              where: { id: { in: winPos.map(p => p.id) } },
              data: { status: 'WON' }
          });
      }
      if (lossPos.length > 0) {
          await this.prisma.position.updateMany({
              where: { id: { in: lossPos.map(p => p.id) } },
              data: { status: 'LOST' }
          });
      }

      // 2. Update XP and Streaks in Batches
      const XP_BATCH_SIZE = 50;
      
      // Handle Wins
      for (let i = 0; i < winPos.length; i += XP_BATCH_SIZE) {
          const batch = winPos.slice(i, i + XP_BATCH_SIZE);
          await this.prisma.$transaction(batch.map(pos => [
              this.prisma.xPTransaction.create({
                  data: {
                      walletAddress: pos.walletAddress,
                      amount: 50,
                      reason: 'prediction_win',
                      metadata: { market_id: market.id, position_id: pos.id }
                  }
              }),
              this.prisma.user.update({
                  where: { walletAddress: pos.walletAddress },
                  data: { xpTotal: { increment: 50 }, currentStreak: { increment: 1 } }
              })
          ]).flat());
      }

      // Handle Losses (Streak Reset) - Can be bulked if we use updateMany on Users
      // but currentStreak reset is specific to users who LOST on this specific market.
      // Small optimization: only update users once if they had multiple positions.
      const lossWallets = Array.from(new Set(lossPos.map(p => p.walletAddress)));
      for (let i = 0; i < lossWallets.length; i += XP_BATCH_SIZE) {
          const batch = lossWallets.slice(i, i + XP_BATCH_SIZE);
          await this.prisma.user.updateMany({
              where: { walletAddress: { in: batch } },
              data: { currentStreak: 0 }
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
}
