import Redis from 'ioredis';
import { config } from './config';
import { logger } from '../logger/logger';

export class RedisService {
  private static instance: Redis;
  private static bullmqConnection: Redis;

  static getInstance(): Redis {
    if (!RedisService.instance) {
      RedisService.instance = new Redis(config.REDIS_URL, {
        maxRetriesPerRequest: 3,
        retryStrategy: (times) => Math.min(times * 100, 3000),
        reconnectOnError: (err) => {
          logger.warn('Redis reconnect on error:', err.message);
          return true;
        },
        lazyConnect: true,
      });

      RedisService.instance.on('connect', () => logger.info('Redis connected'));
      RedisService.instance.on('error', (err) => logger.error('Redis error:', err.message));
      RedisService.instance.on('reconnecting', () => logger.warn('Redis reconnecting...'));
    }
    return RedisService.instance;
  }

  /** Shared IORedis connection for all BullMQ Queues and Workers.
   *  BullMQ requires maxRetriesPerRequest=null and enableReadyCheck=false. */
  static getBullMQConnection(): Redis {
    if (!RedisService.bullmqConnection) {
      RedisService.bullmqConnection = new Redis(config.REDIS_URL, {
        maxRetriesPerRequest: null,
        enableReadyCheck: false,
        retryStrategy: (times) => Math.min(times * 200, 5000),
        lazyConnect: true,
      });
      RedisService.bullmqConnection.on('error', (err) =>
        logger.error('BullMQ Redis error:', err.message)
      );
    }
    return RedisService.bullmqConnection;
  }

  static getNewInstance(): Redis {
    return new Redis(config.REDIS_URL, {
      maxRetriesPerRequest: 3,
      retryStrategy: (times) => Math.min(times * 100, 3000),
      lazyConnect: true,
    });
  }
}
