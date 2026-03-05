import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { AdminService } from './admin.service';

const router = Router();
const adminService = new AdminService();

// GET /api/admin/markets/unfeatured
router.get('/markets/unfeatured', async (_req: Request, res: Response, next: NextFunction) => {
    try {
        const data = await adminService.getUnfeaturedMarkets();
        res.json(data);
    } catch (err) {
        next(err);
    }
});

// POST /api/admin/predictions — Create Homer Baba prediction
router.post('/predictions', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const schema = z.object({
            market_id: z.string(),
            prediction: z.enum(['YES', 'NO']),
            confidence: z.number().min(1).max(100),
            commentary: z.string().min(30).max(280),
        });
        const body = schema.parse(req.body);
        const result = await adminService.createPrediction({
            marketId: body.market_id,
            prediction: body.prediction,
            confidence: body.confidence,
            commentary: body.commentary,
        });
        res.status(201).json(result);
    } catch (err) {
        next(err);
    }
});

// POST /api/admin/daily/create — Create Daily 5 battle
router.post('/daily/create', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const schema = z.object({
            date: z.string(),
            markets: z.array(z.object({
                market_id: z.string(),
                position: z.number().min(1).max(5),
                homer_prediction: z.enum(['YES', 'NO']),
                homer_confidence: z.number().min(1).max(100),
                homer_commentary: z.string().max(280).optional(),
            })).length(5),
        });
        const body = schema.parse(req.body);
        const result = await adminService.createDailyBattle({
            date: body.date,
            markets: body.markets.map(m => ({
                marketId: m.market_id,
                position: m.position,
                homerPrediction: m.homer_prediction,
                homerConfidence: m.homer_confidence,
                homerCommentary: m.homer_commentary,
            })),
        });
        res.status(201).json(result);
    } catch (err) {
        next(err);
    }
});

// POST /api/admin/daily/:id/resolve — Resolve Daily 5 battle
router.post('/daily/:id/resolve', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const schema = z.object({
            resolutions: z.array(z.object({
                daily_battle_market_id: z.string(),
                outcome: z.enum(['YES', 'NO']),
            })),
        });
        const body = schema.parse(req.body);
        const result = await adminService.resolveDailyBattle(
            req.params.id,
            body.resolutions.map(r => ({
                dailyBattleMarketId: r.daily_battle_market_id,
                outcome: r.outcome,
            }))
        );
        res.json(result);
    } catch (err) {
        next(err);
    }
});

export { router as adminRouter };
