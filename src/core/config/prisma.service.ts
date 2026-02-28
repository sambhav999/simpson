import { PrismaClient } from '@prisma/client';
import { logger } from '../logger/logger';

export class PrismaService extends PrismaClient {
  private static instance: PrismaService;

  private constructor() {
    super({
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
