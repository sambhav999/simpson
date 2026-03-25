import { Queue, Worker, Job } from 'bullmq';
import { PrismaService } from '../core/config/prisma.service';
import { logger } from '../core/logger/logger';
import { RedisService } from '../core/config/redis.service';

const QUEUE_NAME = 'daily-rotation';
const JOB_NAME = 'rotate-daily';
const REPEAT_INTERVAL_MS = 24 * 60 * 60 * 1000; // Once every 24 hours

const debateTemplates: Record<string, { bull: string[], bear: string[] }> = {
    'Crypto': {
        bull: [
            "Liquidity is surging into the sector, and technicals suggest a breakout is imminent.",
            "Whale accumulation patterns are clear. This momentum is too strong to ignore.",
            "Institutional interest is reaching a seasonal high. The macro trend favors this move."
        ],
        bear: [
            "Regulatory headwinds and shifting retail sentiment could lead to a sharp correction.",
            "On-chain signals show signs of exhaustion. It's a classic overbought signal.",
            "Market makers are positioning for a liquidity sweep. Watch for a trap."
        ]
    },
    'General': {
        bull: [
            "Sentiment analysis of global news cycles points toward a positive resolution.",
            "Historical data from similar socio-economic events suggests a high success probability.",
            "Converging data points from multiple independent sources confirm a bullish bias."
        ],
        bear: [
            "Hidden volatility in related sectors could derail the current trend quite rapidly.",
            "Excessive optimism in the crowd often precedes a negative surprise here.",
            "Algorithmic synthesis suggests the risk-to-reward ratio is currently unfavorable."
        ]
    }
};

export class DailyRotationJob {
    private queue: Queue;
    private worker: Worker;
    private prisma: PrismaService;

    constructor() {
        this.prisma = PrismaService.getInstance();
        const connection = RedisService.getBullMQConnection();
        this.queue = new Queue(QUEUE_NAME, { connection: connection as any });

        this.worker = new Worker(
            QUEUE_NAME,
            async (job: Job) => {
                logger.info(`[DailyRotationJob] Running: ${job.name}`);
                try {
                    await this.rotateAIOracle();
                    await this.rotateDailyBattle();
                    logger.info(`[DailyRotationJob] Rotation complete for ${new Date().toDateString()}`);
                } catch (error) {
                    logger.error(`[DailyRotationJob] Failed: ${error}`);
                    throw error;
                }
            },
            { connection: connection as any }
        );
    }

    private async rotateAIOracle() {
        logger.info('🔮 --- Rotating AI Oracle Predictions ---');
        const now = new Date();

        // 1. Cleanup: De-feature any predictions whose markets are no longer active
        const cleanupResult = await this.prisma.aIPrediction.updateMany({
            where: {
                featured: true,
                OR: [
                    { resolved: true },
                    { market: { OR: [{ status: { not: 'active' } }, { closesAt: { lt: now } }] } }
                ]
            },
            data: { featured: false, featuredRank: null }
        });
        logger.info(`Cleaned up ${cleanupResult.count} featured predictions.`);

        // 2. Increment ranks of existing featured predictions
        await this.prisma.aIPrediction.updateMany({
            where: { featured: true },
            data: { featuredRank: { increment: 10 } }
        });

        // 3. Demote those that fell out of the top 100
        const demotionResult = await this.prisma.aIPrediction.updateMany({
            where: { featured: true, featuredRank: { gt: 100 } },
            data: { featured: false, featuredRank: null }
        });
        logger.info(`Demoted ${demotionResult.count} predictions to 'Old' status.`);

        // 4. Add 10 new predictions
        const targetAdd = 10;
        const newMarkets = await this.prisma.market.findMany({
            where: {
                status: 'active',
                resolved: false,
                OR: [
                    { closesAt: { gt: now } },
                    { expiry: { gt: now } }
                ],
                aiPredictions: { none: {} },
                dailyBattleMarkets: { none: {} }
            },
            take: targetAdd,
            orderBy: { volume: 'desc' }
        });

        logger.info(`Adding ${newMarkets.length} new predictions as 'Today\'s Prediction'.`);

        for (let i = 0; i < newMarkets.length; i++) {
            const m = newMarkets[i];
            const side = Math.random() > 0.5 ? 'YES' : 'NO';
            const conf = 75 + Math.floor(Math.random() * 20);

            const cat = m.category === 'Crypto' ? 'Crypto' : 'General';
            const templates = debateTemplates[cat];
            const bullText = templates.bull[Math.floor(Math.random() * templates.bull.length)];
            const bearText = templates.bear[Math.floor(Math.random() * templates.bear.length)];

            await this.prisma.aIPrediction.create({
                data: {
                    marketId: m.id,
                    prediction: side,
                    confidence: conf,
                    summaryCommentary: `The oracle sees a clear signal for ${side} in the ${m.category} arena today.`,
                    bullishCommentary: bullText,
                    bearishCommentary: bearText,
                    featured: true,
                    featuredRank: i + 1
                }
            });
        }
    }

    private async rotateDailyBattle() {
        logger.info('⚔️ --- Rotating Daily Challenge ---');
        const now = new Date();
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const targetAdd = 10;
        const newMarkets = await this.prisma.market.findMany({
            where: {
                status: 'active',
                resolved: false,
                OR: [
                    { closesAt: { gt: now } },
                    { expiry: { gt: now } }
                ],
                aiPredictions: { none: {} },
                dailyBattleMarkets: { none: {} }
            },
            take: targetAdd,
            orderBy: { volume: 'desc' }
        });

        const existingToday = await this.prisma.dailyBattle.findUnique({
            where: { date: today }
        });

        if (existingToday) {
            logger.info('Today\'s battle already exists. Skipping creation.');
            return;
        }

        await this.prisma.dailyBattle.create({
            data: {
                date: today,
                status: 'active',
                markets: {
                    create: newMarkets.map((m, idx) => {
                        const cat = m.category === 'Crypto' ? 'Crypto' : 'General';
                        const templates = debateTemplates[cat];
                        return {
                            marketId: m.id,
                            position: idx + 1,
                            homerPrediction: Math.random() > 0.5 ? 'YES' : 'NO',
                            homerConfidence: 60 + Math.floor(Math.random() * 30),
                            homerCommentary: `Homer Baba detects strong currents in ${m.category} for this market.`,
                            bullishCommentary: templates.bull[Math.floor(Math.random() * templates.bull.length)],
                            bearishCommentary: templates.bear[Math.floor(Math.random() * templates.bear.length)]
                        };
                    })
                }
            }
        });
        logger.info(`✅ Created daily battle with ${newMarkets.length} markets.`);
    }

    async start(): Promise<void> {
        await this.queue.add(
            JOB_NAME,
            {},
            {
                repeat: { every: REPEAT_INTERVAL_MS },
                jobId: 'daily-rotation-recurring',
                removeOnComplete: true
            }
        );
        logger.info('[DailyRotationJob] Started');
    }

    async stop(): Promise<void> {
        await this.worker.close();
        await this.queue.close();
    }
}
