import { Queue, Worker, Job } from 'bullmq';
import { PrismaService } from '../core/config/prisma.service';
import { HermesClient } from '@pythnetwork/hermes-client';
import { logger } from '../core/logger/logger';
import { config } from '../core/config/config';

const QUEUE_NAME = 'oracle-sync';
const JOB_NAME = 'sync-oracles';
const REPEAT_INTERVAL_MS = 5 * 60 * 1000; // Every 5 minutes

// Pyth Price Feed IDs (Example mappings for MVP)
const PYTH_FEEDS: Record<string, string> = {
    'Crypto': '0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43', // BTC/USD
    'Solana': '0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d', // SOL/USD
};

export class OracleSyncJob {
    private queue: Queue;
    private worker: Worker;
    private prisma: PrismaService;
    private hermesClient: HermesClient;

    constructor() {
        this.prisma = PrismaService.getInstance();

        const connection = { url: config.REDIS_URL };
        this.queue = new Queue(QUEUE_NAME, { connection });

        // Using Hermes public endpoint for Pyth
        this.hermesClient = new HermesClient('https://hermes.pyth.network');

        this.worker = new Worker(
            QUEUE_NAME,
            async (job: Job) => {
                try {
                    await this.syncOraclePrices();
                } catch (error) {
                    logger.error(`[OracleSyncJob] Failed: ${error}`);
                    throw error;
                }
            },
            { connection }
        );
    }

    private async syncOraclePrices(): Promise<void> {
        const markets = await this.prisma.market.findMany({
            where: { status: 'active' }
        });

        if (markets.length === 0) return;

        // Fetch latest prices for our tracked categories
        const feedIds = Object.values(PYTH_FEEDS);
        const priceUpdates = await this.hermesClient.getLatestPriceUpdates(feedIds);

        if (!priceUpdates || !priceUpdates.parsed) return;

        const priceMap = new Map<string, number>();
        for (const update of priceUpdates.parsed) {
            const price = update.price;
            // Price is value * 10^expo
            const actualPrice = Number(price.price) * Math.pow(10, price.expo);
            priceMap.set(update.id, actualPrice);
        }

        // Rough heuristic to pair a market with an oracle price and calculate "divergence"
        // Since this is a prediction market, "divergence" might represent the crowd's YES probability vs an AI/Baba model.
        // For MVP, we mock a "Baba" probability using the oracle price modulo 100 as a percentage (just to populate the score).

        for (const market of markets) {
            let feedId = PYTH_FEEDS['Crypto'];
            if (market.title.toLowerCase().includes('sol')) feedId = PYTH_FEEDS['Solana'];

            const oraclePrice = priceMap.get(feedId) || null;
            if (oraclePrice) {
                // Mock probability for demonstration
                const babaProbability = (oraclePrice % 100) / 100; // e.g. 0.45

                // Assume the Crowd thinks YES is 50% (0.5) if we don't have DFlow AMM odds locally
                const crowdProbability = 0.5;

                const divergenceScore = Math.abs(crowdProbability - babaProbability);

                await this.prisma.market.update({
                    where: { id: market.id },
                    data: {
                        oraclePrice,
                        divergenceScore
                    }
                });
            }
        }

        logger.info(`[OracleSyncJob] Updated divergences for ${markets.length} markets`);
    }

    async start(): Promise<void> {
        await this.queue.add(
            JOB_NAME,
            {},
            {
                repeat: { every: REPEAT_INTERVAL_MS },
                jobId: 'oracle-sync-recurring',
            }
        );
        logger.info('[OracleSyncJob] Started');
    }

    async stop(): Promise<void> {
        await this.worker.close();
        await this.queue.close();
    }
}
