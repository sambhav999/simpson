import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { PredictionsService } from './predictions.service';
import { requireAuth, optionalAuth } from '../../core/config/auth.middleware';

const router = Router();
const predictionsService = new PredictionsService();

// GET /api/predictions/ai — Homer Baba predictions (3-tier)
router.get('/ai', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const data = await predictionsService.getAIPredictions();
        res.json({ status: 'success', data });
    } catch (err) {
        next(err);
    }
});

// POST /api/predictions/track — Track user prediction
router.post('/track', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const schema = z.object({
            market_id: z.string(),
            side: z.enum(['YES', 'NO']),
            referral_code: z.string().optional(),
        });
        const { market_id, side, referral_code } = schema.parse(req.body);
        const result = await predictionsService.trackPrediction(req.user!.wallet, {
            marketId: market_id,
            side,
            referralCode: referral_code,
        });
        res.json(result);
    } catch (err) {
        next(err);
    }
});

// GET /api/predictions/user/:userId — User prediction history
router.get('/user/:userId', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { status, limit, offset } = req.query;
        const data = await predictionsService.getUserPredictions(req.params.userId, {
            status: status as string | undefined,
            limit: limit ? Number(limit) : undefined,
            offset: offset ? Number(offset) : undefined,
        });
        res.json(data);
    } catch (err) {
        next(err);
    }
});

// GET /api/predictions/misses — When AI was wrong
router.get('/misses', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { limit = '10' } = req.query;
        const misses = await predictionsService.getBigMisses(Number(limit));
        res.json(misses);
    } catch (err) {
        next(err);
    }
});

export { router as predictionsRouter };
