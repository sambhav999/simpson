import { Router, Request, Response, NextFunction } from 'express';
import client from 'prom-client';
import { PrismaService } from '../../core/config/prisma.service';

const router = Router();
const prisma = PrismaService.getInstance();

// Create a Registry
export const register = new client.Registry();

// Add global default metrics
client.collectDefaultMetrics({ register });

// Custom Metrics
export const indexerLagSeconds = new client.Gauge({
    name: 'indexer_lag_seconds',
    help: 'Difference between current time and the timestamp of the last indexed trade',
});

export const tradeQuotesRequested = new client.Counter({
    name: 'trade_quotes_requested',
    help: 'Total number of trade quotes requested via DFlow',
});

export const tradesIndexedSuccessfully = new client.Counter({
    name: 'trades_indexed_successfully',
    help: 'Total number of trades successfully parsed and saved by indexer',
});

export const apiResponseTime = new client.Histogram({
    name: 'api_response_time',
    help: 'API Response time in ms',
    labelNames: ['method', 'route', 'status_code'],
});

// Register custom metrics
register.registerMetric(indexerLagSeconds);
register.registerMetric(tradeQuotesRequested);
register.registerMetric(tradesIndexedSuccessfully);
register.registerMetric(apiResponseTime);

// Expose the metrics endpoint
router.get('/', async (_req: Request, res: Response) => {
    try {
        res.set('Content-Type', register.contentType);
        res.end(await register.metrics());
    } catch (ex) {
        res.status(500).end(ex);
    }
});

router.get('/overview', async (_req: Request, res: Response, next: NextFunction) => {
    try {
        const [marketVolume, totalMarkets, activeUsers, totalPredictions] = await Promise.all([
            prisma.market.aggregate({
                _sum: { volume: true },
            }),
            prisma.market.count(),
            prisma.user.count(),
            prisma.trade.count({
                where: { side: 'BUY' },
            }),
        ]);

        res.json({
            total_volume: Number(marketVolume._sum.volume || 0),
            total_markets: totalMarkets,
            active_users: activeUsers,
            total_predictions: totalPredictions,
        });
    } catch (error) {
        next(error);
    }
});

export { router as metricsRouter };
