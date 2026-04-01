const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

function usage() {
  console.log('Usage: node src/scripts/fix-duplicate-market-external-id.js <externalId> [keepMarketId]');
}

async function main() {
  const [, , externalId, keepMarketIdArg] = process.argv;

  if (!externalId) {
    usage();
    process.exit(1);
  }

  const markets = await prisma.market.findMany({
    where: { externalId },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      title: true,
      createdAt: true,
      updatedAt: true,
      externalId: true,
    },
  });

  if (markets.length <= 1) {
    console.log(`No duplicate markets found for externalId=${externalId}`);
    return;
  }

  const keepMarket = keepMarketIdArg
    ? markets.find((market) => market.id === keepMarketIdArg)
    : markets[0];

  if (!keepMarket) {
    throw new Error(`keepMarketId ${keepMarketIdArg} was not found among duplicate markets`);
  }

  const removeMarkets = markets.filter((market) => market.id !== keepMarket.id);
  const removeIds = removeMarkets.map((market) => market.id);

  console.log('Duplicate markets found:');
  console.table(markets);
  console.log(`Keeping market ${keepMarket.id}`);
  console.log(`Removing markets: ${removeIds.join(', ')}`);

  // Safety check: remapping positions can violate the unique
  // [walletAddress, marketId, tokenMint] constraint if both duplicate markets
  // already contain positions for the same wallet/token pair.
  const duplicatePositions = await prisma.position.groupBy({
    by: ['walletAddress', 'tokenMint'],
    where: {
      marketId: { in: [keepMarket.id, ...removeIds] },
    },
    _count: { _all: true },
  });

  const conflictingPositions = duplicatePositions.filter((entry) => (entry._count._all || 0) > 1);
  if (conflictingPositions.length > 0) {
    console.error('Aborting because merging these markets would create duplicate positions:');
    console.table(conflictingPositions);
    process.exit(1);
  }

  const relationCounts = await Promise.all([
    prisma.position.count({ where: { marketId: { in: removeIds } } }),
    prisma.trade.count({ where: { marketId: { in: removeIds } } }),
    prisma.comment.count({ where: { marketId: { in: removeIds } } }),
    prisma.creatorMarket.count({ where: { marketId: { in: removeIds } } }),
    prisma.attribution.count({ where: { marketId: { in: removeIds } } }),
    prisma.memeCard.count({ where: { marketId: { in: removeIds } } }),
    prisma.dailyBattleMarket.count({ where: { marketId: { in: removeIds } } }),
    prisma.protocolRevenue.count({ where: { marketId: { in: removeIds } } }),
    prisma.aIPrediction.count({ where: { marketId: { in: removeIds } } }),
  ]);

  console.log('Reference counts on duplicate markets:');
  console.table([
    { collection: 'positions', count: relationCounts[0] },
    { collection: 'trades', count: relationCounts[1] },
    { collection: 'comments', count: relationCounts[2] },
    { collection: 'creator_markets', count: relationCounts[3] },
    { collection: 'attributions', count: relationCounts[4] },
    { collection: 'meme_cards', count: relationCounts[5] },
    { collection: 'daily_battle_markets', count: relationCounts[6] },
    { collection: 'protocol_revenue', count: relationCounts[7] },
    { collection: 'ai_predictions', count: relationCounts[8] },
  ]);

  await prisma.$transaction([
    prisma.position.updateMany({
      where: { marketId: { in: removeIds } },
      data: { marketId: keepMarket.id },
    }),
    prisma.trade.updateMany({
      where: { marketId: { in: removeIds } },
      data: { marketId: keepMarket.id },
    }),
    prisma.comment.updateMany({
      where: { marketId: { in: removeIds } },
      data: { marketId: keepMarket.id },
    }),
    prisma.creatorMarket.updateMany({
      where: { marketId: { in: removeIds } },
      data: { marketId: keepMarket.id },
    }),
    prisma.attribution.updateMany({
      where: { marketId: { in: removeIds } },
      data: { marketId: keepMarket.id },
    }),
    prisma.memeCard.updateMany({
      where: { marketId: { in: removeIds } },
      data: { marketId: keepMarket.id },
    }),
    prisma.dailyBattleMarket.updateMany({
      where: { marketId: { in: removeIds } },
      data: { marketId: keepMarket.id },
    }),
    prisma.protocolRevenue.updateMany({
      where: { marketId: { in: removeIds } },
      data: { marketId: keepMarket.id },
    }),
    prisma.aIPrediction.updateMany({
      where: { marketId: { in: removeIds } },
      data: { marketId: keepMarket.id },
    }),
    prisma.market.deleteMany({
      where: { id: { in: removeIds } },
    }),
  ]);

  const remaining = await prisma.market.findMany({
    where: { externalId },
    orderBy: { createdAt: 'asc' },
    select: { id: true, title: true, createdAt: true, externalId: true },
  });

  console.log('Cleanup complete. Remaining markets:');
  console.table(remaining);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
