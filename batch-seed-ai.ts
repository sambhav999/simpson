import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('🔮 --- Expanding AI Oracle Insights (15 Predictions) ---');

    // 1. Get a healthy batch of active markets
    const markets = await prisma.market.findMany({
        where: { status: 'active', resolved: false },
        take: 30,
        orderBy: { volume: 'desc' }
    });

    if (markets.length < 15) {
        console.warn(`⚠️ Only found ${markets.length} active markets. Seeding as many as possible.`);
    }

    const targetCount = Math.min(15, markets.length);
    const selectedMarkets = markets.slice(0, targetCount);

    const commentaryTemplates: Record<string, string[]> = {
        'Politics': [
            "Political momentum suggests a major shift. The oracle predicts {side} based on current polling drift.",
            "Structural indicators in Washington point towards {side}. Homer Baba sees the hidden signal in the chaos.",
            "Historical precedents for similar administrative moves suggest {side} is the high-probability outcome.",
            "Sentiment analysis of recent legislative discourse highly favors a {side} resolution here."
        ],
        'Crypto': [
            "On-chain signals and liquidity flow are converging on a {side} outcome. The Baba never misses the trend.",
            "Macro-economic correlation with BTC suggests {side} for this specific token event.",
            "Technical resilience in the underlying protocol points strongly to {side}. Follow the oracle.",
            "Market makers are positioning for {side}. Homer Baba sees the footprint of the whales."
        ],
        'General': [
            "Social media velocity and news cycle gravity are pulling this market toward {side}.",
            "Verifiable data points from international observers confirm that {side} is the path of least resistance.",
            "The stars and the data align for {side}. A clear signal emerges from the noise.",
            "Algorithmic synthesis of 48 different data sources results in a {side} conviction of {conf}%."
        ]
    };

    for (let i = 0; i < selectedMarkets.length; i++) {
        const m = selectedMarkets[i];
        const category = (m.category === 'Politics' || m.category === 'Crypto') ? m.category : 'General';
        const side = i % 3 === 0 ? 'NO' : 'YES'; // Mix it up
        const conf = 72 + Math.floor(Math.random() * 23); // 72-95%

        const templates = commentaryTemplates[category];
        let commentary = templates[i % templates.length]
            .replace('{side}', side)
            .replace('{conf}', conf.toString());

        await prisma.aIPrediction.upsert({
            where: { id: `ai-batch-${m.id}` },
            update: {
                prediction: side,
                confidence: conf,
                commentary: commentary,
                featured: true,
                featuredRank: i + 1
            },
            create: {
                id: `ai-batch-${m.id}`,
                marketId: m.id,
                prediction: side,
                confidence: conf,
                commentary: commentary,
                featured: true,
                featuredRank: i + 1
            }
        });

        console.log(`✅ [${i + 1}/${targetCount}] Predicted ${side} for: "${m.title.substring(0, 40)}..."`);
    }

    console.log(`\n✨ Successfully seeded ${selectedMarkets.length} Homer Baba insights.`);
    console.log('--- Oracle Expansion Complete ---');
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
