import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('--- Seeding Daily Arena & AI Oracle ---');

    // 1. Get some existing markets
    const markets = await prisma.market.findMany({ take: 5 });
    if (markets.length < 5) {
        console.log('Error: Not enough markets in DB. Please run an aggregator sync first.');
        return;
    }

    // 2. Create today's Daily Battle if not exists
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const existingBattle = await prisma.dailyBattle.findFirst({
        where: { date: today }
    });

    if (!existingBattle) {
        const battle = await prisma.dailyBattle.create({
            data: {
                date: today,
                status: 'active',
                markets: {
                    create: markets.map((m, i) => ({
                        marketId: m.id,
                        position: i + 1,
                        homerPrediction: i % 2 === 0 ? 'YES' : 'NO',
                        homerConfidence: 70 + (i * 5),
                        homerCommentary: `Homer Baba sees great signal in ${m.category} today.`,
                    }))
                }
            }
        });
        console.log(`✅ Created Daily Battle for today: ${battle.id}`);
    } else {
        console.log('ℹ️ Daily Battle for today already exists.');
    }

    // 3. Create some AI Predictions
    for (let i = 0; i < 3; i++) {
        const m = markets[i];
        await prisma.aIPrediction.upsert({
            where: { id: `ai-pred-${m.id}` }, // Fixed ID for semi-idempotency
            update: {},
            create: {
                id: `ai-pred-${m.id}`,
                marketId: m.id,
                prediction: i % 2 === 0 ? 'YES' : 'NO',
                confidence: 85 - (i * 2),
                commentary: `The oracle suggests a strong ${i % 2 === 0 ? 'YES' : 'NO'} position for this ${m.category} market.`,
                featured: true,
                featuredRank: i + 1
            }
        });
    }
    console.log('✅ Upserted 3 AI Predictions.');

    console.log('--- Seeding Complete ---');
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
