const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function run() {
  const count = await prisma.market.count({ where: { source: 'limitless' }});
  console.log("Limitless markets in DB:", count);
  process.exit(0);
}
run();
