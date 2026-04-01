import crypto from 'crypto';
import { PublicKey } from '@solana/web3.js';
import { PrismaService } from '../../core/config/prisma.service';
import { RedisService } from '../../core/config/redis.service';
import { generateToken } from '../../core/config/auth.middleware';
import { AppError } from '../../core/config/error.handler';
import { logger } from '../../core/logger/logger';

const NONCE_TTL = 300; // 5 minutes
const ED25519_SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');
const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const BASE58_MAP = new Map(BASE58_ALPHABET.split('').map((char, index) => [char, index]));

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

        const message = `SimPredicts Login\nNonce: ${storedNonce}`;
        const isValid = this.verifySolanaSignature(wallet, signature, message);
        if (!isValid) {
            throw new AppError('Invalid signature', 401);
        }

        // Delete nonce (one-time use)
        await this.redis.del(`auth:nonce:${wallet}`);

        const loginAt = new Date();

        // Upsert user and record an auth login event for leaderboard time windows
        const [user] = await this.prisma.$transaction([
            this.prisma.user.upsert({
                where: { walletAddress: wallet },
                create: {
                    walletAddress: wallet,
                    username: `user_${wallet.slice(-6).toLowerCase()}`,
                    lastLoginAt: loginAt,
                },
                update: {
                    lastLoginAt: loginAt,
                },
            }),
            this.prisma.authLogin.create({
                data: {
                    walletAddress: wallet,
                    createdAt: loginAt,
                },
            }),
        ]);

        // Generate JWT
        const token = generateToken(wallet);

        logger.info(`User authenticated: ${wallet.slice(0, 8)}...`);
        return { token, user };
    }

    private verifySolanaSignature(wallet: string, signature: string, message: string): boolean {
        try {
            const publicKeyBytes = new PublicKey(wallet).toBytes();
            const keyObject = crypto.createPublicKey({
                key: Buffer.concat([ED25519_SPKI_PREFIX, Buffer.from(publicKeyBytes)]),
                format: 'der',
                type: 'spki',
            });

            const signatureBytes = this.decodeBase58(signature);
            if (signatureBytes.length !== 64) {
                return false;
            }

            return crypto.verify(
                null,
                Buffer.from(message, 'utf8'),
                keyObject,
                signatureBytes,
            );
        } catch (error) {
            logger.warn(`Signature verification failed for ${wallet.slice(0, 8)}...`);
            return false;
        }
    }

    private decodeBase58(value: string): Buffer {
        if (!value) {
            throw new Error('Empty base58 value');
        }

        const bytes: number[] = [];
        for (const char of value) {
            const carryValue = BASE58_MAP.get(char);
            if (carryValue === undefined) {
                throw new Error('Invalid base58 character');
            }

            let carry = carryValue;
            for (let i = 0; i < bytes.length; i++) {
                const x = bytes[i] * 58 + carry;
                bytes[i] = x & 0xff;
                carry = x >> 8;
            }

            while (carry > 0) {
                bytes.push(carry & 0xff);
                carry >>= 8;
            }

            if (bytes.length === 0) {
                bytes.push(0);
            }
        }

        for (let i = 0; i < value.length && value[i] === '1'; i++) {
            bytes.push(0);
        }

        return Buffer.from(bytes.reverse());
    }
}
