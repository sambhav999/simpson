import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('--- Pruning Excess Kalshi Markets ---');

    // Check how many we have
    const kalshiCount = await prisma.market.count({
        where: { source: 'kalshi' }
    });

    console.log(`Current Kalshi market count: ${kalshiCount}`);

    const targetTotal = 35000;

    if (kalshiCount <= targetTotal) {
        console.log('No pruning needed. Count is within limits.');
        return;
    }

    const excess = kalshiCount - targetTotal;
    console.log(`Found ${excess} excess Kalshi markets. Pruning...`);

    // Find the threshold ID for the 35,000 most recent ones
    // We order by id descending (newest first) and skip the first 35,000.
    // The next one is the newest market that should be deleted.
    const thresholdMarket = await prisma.market.findFirst({
        where: { source: 'kalshi' },
        orderBy: { id: 'desc' },
        skip: 35000,
        select: { id: true }
    });

    if (!thresholdMarket) {
        console.log('No markets found to prune after skipping 35,000.');
        return;
    }

    const thresholdId = thresholdMarket.id;
    console.log(`Threshold ID for pruning: ${thresholdId}`);

    // Delete all markets with ID <= thresholdId
    const result = await prisma.market.deleteMany({
        where: {
            source: 'kalshi',
            id: { lte: thresholdId }
        }
    });

    console.log(`✅ Successfully pruned ${result.count} Kalshi markets.`);

    const newCount = await prisma.market.count({
        where: { source: 'kalshi' }
    });
    console.log(`New Kalshi market count: ${newCount}`);
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
