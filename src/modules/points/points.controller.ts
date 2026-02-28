import { Router, Request, Response, NextFunction } from 'express';
import { PointsService } from './points.service';
import { sybilRateLimiter } from '../../core/config/rate-limiter';
import { z } from 'zod';

const router = Router();
const pointsService = new PointsService();

const awardSchema = z.object({
    wallet: z.string(),
    reason: z.string(),
});

// GET /points/:wallet
router.get('/:wallet', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const balance = await pointsService.getBalance(req.params.wallet);
        res.json({ data: { balance } });
    } catch (err) {
        next(err);
    }
});

// POST /points/award/social
// Limit to 2 per 24 hours per IP
router.post(
    '/award/social',
    sybilRateLimiter('award_social_share', 2, 24 * 60 * 60 * 1000),
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            const { wallet, reason } = awardSchema.parse(req.body);

            // Give 50 points per social share
            const result = await pointsService.awardPoints(wallet, 50, reason);
            res.json({ data: result });
        } catch (err) {
            next(err);
        }
    }
);

// POST /points/award/daily_login
// Limit to 1 per 24 hours per IP
router.post(
    '/award/daily_login',
    sybilRateLimiter('award_daily_login', 1, 24 * 60 * 60 * 1000),
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            const { wallet } = awardSchema.pick({ wallet: true }).parse(req.body);

            // Give 10 points daily login
            const result = await pointsService.awardPoints(wallet, 10, 'daily_login');
            res.json({ data: result });
        } catch (err) {
            next(err);
        }
    }
);

export { router as pointsRouter };
