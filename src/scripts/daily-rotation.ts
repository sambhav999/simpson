import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

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

async function rotateAIOracle() {
    console.log('🔮 --- Rotating AI Oracle Predictions (Target: 100) ---');

    const now = new Date();

    // 1. Cleanup: De-feature any predictions whose markets are no longer active
    const cleanupResult = await prisma.aIPrediction.updateMany({
        where: {
            featured: true,
            OR: [
                { resolved: true },
                { market: { OR: [{ status: { not: 'active' } }, { closesAt: { lt: now } }] } }
            ]
        },
        data: { featured: false, featuredRank: null }
    });
    console.log(`Cleaned up ${cleanupResult.count} featured predictions from resolved/expired markets.`);

    // 2. Increment ranks of existing featured predictions
    await prisma.aIPrediction.updateMany({
        where: { featured: true },
        data: { featuredRank: { increment: 10 } }
    });

    // 3. Demote those that fell out of the top 100
    const demotionResult = await prisma.aIPrediction.updateMany({
        where: { featured: true, featuredRank: { gt: 100 } },
        data: { featured: false, featuredRank: null }
    });
    console.log(`Demoted ${demotionResult.count} predictions to 'Old' status.`);

    // 4. Add 10 new predictions
    const targetAdd = 10;
    const newMarkets = await prisma.market.findMany({
        where: {
            status: 'active',
            resolved: false,
            OR: [
                { closesAt: { gt: now } },
                { AND: [{ closesAt: null }, { expiry: { gt: now } }] }
            ],
            aiPredictions: { none: {} },
            dailyBattleMarkets: { none: {} }
        },
        take: targetAdd,
        orderBy: { volume: 'desc' }
    });

    console.log(`Adding ${newMarkets.length} new predictions as 'Today\'s Prediction'.`);

    for (let i = 0; i < newMarkets.length; i++) {
        const m = newMarkets[i];
        const side = Math.random() > 0.5 ? 'YES' : 'NO';
        const conf = 75 + Math.floor(Math.random() * 20);

        const cat = m.category === 'Crypto' ? 'Crypto' : 'General';
        const templates = debateTemplates[cat];
        const bullText = templates.bull[Math.floor(Math.random() * templates.bull.length)];
        const bearText = templates.bear[Math.floor(Math.random() * templates.bear.length)];

        await prisma.aIPrediction.create({
            data: {
                marketId: m.id,
                prediction: side,
                confidence: conf,
                summaryCommentary: `The oracle sees a clear signal for ${side} in the ${m.category} arena today.`,
                bullishCommentary: bullText,
                bearishCommentary: bearText,
                featured: true,
                featuredRank: i + 1 // Newest get ranks 1-10
            }
        });
    }
}

async function rotateDailyBattle() {
    console.log('\n⚔️ --- Rotating Daily Challenge (Target: 100) ---');

    const now = new Date();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const lastBattle = await prisma.dailyBattle.findFirst({
        orderBy: { date: 'desc' },
        include: { markets: { orderBy: { position: 'asc' } } }
    });

    // 1. Determine how many to carry over (Target 100, want to add 10)
    const currentCount = lastBattle?.markets.length || 0;
    const removeCount = currentCount >= 100 ? 10 : 0;
    const carryOverCount = currentCount - removeCount;
    const marketsToCarryOver = lastBattle ? lastBattle.markets.slice(removeCount) : [];
    
    console.log(`Carrying over ${marketsToCarryOver.length} markets.`);

    // 2. Find new markets to reach 100
    const targetAdd = 10;
    const toAddCount = Math.max(targetAdd, 100 - carryOverCount);
    const existingMarketIds = marketsToCarryOver.map(bm => bm.marketId);
    
    const newMarkets = await prisma.market.findMany({
        where: {
            status: 'active',
            resolved: false,
            OR: [
                { closesAt: { gt: now } },
                { AND: [{ closesAt: null }, { expiry: { gt: now } }] }
            ],
            id: { notIn: existingMarketIds },
            aiPredictions: { none: {} }
        },
        take: toAddCount,
        orderBy: { volume: 'desc' }
    });

    console.log(`Adding ${newMarkets.length} new markets to reach 100.`);

    // 3. Create or Update today's battle
    const existingToday = await prisma.dailyBattle.findUnique({
        where: { date: today }
    });

    if (existingToday) {
        console.log('Today\'s battle already exists. Skipping creation.');
        return;
    }

    await prisma.dailyBattle.create({
        data: {
            date: today,
            status: 'active',
            markets: {
                create: [
                    ...marketsToCarryOver.map((bm: any, idx) => ({
                        marketId: bm.marketId,
                        position: idx + 1,
                        homerPrediction: bm.homerPrediction,
                        homerConfidence: bm.homerConfidence,
                        homerCommentary: bm.homerCommentary,
                        bullishCommentary: bm.bullishCommentary,
                        bearishCommentary: bm.bearishCommentary
                    })),
                    ...newMarkets.map((m, idx) => {
                        const cat = m.category === 'Crypto' ? 'Crypto' : 'General';
                        const templates = debateTemplates[cat];
                        const bullText = templates.bull[Math.floor(Math.random() * templates.bull.length)];
                        const bearText = templates.bear[Math.floor(Math.random() * templates.bear.length)];
                        
                        return {
                            marketId: m.id,
                            position: marketsToCarryOver.length + idx + 1,
                            homerPrediction: Math.random() > 0.5 ? 'YES' : 'NO',
                            homerConfidence: 60 + Math.floor(Math.random() * 30),
                            homerCommentary: `Homer Baba detects strong currents in ${m.category} for this market.`,
                            bullishCommentary: bullText,
                            bearishCommentary: bearText
                        };
                    })
                ]
            }
        }
    });

    console.log(`✅ Created daily battle with ${marketsToCarryOver.length + newMarkets.length} markets and debates.`);
}

async function main() {
    try {
        await rotateAIOracle();
        await rotateDailyBattle();
        console.log('\n✨ Rotation Complete!');
    } catch (error) {
        console.error('Rotation failed:', error);
    } finally {
        await prisma.$disconnect();
    }
}

main();
