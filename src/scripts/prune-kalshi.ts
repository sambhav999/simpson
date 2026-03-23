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
    
    // Find the oldest excess markets by ID
    const oldestMarkets = await prisma.market.findMany({
        where: { source: 'kalshi' },
        orderBy: { id: 'asc' }, // Use id (ObjectId) which is indexed and contains timestamp
        select: { id: true },
        take: excess
    });
    
    const marketIdsToDelete = oldestMarkets.map(m => m.id);
    
    // Delete in batches to avoid overwhelming the database
    let deletedCount = 0;
    const BATCH_SIZE = 10000;
    
    for (let i = 0; i < marketIdsToDelete.length; i += BATCH_SIZE) {
        const batch = marketIdsToDelete.slice(i, i + BATCH_SIZE);
        const result = await prisma.market.deleteMany({
            where: {
                id: { in: batch }
            }
        });
        deletedCount += result.count;
        console.log(`Deleted ${deletedCount} / ${excess} excess markets...`);
    }
    
    console.log(`✅ Successfully pruned ${deletedCount} Kalshi markets.`);
    
    const newCount = await prisma.market.count({
        where: { source: 'kalshi' }
    });
    console.log(`New Kalshi market count: ${newCount}`);
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
