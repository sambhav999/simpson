import { PrismaService } from '../core/config/prisma.service';
import { logger } from '../core/logger/logger';

export async function runCleanupJob(): Promise<void> {
    logger.info('[CleanupJob] Starting cleanup of expired meme cards...');
    const prisma = PrismaService.getInstance();

    try {
        const expired = await prisma.memeCard.findMany({
            where: { expiresAt: { lte: new Date() } },
            select: { id: true, trackingId: true },
        });

        if (expired.length === 0) {
            logger.info('[CleanupJob] No expired meme cards found');
            return;
        }

        // TODO: Delete from R2 when R2 integration is added
        // for (const card of expired) {
        //     await r2.send(new DeleteObjectCommand({
        //         Bucket: config.R2_BUCKET_NAME,
        //         Key: `cards/${card.trackingId}.png`,
        //     }));
        // }

        // Delete from database
        const result = await prisma.memeCard.deleteMany({
            where: { expiresAt: { lte: new Date() } },
        });

        logger.info(`[CleanupJob] Deleted ${result.count} expired meme cards`);
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown';
        logger.error(`[CleanupJob] Failed: ${message}`);
    }
}
