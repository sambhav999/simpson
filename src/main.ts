import 'dotenv/config';
import { config } from './core/config/config';
import { logger } from './core/logger/logger';
import { PrismaService } from './core/config/prisma.service';
import { RedisService } from './core/config/redis.service';
import { MarketSyncJob } from './jobs/market-sync.job';
import { PortfolioSyncJob } from './jobs/portfolio-sync.job';
import { FeeReconciliationJob } from './jobs/fee-reconciliation.job';
import { OracleSyncJob } from './jobs/oracle-sync.job';
import { ResolutionJob } from './jobs/resolution-sync.job';
import { DailyRotationJob } from './jobs/daily-rotation.job';
import { SolanaListener } from './modules/solana/solana.listener';
import { buildApp } from './app';
import { SocketService } from './core/socket/socket.service';
import { ExternalStreamsService } from './modules/streams/external-streams.service';

async function bootstrap() {
  const prisma = PrismaService.getInstance();
  const redis = RedisService.getInstance();

  await prisma.$connect();
  logger.info('Connected to PostgreSQL');
  await redis.ping();
  logger.info('Connected to Redis');

  const app = buildApp();
  const server = require('http').createServer(app);
  const socketService = SocketService.getInstance();
  socketService.init(server);

  const externalStreamsService = new ExternalStreamsService();
  externalStreamsService.start();

  const marketSyncJob = new MarketSyncJob();
  const portfolioSyncJob = new PortfolioSyncJob();
  const feeReconciliationJob = new FeeReconciliationJob();
  const oracleSyncJob = new OracleSyncJob();
  const resolutionJob = new ResolutionJob();
  const dailyRotationJob = new DailyRotationJob();
  const solanaListener = new SolanaListener();
  const isInstance0 = process.env.NODE_APP_INSTANCE === '0' || !process.env.NODE_APP_INSTANCE;

  const port = config.PORT;
  server.listen(port, () => {
    logger.info(`Predex backend running on port ${port}`);
  });

  if (isInstance0) {
    marketSyncJob.start().catch(err => logger.error('MarketSyncJob failed to start', err));
    portfolioSyncJob.start().catch(err => logger.error('PortfolioSyncJob failed to start', err));
    feeReconciliationJob.start().catch(err => logger.error('FeeReconciliationJob failed to start', err));
    oracleSyncJob.start().catch(err => logger.error('OracleSyncJob failed to start', err));
    resolutionJob.start().catch(err => logger.error('ResolutionJob failed to start', err));
    dailyRotationJob.start().catch(err => logger.error('DailyRotationJob failed to start', err));
    solanaListener.start().catch(err => logger.error('SolanaListener failed to start', err));
    logger.info('Background jobs and listeners initiated (Instance 0)');
  } else {
    logger.info(`API Instance ${process.env.NODE_APP_INSTANCE} started (Jobs disabled)`);
  }
  const shutdown = async () => {
    logger.info('Shutting down gracefully...');
    await marketSyncJob.stop();
    await portfolioSyncJob.stop();
    await feeReconciliationJob.stop();
    await oracleSyncJob.stop();
    await resolutionJob.stop();
    await dailyRotationJob.stop();
    await solanaListener.stop();
    externalStreamsService.stop();
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