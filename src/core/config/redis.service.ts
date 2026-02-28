import Redis from 'ioredis';
import { config } from './config';
import { logger } from '../logger/logger';

export class RedisService {
  private static instance: Redis;

  static getInstance(): Redis {
    if (!RedisService.instance) {
      RedisService.instance = new Redis(config.REDIS_URL, {
        maxRetriesPerRequest: 3,
        retryStrategy: (times) => Math.min(times * 100, 3000),
        reconnectOnError: (err) => {
          logger.warn('Redis reconnect on error:', err.message);
          return true;
        },
      });

      RedisService.instance.on('connect', () => logger.info('Redis connected'));
      RedisService.instance.on('error', (err) => logger.error('Redis error:', err.message));
      RedisService.instance.on('reconnecting', () => logger.warn('Redis reconnecting...'));
    }
    return RedisService.instance;
  }
}
