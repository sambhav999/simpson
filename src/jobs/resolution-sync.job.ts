
import { Queue, Worker, Job } from 'bullmq';
import { ResolutionService } from '../modules/markets/resolution.service';
import { logger } from '../core/logger/logger';
import { RedisService } from '../core/config/redis.service';

const QUEUE_NAME = 'resolution-sync';
const JOB_NAME = 'resolve-markets';
const REPEAT_INTERVAL_MS = 60 * 60 * 1000; // Every hour

export class ResolutionJob {
  private queue: Queue;
  private worker: Worker;
  private resolutionService: ResolutionService;

  constructor() {
    this.resolutionService = new ResolutionService();
    const connection = RedisService.getBullMQConnection();
    this.queue = new Queue(QUEUE_NAME, { connection });

    this.worker = new Worker(
      QUEUE_NAME,
      async (job: Job) => {
        logger.info(`[ResolutionJob] Running job: ${job.name}`);
        try {
          const result = await this.resolutionService.resolveMarkets();
          logger.info(`[ResolutionJob] Resolution complete: ${JSON.stringify(result)}`);
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Unknown';
          logger.error(`[ResolutionJob] Resolution failed: ${message}`);
          throw error;
        }
      },
      { connection }
    );
  }

  async start(): Promise<void> {
    await this.queue.add(
      JOB_NAME,
      {},
      {
        repeat: { every: REPEAT_INTERVAL_MS },
        jobId: 'resolution-recurring',
        removeOnComplete: 10,
        removeOnFail: 5,
      }
    );
    // Also run once immediately on start
    await this.queue.add(JOB_NAME, {}, { jobId: 'resolution-immediate' });
    logger.info('[ResolutionJob] Started, resolving every hour');
  }

  async stop(): Promise<void> {
    await this.worker.close();
    await this.queue.close();
    logger.info('[ResolutionJob] Stopped');
  }
}
