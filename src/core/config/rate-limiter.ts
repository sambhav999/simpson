import { Request, Response, NextFunction } from 'express';
import { RedisService } from './redis.service';
import { AppError } from './error.handler';
import { logger } from '../logger/logger';

export const sybilRateLimiter = (actionPath: string, limitPoints: number, windowMs: number) => {
    return async (req: Request, _res: Response, next: NextFunction) => {
        try {
            const redis = RedisService.getInstance();
            const ip = req.ip || req.socket.remoteAddress || 'unknown';
            const key = `ratelimit:${actionPath}:${ip}`;

            const requests = await redis.incr(key);

            if (requests === 1) {
                await redis.pexpire(key, windowMs);
            }

            if (requests > limitPoints) {
                logger.warn(`Sybil protection triggered for IP: ${ip} on ${actionPath}`);
                return next(new AppError('Action limit reached. Please try again later.', 429));
            }

            next();
        } catch (error) {
            next(error);
        }
    };
};
