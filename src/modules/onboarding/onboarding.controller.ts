import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { PrismaService } from '../../core/config/prisma.service';
import { PointsService } from '../points/points.service';
import { SolanaService } from '../solana/solana.service';
import { AppError } from '../../core/config/error.handler';

const router = Router();
const prisma = PrismaService.getInstance();
const pointsService = new PointsService();
const solana = SolanaService.getInstance();

const authSchema = z.object({
    wallet: z.string(),
    signature: z.string(), // frontend signs a nonce to prove ownership
});

const profileSchema = z.object({
    wallet: z.string(),
    username: z.string().min(3).max(20),
    avatarUrl: z.string().url().optional(),
});

// Step 1: Wallet Verification / Auth
router.post('/step1-auth', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { wallet, signature } = authSchema.parse(req.body);

        // Abstracting out signature logic for MVP, we just validate the wallet format
        if (!solana.validatePublicKey(wallet)) {
            throw new AppError('Invalid Solana wallet address', 400);
        }

        // Upsert user
        const user = await prisma.user.upsert({
            where: { walletAddress: wallet },
            create: { walletAddress: wallet },
            update: {}, // login updates lastLogin etc if wanted
        });

        res.json({ message: 'Authentication successful', data: user });
    } catch (err) {
        next(err);
    }
});

// Step 2: Profile Setup
router.post('/step2-profile', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { wallet, username, avatarUrl } = profileSchema.parse(req.body);

        // Check if username is taken by someone else
        const existing = await prisma.user.findUnique({ where: { username } });
        if (existing && existing.walletAddress !== wallet) {
            throw new AppError('Username already taken', 400);
        }

        const user = await prisma.user.update({
            where: { walletAddress: wallet },
            data: { username, avatarUrl },
        });

        res.json({ message: 'Profile updated', data: user });
    } catch (err) {
        next(err);
    }
});

// Step 3: Faucet / Tutorial
router.post('/step3-faucet', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { wallet } = z.object({ wallet: z.string() }).parse(req.body);

        // Prevent double redeeming tutorial points by checking ledger
        const ledger = await prisma.pointsLedger.findFirst({
            where: { walletAddress: wallet, reason: 'completed_tutorial' }
        });

        if (ledger) {
            throw new AppError('Tutorial points already claimed', 400);
        }

        // Give 100 points as starting capital
        const result = await pointsService.awardPoints(wallet, 100, 'completed_tutorial');

        res.json({ message: 'Tutorial completed, starting points granted!', data: result });
    } catch (err) {
        next(err);
    }
});

export { router as onboardingRouter };
