import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import { logger } from './core/logger/logger';
import { marketsRouter } from './modules/markets/markets.controller';
import { portfolioRouter } from './modules/portfolio/portfolio.controller';
import { tradesRouter } from './modules/trades/trades.controller';
import { leaderboardRouter } from './modules/leaderboard/leaderboard.controller';
import { pointsRouter } from './modules/points/points.controller';
import { shareRouter } from './modules/share/share.controller';
import { onboardingRouter } from './modules/onboarding/onboarding.controller';
import { metricsRouter, apiResponseTime } from './modules/metrics/metrics.controller';
import { errorHandler } from './core/config/error.handler';

export function buildApp() {
    const app = express();

    // Trust proxy (required behind load balancers like DigitalOcean/Render)
    app.set('trust proxy', 1);

    app.use(helmet());
    app.use(cors({ origin: '*', methods: ['GET', 'POST', 'PUT', 'DELETE'] }));
    app.use(compression());
    app.use(express.json({ limit: '10mb' }));
    app.use(express.urlencoded({ extended: true }));
    app.use(morgan('combined', { stream: { write: (msg) => logger.http(msg.trim()) } }));

    // API Response Time middleware
    app.use((req, res, next) => {
        const start = Date.now();
        res.on('finish', () => {
            const duration = Date.now() - start;
            apiResponseTime.labels(req.method, req.route ? req.route.path : req.path, res.statusCode.toString()).observe(duration);
        });
        next();
    });

    // API Response Time middleware
    app.use((req, res, next) => {
        const start = Date.now();
        res.on('finish', () => {
            const duration = Date.now() - start;
            apiResponseTime.labels(req.method, req.route ? req.route.path : req.path, res.statusCode.toString()).observe(duration);
        });
        next();
    });

    const limiter = rateLimit({
        windowMs: 60 * 1000,
        max: 100,
        standardHeaders: true,
        legacyHeaders: false,
        message: { error: 'Too many requests, please try again later.' },
    });
    app.use(limiter);

    app.get('/health', (_req, res) => {
        res.json({ status: 'ok', timestamp: new Date().toISOString(), service: 'simpredict-backend' });
    });

    app.use('/markets', marketsRouter);
    app.use('/portfolio', portfolioRouter);
    app.use('/trade', tradesRouter);
    app.use('/leaderboard', leaderboardRouter);
    app.use('/points', pointsRouter);
    app.use('/share', shareRouter);
    app.use('/onboarding', onboardingRouter);
    app.use('/metrics', metricsRouter);

    app.use(errorHandler);

    return app;
}
