import { LeaderboardService } from '../modules/leaderboard/leaderboard.service';
import { logger } from '../core/logger/logger';

const leaderboardService = new LeaderboardService();

export async function runLeaderboardUpdateJob(): Promise<void> {
    logger.info('[LeaderboardUpdateJob] Starting daily leaderboard update...');
    try {
        await leaderboardService.updateLeaderboard();
        logger.info('[LeaderboardUpdateJob] Leaderboard updated successfully');
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown';
        logger.error(`[LeaderboardUpdateJob] Failed: ${message}`);
    }
}
