import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('--- Checking Database Stats ---');
    const [battles, aiPreds, users, trades] = await Promise.all([
        prisma.dailyBattle.count(),
        prisma.aIPrediction.count(),
        prisma.user.count(),
        prisma.trade.count()
    ]);

    console.log(`Daily Battles: ${battles}`);
    console.log(`AI Predictions: ${aiPreds}`);
    console.log(`Users: ${users}`);
    console.log(`Trades: ${trades}`);

    if (battles === 0) {
        console.log('\nNO DAILY BATTLES FOUND. Run seed script or manual creation needed.');
    }
    if (aiPreds === 0) {
        console.log('NO AI PREDICTIONS FOUND. Homer Baba is silent.');
    }
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
