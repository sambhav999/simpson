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
    
    let currentKalshiCount = kalshiCount;
    const BATCH_SIZE = 5000;
    let totalDeleted = 0;
    
    console.log(`Starting batch pruning of ${excess} markets...`);
    
    while (currentKalshiCount > targetTotal) {
        const toDeleteCount = Math.min(BATCH_SIZE, currentKalshiCount - targetTotal);
        
        // Find the oldest markets in this batch
        const batchToPrune = await prisma.market.findMany({
            where: { source: 'kalshi' },
            orderBy: { id: 'asc' },
            select: { id: true },
            take: toDeleteCount
        });
        
        if (batchToPrune.length === 0) break;
        
        const ids = batchToPrune.map(m => m.id);
        const result = await prisma.market.deleteMany({
            where: { id: { in: ids } }
        });
        
        totalDeleted += result.count;
        currentKalshiCount -= result.count;
        
        console.log(`Deleted ${result.count} markets. Progress: ${totalDeleted}/${excess} pruned. Current count: ${currentKalshiCount}`);
        
        // Brief pause to allow DB to breathe
        await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    console.log(`✅ Successfully pruned ${totalDeleted} Kalshi markets in total.`);
    
    const newCount = await prisma.market.count({
        where: { source: 'kalshi' }
    });
    console.log(`New Kalshi market count: ${newCount}`);
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
