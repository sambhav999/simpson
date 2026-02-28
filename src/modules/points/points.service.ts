import { PrismaService } from '../../core/config/prisma.service';
import { AppError } from '../../core/config/error.handler';
import { SolanaService } from '../solana/solana.service';
import { logger } from '../../core/logger/logger';

export class PointsService {
    private prisma: PrismaService;
    private solana: SolanaService;

    constructor() {
        this.prisma = PrismaService.getInstance();
        this.solana = SolanaService.getInstance();
    }

    async getBalance(walletAddress: string): Promise<number> {
        const points = await this.prisma.points.findUnique({
            where: { walletAddress },
        });
        return points?.balance || 0;
    }

    async awardPoints(walletAddress: string, amount: number, reason: string): Promise<{ balance: number }> {
        // Basic verification - checking if wallet exists on Solana (has tx history/balance) to prevent blank generated keypair Sybil
        const isValid = this.solana.validatePublicKey(walletAddress);
        if (!isValid) throw new AppError('Invalid wallet address', 400);

        // We check if it is a truly new account with 0 SOL history, but for MVP we skip the heavy RPC check
        // We rely on the IP-based rate limiter (redis) and the daily cap

        const result = await this.prisma.$transaction(async (tx) => {
            // Upsert point balance
            const points = await tx.points.upsert({
                where: { walletAddress },
                create: { walletAddress, balance: amount },
                update: { balance: { increment: amount } },
            });

            // Record ledger entry
            await tx.pointsLedger.create({
                data: {
                    walletAddress,
                    amount,
                    reason,
                },
            });

            return points;
        });

        logger.info(`Awarded ${amount} points to ${walletAddress} for ${reason}`);
        return { balance: result.balance };
    }
}
