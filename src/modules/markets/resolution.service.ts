
import { PrismaService } from '../../core/config/prisma.service';
import { logger } from '../../core/logger/logger';

export class ResolutionService {
  private readonly prisma: PrismaService;

  constructor() {
    this.prisma = PrismaService.getInstance();
  }

  /**
   * Scans for resolved markets and updates associated positions
   */
  async resolveMarkets(): Promise<{ resolvedPositions: number }> {
    logger.info('[ResolutionService] Starting market resolution check...');
    
    // 1. Find markets that are resolved but have active positions
    // In a real app, we'd check the resolution source (YES/NO)
    const resolvedMarkets = await this.prisma.market.findMany({
      where: { 
        status: 'resolved',
        positions: { some: { status: 'ACTIVE' } }
      },
      include: {
        positions: { where: { status: 'ACTIVE' } }
      }
    });

    if (resolvedMarkets.length === 0) {
      logger.info('[ResolutionService] No markets found pending resolution.');
      return { resolvedPositions: 0 };
    }

    let resolvedCount = 0;

    for (const market of resolvedMarkets) {
      // For MVP/Demo: If resolution is not set, we'll "simulate" a YES outcome
      // so the leaderboard populates. In production, this would be fetched from oracle.
      const outcome = market.resolution || 'YES'; 
      
      logger.info(`[ResolutionService] Resolving market ${market.id} with outcome: ${outcome}`);

      for (const pos of market.positions) {
        const isWin = pos.side === outcome;
        const newStatus = isWin ? 'WON' : 'LOST';

        await this.prisma.$transaction(async (tx) => {
          // Update position status
          await tx.position.update({
            where: { id: pos.id },
            data: { status: newStatus }
          });

          // Award WIN XP if they won
          if (isWin) {
            await tx.xPTransaction.create({
              data: {
                walletAddress: pos.walletAddress,
                amount: 50,
                reason: 'prediction_win',
                metadata: { market_id: market.id, position_id: pos.id }
              }
            });

            await tx.user.update({
              where: { walletAddress: pos.walletAddress },
              data: { 
                xpTotal: { increment: 50 },
                currentStreak: { increment: 1 }
              }
            });
          } else {
            // Reset streak on loss
            await tx.user.update({
              where: { walletAddress: pos.walletAddress },
              data: { currentStreak: 0 }
            });
          }
        });

        resolvedCount++;
      }

      // Mark market as fully resolved in our resolution flag if not already
      if (!market.resolved) {
        await this.prisma.market.update({
          where: { id: market.id },
          data: { resolved: true, resolution: outcome }
        });
      }
    }

    logger.info(`[ResolutionService] Successfully resolved ${resolvedCount} positions.`);
    return { resolvedPositions: resolvedCount };
  }
}
