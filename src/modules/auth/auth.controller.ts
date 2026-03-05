import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { AuthService } from './auth.service';

const router = Router();
const authService = new AuthService();

const nonceSchema = z.object({
    wallet: z.string().min(32).max(44),
});

const verifySchema = z.object({
    wallet: z.string().min(32).max(44),
    signature: z.string().min(1),
});

// POST /auth/nonce — Generate nonce for wallet
router.post('/nonce', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { wallet } = nonceSchema.parse(req.body);
        const nonce = await authService.generateNonce(wallet);
        res.json({
            nonce,
            message: `SimPredicts Login\nNonce: ${nonce}`,
        });
    } catch (err) {
        next(err);
    }
});

// POST /auth/verify — Verify signature and issue JWT
router.post('/verify', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { wallet, signature } = verifySchema.parse(req.body);
        const result = await authService.verifyAndLogin(wallet, signature);
        res.json({
            token: result.token,
            user: result.user,
        });
    } catch (err) {
        next(err);
    }
});

export { router as authRouter };
