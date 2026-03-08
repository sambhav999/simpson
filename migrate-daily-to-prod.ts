import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('🚀 --- Migrating Daily 5 Data to Production ---');

    // 1. Market Data
    const markets = [
        {
            "id": "cmm67mjsl0000cutzakz3qgti",
            "externalId": "MOCK-CRYPTO-1",
            "source": "polymarket",
            "title": "Will Bitcoin reach $100k by end of year?",
            "description": "Predicting if the BTC/USD pair will touch or exceed the $100,000 mark before Dec 31st.",
            "category": "Crypto",
            "yesTokenMint": "YESBTC100kxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
            "noTokenMint": "NOBTC100kxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
            "expiry": "2027-03-08T05:33:29.390Z",
            "status": "active",
            "image": "https://images.unsplash.com/photo-1518546305927-5a555bb7020d?w=800&auto=format&fit=crop&q=60"
        },
        {
            "id": "cmm67ph1g0002cutzy0k1gi8q",
            "externalId": "MOCK-BULL-BEAR-1",
            "source": "polymarket",
            "title": "Bullish vs Bearish: Tech Sector 2026",
            "description": "Will the Tech sector overall perform bullishly compared to current averages?",
            "category": "General",
            "yesTokenMint": "YESBULLTECHxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
            "noTokenMint": "NOBEARTECHxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
            "expiry": "2026-09-08T05:33:29.390Z",
            "status": "active",
            "image": "https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=800&auto=format&fit=crop&q=60"
        },
        {
            "id": "cmm67q6nq0003cutz8992munq",
            "externalId": "MOCK-FLIGHT-1",
            "source": "polymarket",
            "title": "Air Traffic Passenger Volume > 4 Billion?",
            "description": "Will global air traffic surpass 4 billion passengers this year?",
            "category": "General",
            "yesTokenMint": "YESAIRTRAFFICxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
            "noTokenMint": "NOAIRTRAFFICxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
            "expiry": "2026-06-08T05:33:29.390Z",
            "status": "active",
            "image": "https://images.unsplash.com/photo-1436491865332-7a61a109cc05?w=800&auto=format&fit=crop&q=60"
        },
        {
            "id": "cmm67qvyq0004cutzloy0dugd",
            "externalId": "MOCK-TECH-1",
            "source": "polymarket",
            "title": "Will OpenAI release GPT-5 before July?",
            "description": "Predict whether a major version upgrade to GPT-5 will be announced.",
            "category": "General",
            "yesTokenMint": "YESGPT5xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
            "noTokenMint": "NOGPT5xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
            "expiry": "2026-07-01T00:00:00.000Z",
            "status": "active",
            "image": "https://images.unsplash.com/photo-1677442136019-21780ecad995?w=800&auto=format&fit=crop&q=60"
        },
        {
            "id": "cmm68kimu000ocutz3juoxf8m",
            "externalId": "MOCK-SPORTS-1",
            "source": "polymarket",
            "title": "NBA Finals 2026: Eastern Conference Winner?",
            "description": "Will the Boston Celtics win the Eastern Conference?",
            "category": "Sports",
            "yesTokenMint": "YESCELTICSxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
            "noTokenMint": "NOCELTICSxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
            "expiry": "2026-06-01T00:00:00.000Z",
            "status": "active",
            "image": "https://images.unsplash.com/photo-1504450758481-7338eba7524a?w=800&auto=format&fit=crop&q=60"
        }
    ];

    console.log('📦 Syncing Markets...');
    for (const m of markets) {
        await prisma.market.upsert({
            where: { id: m.id },
            update: m,
            create: m
        });
    }

    // 2. Battle Data
    const battleData = {
        "id": "cmmhl595k0000xb4tcsg6hug0",
        "date": new Date("2026-03-07T00:00:00.000Z"),
        "status": "active",
        "markets": [
            {
                "id": "cmmhl595m0002xb4to1o3kkwv",
                "marketId": "cmm67mjsl0000cutzakz3qgti",
                "position": 1,
                "homerPrediction": "YES",
                "homerConfidence": 70,
                "homerCommentary": "Homer Baba sees great signal in Crypto today."
            },
            {
                "id": "cmmhl595m0003xb4tygex66zi",
                "marketId": "cmm67ph1g0002cutzy0k1gi8q",
                "position": 2,
                "homerPrediction": "NO",
                "homerConfidence": 75,
                "homerCommentary": "Homer Baba sees great signal in General today."
            },
            {
                "id": "cmmhl595m0004xb4thiaugl6z",
                "marketId": "cmm67q6nq0003cutz8992munq",
                "position": 3,
                "homerPrediction": "YES",
                "homerConfidence": 80,
                "homerCommentary": "Homer Baba sees great signal in General today."
            },
            {
                "id": "cmmhl595m0005xb4tm4il97aa",
                "marketId": "cmm67qvyq0004cutzloy0dugd",
                "position": 4,
                "homerPrediction": "NO",
                "homerConfidence": 85,
                "homerCommentary": "Homer Baba sees great signal in General today."
            },
            {
                "id": "cmmhl595m0006xb4tgbi8o0yw",
                "marketId": "cmm68kimu000ocutz3juoxf8m",
                "position": 5,
                "homerPrediction": "YES",
                "homerConfidence": 90,
                "homerCommentary": "Homer Baba sees great signal in Sports today."
            }
        ]
    };

    console.log('⚔️ Syncing Daily Battle...');
    await prisma.dailyBattle.upsert({
        where: { id: battleData.id },
        update: {
            status: battleData.status,
            date: battleData.date
        },
        create: {
            id: battleData.id,
            date: battleData.date,
            status: battleData.status
        }
    });

    for (const bm of battleData.markets) {
        await prisma.dailyBattleMarket.upsert({
            where: { id: bm.id },
            update: {
                position: bm.position,
                homerPrediction: bm.homerPrediction,
                homerConfidence: bm.homerConfidence,
                homerCommentary: bm.homerCommentary
            },
            create: {
                id: bm.id,
                dailyBattleId: battleData.id,
                marketId: bm.marketId,
                position: bm.position,
                homerPrediction: bm.homerPrediction,
                homerConfidence: bm.homerConfidence,
                homerCommentary: bm.homerCommentary
            }
        });
    }

    console.log('✨ Migration Complete!');
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
