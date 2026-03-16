
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkData() {
  const now = new Date();
  const timeframes = {
    daily: new Date(now.getTime() - 24 * 60 * 60 * 1000),
    weekly: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000),
    monthly: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000),
    all_time: new Date(0),
  };

  console.log('--- Data Count Check ---');
  for (const [name, date] of Object.entries(timeframes)) {
    const xpCount = await prisma.xPTransaction.count({
      where: { createdAt: { gte: date } }
    });
    const posCount = await prisma.position.count({
      where: { status: { in: ['WON', 'LOST'] }, updatedAt: { gte: date } }
    });
    console.log(`${name}: XPTransactions=${xpCount}, QualifiedPositions=${posCount}`);
  }
}

checkData().finally(() => prisma.$disconnect());
