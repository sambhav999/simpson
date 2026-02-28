import 'dotenv/config';
import { config } from './core/config/config';
import { logger } from './core/logger/logger';
import { PrismaService } from './core/config/prisma.service';
import { RedisService } from './core/config/redis.service';
import { MarketSyncJob } from './jobs/market-sync.job';
import { PortfolioSyncJob } from './jobs/portfolio-sync.job';
import { FeeReconciliationJob } from './jobs/fee-reconciliation.job';
import { OracleSyncJob } from './jobs/oracle-sync.job';
import { SolanaListener } from './modules/solana/solana.listener';
import { buildApp } from './app';

async function bootstrap() {
  const prisma = PrismaService.getInstance();
  const redis = RedisService.getInstance();

  await prisma.$connect();
  logger.info('Connected to PostgreSQL');
  await redis.ping();
  logger.info('Connected to Redis');

  const app = buildApp();

  const marketSyncJob = new MarketSyncJob();
  const portfolioSyncJob = new PortfolioSyncJob();
  const feeReconciliationJob = new FeeReconciliationJob();
  const oracleSyncJob = new OracleSyncJob();
  const solanaListener = new SolanaListener();
  await marketSyncJob.start();
  await portfolioSyncJob.start();
  await feeReconciliationJob.start();
  await oracleSyncJob.start();
  await solanaListener.start();
  logger.info('Background jobs and listeners started');
  const port = config.PORT;
  app.listen(port, () => {
    logger.info(`SimPredict backend running on port ${port}`);
  });
  const shutdown = async () => {
    logger.info('Shutting down gracefully...');
    await marketSyncJob.stop();
    await portfolioSyncJob.stop();
    await feeReconciliationJob.stop();
    await oracleSyncJob.stop();
    await solanaListener.stop();
    await prisma.$disconnect();
    redis.disconnect();
    process.exit(0);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}
bootstrap().catch((err) => {
  logger.error('Fatal error during bootstrap', err);
  process.exit(1);
});