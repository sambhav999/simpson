import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function rotateAIOracle() {
    console.log('🔮 --- Rotating AI Oracle Predictions (Target: 36) ---');

    // 1. Get all current active AI predictions
    const currentPredictions = await prisma.aIPrediction.findMany({
        where: { resolved: false },
        orderBy: { createdAt: 'asc' } // Oldest first
    });

    console.log(`Current active predictions: ${currentPredictions.length}`);

    // 2. Identify and remove oldest
    // To maintain 36 after adding at least 6, we need to have 30 survivors.
    // If we have LESS than 30, we don't remove anything yet to reach the target faster.
    const removeCount = currentPredictions.length >= 36 ? 6 : 0;
    
    if (removeCount > 0) {
        const toRemove = currentPredictions.slice(0, removeCount);
        console.log(`Removing ${toRemove.length} oldest predictions.`);
        await prisma.aIPrediction.deleteMany({
            where: { id: { in: toRemove.map(p => p.id) } }
        });
    }

    // 3. Add new predictions to reach 36
    const countAfterRemoval = currentPredictions.length - removeCount;
    const toAddCount = Math.max(6, 36 - countAfterRemoval);

    const newMarkets = await prisma.market.findMany({
        where: {
            status: 'active',
            resolved: false,
            aiPredictions: { none: {} },
            dailyBattleMarkets: { none: {} }
        },
        take: toAddCount,
        orderBy: { volume: 'desc' }
    });

    console.log(`Adding ${newMarkets.length} new predictions to reaching pool of 36.`);

    for (let i = 0; i < newMarkets.length; i++) {
        const m = newMarkets[i];
        const side = Math.random() > 0.5 ? 'YES' : 'NO';
        const conf = 75 + Math.floor(Math.random() * 20);

        await prisma.aIPrediction.create({
            data: {
                id: `ai-rot-${m.id}-${Date.now()}`,
                marketId: m.id,
                prediction: side,
                confidence: conf,
                commentary: `The oracle sees a clear signal for ${side} in the ${m.category} arena today.`,
                featured: true,
                featuredRank: i + 1
            }
        });
    }
}

async function rotateDailyBattle() {
    console.log('\n⚔️ --- Rotating Daily Challenge (Target: 36) ---');

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const lastBattle = await prisma.dailyBattle.findFirst({
        orderBy: { date: 'desc' },
        include: { markets: { orderBy: { position: 'asc' } } }
    });

    // 1. Determine how many to carry over (Target 36, want to add at least 6)
    const currentCount = lastBattle?.markets.length || 0;
    const removeCount = currentCount >= 36 ? 6 : 0;
    const carryOverCount = currentCount - removeCount;
    const marketsToCarryOver = lastBattle ? lastBattle.markets.slice(removeCount) : [];
    
    console.log(`Carrying over ${marketsToCarryOver.length} markets.`);

    // 2. Find new markets to reach 36
    const toAddCount = Math.max(6, 36 - carryOverCount);
    const existingMarketIds = marketsToCarryOver.map(bm => bm.marketId);
    
    const newMarkets = await prisma.market.findMany({
        where: {
            status: 'active',
            resolved: false,
            id: { notIn: existingMarketIds },
            aiPredictions: { none: {} }
        },
        take: toAddCount,
        orderBy: { volume: 'desc' }
    });

    console.log(`Adding ${newMarkets.length} new markets to reach 36.`);

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
                    ...marketsToCarryOver.map((bm, idx) => ({
                        marketId: bm.marketId,
                        position: idx + 1,
                        homerPrediction: bm.homerPrediction,
                        homerConfidence: bm.homerConfidence,
                        homerCommentary: bm.homerCommentary
                    })),
                    ...newMarkets.map((m, idx) => ({
                        marketId: m.id,
                        position: marketsToCarryOver.length + idx + 1,
                        homerPrediction: Math.random() > 0.5 ? 'YES' : 'NO',
                        homerConfidence: 60 + Math.floor(Math.random() * 30),
                        homerCommentary: `Homer Baba detects strong currents in ${m.category} for this market.`
                    }))
                ]
            }
        }
    });

    console.log(`✅ Created daily battle with ${marketsToCarryOver.length + newMarkets.length} markets.`);
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
