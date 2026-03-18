import { PrismaClient } from '@prisma/client';
import { logger } from '../logger/logger';

export class PrismaService extends PrismaClient {
  private static instance: PrismaService;

  private constructor() {
    // Increase connection pool from Prisma default (5) to 20
    // and set pool timeout to 30s to prevent connection exhaustion under load
    const dbUrl = process.env.DATABASE_URL || '';
    const separator = dbUrl.includes('?') ? '&' : '?';
    const pooledUrl = `${dbUrl}${separator}connection_limit=20&pool_timeout=30`;

    super({
      datasourceUrl: pooledUrl,
      log: [
        { emit: 'event', level: 'query' },
        { emit: 'event', level: 'error' },
        { emit: 'event', level: 'warn' },
      ],
    });

    // @ts-expect-error prisma event types
    this.$on('error', (e: { message: string }) => {
      logger.error('Prisma error:', e.message);
    });

    // @ts-expect-error prisma event types
    this.$on('warn', (e: { message: string }) => {
      logger.warn('Prisma warning:', e.message);
    });
  }

  static getInstance(): PrismaService {
    if (!PrismaService.instance) {
      PrismaService.instance = new PrismaService();
    }
    return PrismaService.instance;
  }
}
