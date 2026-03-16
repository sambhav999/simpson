
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  console.log('--- Debugging Duplicate Keys ---');
  
  // Check AIPredictions
  const predictions = await prisma.aIPrediction.findMany({
    select: { id: true, marketId: true }
  });
  
  const predIds = predictions.map(p => p.id);
  const duplicatePredIds = predIds.filter((item, index) => predIds.indexOf(item) !== index);
  if (duplicatePredIds.length > 0) {
    console.log('Duplicate AIPrediction IDs found:', duplicatePredIds);
  } else {
    console.log('No duplicate AIPrediction IDs in DB.');
  }

  // Check DailyBattleMarkets for the most recent battle
  const lastBattle = await prisma.dailyBattle.findFirst({
    orderBy: { date: 'desc' },
    include: { markets: true }
  });

  if (lastBattle) {
    console.log(`Checking Battle from ${lastBattle.date}: ${lastBattle.id}`);
    const marketIds = lastBattle.markets.map(m => m.id);
    const duplicateMarketIds = marketIds.filter((item, index) => marketIds.indexOf(item) !== index);
    if (duplicateMarketIds.length > 0) {
      console.log('Duplicate DailyBattleMarket IDs found in last battle:', duplicateMarketIds);
    } else {
      console.log('No duplicate DailyBattleMarket IDs in last battle.');
    }

    const marketRefIds = lastBattle.markets.map(m => m.marketId);
    const duplicateMarketRefIds = marketRefIds.filter((item, index) => marketRefIds.indexOf(item) !== index);
    if (duplicateMarketRefIds.length > 0) {
      console.log('Duplicate market_id references found in last battle:', duplicateMarketRefIds);
      // Let's see which ones are duplicated
      const uniqueDupes = [...new Set(duplicateMarketRefIds)];
      console.log('Dupes:', uniqueDupes);
    }
  }

  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
