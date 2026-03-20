/**
 * Seed AI Predictions for existing markets in MongoDB
 * Run: npx ts-node src/scripts/seed-ai-predictions.ts
 */
import 'dotenv/config';
import { PrismaService } from '../core/config/prisma.service';
import { logger } from '../core/logger/logger';

const PREDICTIONS = ['YES', 'NO'];
const COMMENTARIES = [
  'Based on current market sentiment and historical data, this outcome appears likely.',
  'Technical analysis suggests this market is trending in this direction.',
  'Fundamental factors support this prediction with moderate confidence.',
  'Market indicators show strong momentum supporting this direction.',
  'Volume patterns and liquidity trends indicate this outcome.',
];
const BULLISH = [
  'Strong buying pressure observed. Volume is above 30-day average.',
  'Key support levels holding. Bulls remain in control.',
  'Positive sentiment from major stakeholders. Momentum is building.',
];
const BEARISH = [
  'Resistance levels remain strong. Bears are applying pressure.',
  'Lower liquidity suggests market uncertainty.',
  'Conflicting signals — caution is advised.',
];
const SUMMARY = [
  'Homer Baba sees YES signals. Trust the oracle.',
  'Homer Baba leans NO. The numbers don\'t lie.',
  'This one is close. Homer Baba gives it a slight edge.',
];

function random<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

async function seed() {
  const prisma = PrismaService.getInstance();
  await prisma.$connect();

  const existingCount = await prisma.aIPrediction.count();
  if (existingCount > 0) {
    console.log(`Already have ${existingCount} AI predictions — skipping seed.`);
    await prisma.$disconnect();
    return;
  }

  // Grab up to 50 active markets to seed predictions for
  const markets = await prisma.market.findMany({
    where: { status: 'active' },
    take: 50,
    orderBy: { volume: 'desc' },
  });

  console.log(`Seeding AI predictions for ${markets.length} markets...`);

  let created = 0;
  for (const market of markets) {
    const prediction = random(PREDICTIONS);
    const confidence = Math.floor(Math.random() * 35) + 55; // 55-90
    const featured = created < 5; // first 5 are featured
    await prisma.aIPrediction.create({
      data: {
        marketId: market.id,
        prediction,
        confidence,
        summaryCommentary: random(SUMMARY),
        bullishCommentary: random(BULLISH),
        bearishCommentary: random(BEARISH),
        featured,
        featuredRank: featured ? created + 1 : null,
        resolved: false,
        result: 'PENDING',
      },
    });
    created++;
  }

  console.log(`✅ Seeded ${created} AI predictions (${markets.length} markets).`);
  await prisma.$disconnect();
}

seed().catch((e) => {
  logger.error('Seed failed', e);
  process.exit(1);
});
