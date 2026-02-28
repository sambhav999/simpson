import { Queue, Worker, Job } from 'bullmq';
import { PortfolioService } from '../modules/portfolio/portfolio.service';
import { PrismaService } from '../core/config/prisma.service';
import { LeaderboardService } from '../modules/leaderboard/leaderboard.service';
import { logger } from '../core/logger/logger';
import { config } from '../core/config/config';
const QUEUE_NAME = 'portfolio-sync';
const JOB_NAME = 'sync-portfolios';
const REPEAT_INTERVAL_MS = 30_000;
const LEADERBOARD_INTERVAL_MS = 300_000;
export class PortfolioSyncJob {
  private queue: Queue;
  private worker: Worker;
  private portfolioService: PortfolioService;
  private leaderboardService: LeaderboardService;
  private prisma: PrismaService;
  constructor() {
    this.portfolioService = new PortfolioService();
    this.leaderboardService = new LeaderboardService();
    this.prisma = PrismaService.getInstance();
    const connection = { url: config.REDIS_URL };
    this.queue = new Queue(QUEUE_NAME, { connection });
    this.worker = new Worker(
      QUEUE_NAME,
      async (job: Job) => {
        if (job.name === 'sync-portfolios') {
          await this.syncAllPortfolios();
        } else if (job.name === 'update-leaderboard') {
          await this.leaderboardService.updateLeaderboard();
        }
      },
      { connection, concurrency: 5 }
    );
    this.worker.on('completed', (job) => {
      logger.debug(`[PortfolioSyncJob] Job ${job.id} completed`);
    });
    this.worker.on('failed', (job, err) => {
      logger.error(`[PortfolioSyncJob] Job ${job?.id} failed: ${err.message}`);
    });
  }
  private async syncAllPortfolios(): Promise<void> {
    const users = await this.prisma.user.findMany({
      select: { walletAddress: true },
      take: 500,
    });
    logger.info(`[PortfolioSyncJob] Syncing ${users.length} wallets`);
    const batchSize = 10;
    for (let i = 0; i < users.length; i += batchSize) {
      const batch = users.slice(i, i + batchSize);
      await Promise.allSettled(
        batch.map((u) => this.portfolioService.syncWalletPositions(u.walletAddress))
      );
    }
    logger.info('[PortfolioSyncJob] Portfolio sync complete');
  }
  async start(): Promise<void> {
    await this.queue.add(
      JOB_NAME,
      {},
      {
        repeat: { every: REPEAT_INTERVAL_MS },
        jobId: 'portfolio-sync-recurring',
        removeOnComplete: 10,
        removeOnFail: 5,
      }
    );
    await this.queue.add(
      'update-leaderboard',
      {},
      {
        repeat: { every: LEADERBOARD_INTERVAL_MS },
        jobId: 'leaderboard-update-recurring',
        removeOnComplete: 5,
        removeOnFail: 3,
      }
    );
    logger.info('[PortfolioSyncJob] Started, syncing every 30 seconds');
  }
  async stop(): Promise<void> {
    await this.worker.close();
    await this.queue.close();
    logger.info('[PortfolioSyncJob] Stopped');
  }
}