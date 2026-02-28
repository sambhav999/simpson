import { Queue, Worker, Job } from 'bullmq';
import { MarketsService } from '../modules/markets/markets.service';
import { logger } from '../core/logger/logger';
import { config } from '../core/config/config';
const QUEUE_NAME = 'market-sync';
const JOB_NAME = 'sync-markets';
const REPEAT_INTERVAL_MS = 60_000;
export class MarketSyncJob {
  private queue: Queue;
  private worker: Worker;
  private marketsService: MarketsService;
  constructor() {
    this.marketsService = new MarketsService();
    const connection = { url: config.REDIS_URL };
    this.queue = new Queue(QUEUE_NAME, { connection });
    this.worker = new Worker(
      QUEUE_NAME,
      async (job: Job) => {
        logger.info(`[MarketSyncJob] Running job: ${job.name}`);
        try {
          const result = await this.marketsService.syncMarketsFromAggregator();
          logger.info(`[MarketSyncJob] Sync complete: ${JSON.stringify(result)}`);
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Unknown';
          logger.error(`[MarketSyncJob] Sync failed: ${message}`);
          throw error;
        }
      },
      { connection }
    );
    this.worker.on('completed', (job) => {
      logger.debug(`[MarketSyncJob] Job ${job.id} completed`);
    });
    this.worker.on('failed', (job, err) => {
      logger.error(`[MarketSyncJob] Job ${job?.id} failed: ${err.message}`);
    });
  }
  async start(): Promise<void> {
    await this.queue.add(
      JOB_NAME,
      {},
      {
        repeat: { every: REPEAT_INTERVAL_MS },
        jobId: 'market-sync-recurring',
        removeOnComplete: 10,
        removeOnFail: 5,
      }
    );
    await this.queue.add(JOB_NAME, {}, { jobId: 'market-sync-immediate' });
    logger.info('[MarketSyncJob] Started, syncing every 60 seconds');
  }
  async stop(): Promise<void> {
    await this.worker.close();
    await this.queue.close();
    logger.info('[MarketSyncJob] Stopped');
  }
}