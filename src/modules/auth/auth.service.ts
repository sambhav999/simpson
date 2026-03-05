import crypto from 'crypto';
import { PrismaService } from '../../core/config/prisma.service';
import { RedisService } from '../../core/config/redis.service';
import { generateToken } from '../../core/config/auth.middleware';
import { AppError } from '../../core/config/error.handler';
import { logger } from '../../core/logger/logger';

const NONCE_TTL = 300; // 5 minutes

export class AuthService {
    private readonly prisma = PrismaService.getInstance();
    private readonly redis = RedisService.getInstance();

    /**
     * Generate a nonce for wallet authentication
     */
    async generateNonce(wallet: string): Promise<string> {
        if (!wallet || wallet.length < 32 || wallet.length > 44) {
            throw new AppError('Invalid wallet address', 400);
        }

        const nonce = crypto.randomBytes(32).toString('hex');
        await this.redis.setex(`auth:nonce:${wallet}`, NONCE_TTL, nonce);
        logger.debug(`Nonce generated for wallet ${wallet.slice(0, 8)}...`);
        return nonce;
    }

    /**
     * Verify wallet signature and issue JWT
     * For V1 MVP: we skip actual signature verification and just validate the nonce exists
     */
    async verifyAndLogin(wallet: string, signature: string): Promise<{ token: string; user: any }> {
        if (!wallet || wallet.length < 32 || wallet.length > 44) {
            throw new AppError('Invalid wallet address', 400);
        }

        if (!signature) {
            throw new AppError('Signature is required', 400);
        }

        // Check nonce exists (proves they requested auth recently)
        const storedNonce = await this.redis.get(`auth:nonce:${wallet}`);
        if (!storedNonce) {
            throw new AppError('Nonce expired or not found. Request a new nonce.', 401);
        }

        // TODO: V2 — Verify actual Solana signature using nacl/tweetnacl
        // const message = `SimPredicts Login\nNonce: ${storedNonce}`;
        // const isValid = nacl.sign.detached.verify(
        //     new TextEncoder().encode(message),
        //     base58.decode(signature),
        //     new PublicKey(wallet).toBytes()
        // );
        // if (!isValid) throw new AppError('Invalid signature', 401);

        // Delete nonce (one-time use)
        await this.redis.del(`auth:nonce:${wallet}`);

        // Upsert user
        const user = await this.prisma.user.upsert({
            where: { walletAddress: wallet },
            create: { walletAddress: wallet },
            update: {},
        });

        // Generate JWT
        const token = generateToken(wallet);

        logger.info(`User authenticated: ${wallet.slice(0, 8)}...`);
        return { token, user };
    }
}
