import { Queue, Worker, Job } from 'bullmq';
import { PrismaService } from '../core/config/prisma.service';
import { SolanaService } from '../modules/solana/solana.service';
import { AlertService } from '../core/logger/alert.service';
import { logger } from '../core/logger/logger';
import { config } from '../core/config/config';

const QUEUE_NAME = 'fee-reconciliation';
const JOB_NAME = 'reconcile-fees';
const REPEAT_INTERVAL_MS = 24 * 60 * 60 * 1000; // Daily

export class FeeReconciliationJob {
    private queue: Queue;
    private worker: Worker;
    private prisma: PrismaService;
    private solana: SolanaService;
    private alertService: AlertService;

    constructor() {
        this.prisma = PrismaService.getInstance();
        this.solana = SolanaService.getInstance();
        this.alertService = new AlertService();

        const connection = { url: config.REDIS_URL };
        this.queue = new Queue(QUEUE_NAME, { connection });

        this.worker = new Worker(
            QUEUE_NAME,
            async (job: Job) => {
                logger.info(`[FeeReconciliationJob] Running job: ${job.name}`);
                try {
                    await this.reconcileFees();
                } catch (error) {
                    const message = error instanceof Error ? error.message : 'Unknown';
                    logger.error(`[FeeReconciliationJob] Failed: ${message}`);
                    await this.alertService.sendAlert('Fee Reconciliation Failed', message);
                    throw error;
                }
            },
            { connection }
        );

        this.worker.on('failed', (job, err) => {
            logger.error(`[FeeReconciliationJob] Job ${job?.id} failed: ${err.message}`);
        });
    }

    private async reconcileFees(): Promise<void> {
        if (!config.TREASURY_WALLET) {
            logger.warn('[FeeReconciliationJob] Skipping fee reconciliation: TREASURY_WALLET is not configured.');
            return;
        }

        const treasuryAddress = config.TREASURY_WALLET;

        // Sum all fees grouped by market and tokenMint
        const expectedFees = await this.prisma.trade.groupBy({
            by: ['marketId', 'tokenMint'],
            _sum: { fee: true },
        });

        for (const group of expectedFees) {
            const expectedAmount = group._sum.fee || 0;
            if (expectedAmount === 0) continue;

            const mint = group.tokenMint;
            const marketId = group.marketId;

            const balanceInfo = await this.solana.getSpecificTokenBalance(treasuryAddress, mint);
            const actualAmount = balanceInfo ? balanceInfo.uiAmount : 0;

            const diff = Math.abs(expectedAmount - actualAmount);

            // Upsert ProtocolRevenue record
            await this.prisma.protocolRevenue.create({
                data: {
                    marketId,
                    assetMint: mint,
                    amount: expectedAmount,
                }
            });

            // Alert if significant divergence (e.g. > 1%)
            if (actualAmount === 0 && expectedAmount > 0) {
                await this.alertService.sendAlert(
                    'Fee Discordance - Missing Treasury ATA',
                    `Expected ${expectedAmount} of token ${mint} for market ${marketId}, but treasury has no ATA or 0 balance.`
                );
            } else if (actualAmount > 0 && (diff / actualAmount) > 0.01) {
                await this.alertService.sendAlert(
                    'Fee Ledger Mismatch',
                    `Database expects ${expectedAmount} collected, but on-chain treasury shows ${actualAmount} for token ${mint} in market ${marketId}.`
                );
            }
        }

        logger.info('[FeeReconciliationJob] Successfully reconciled fees.');
    }

    async start(): Promise<void> {
        await this.queue.add(
            JOB_NAME,
            {},
            {
                repeat: { every: REPEAT_INTERVAL_MS },
                jobId: 'fee-reconcile-recurring',
                removeOnComplete: 10,
                removeOnFail: 5,
            }
        );
        logger.info('[FeeReconciliationJob] Started, reconciling every 24 hours');
    }

    async stop(): Promise<void> {
        await this.worker.close();
        await this.queue.close();
    }
}
