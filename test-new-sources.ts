import 'dotenv/config';
import { AggregatorService } from './src/modules/markets-aggregator/aggregator.service';
import { logger } from './src/core/logger/logger';

async function verify() {
    const service = new AggregatorService();
    console.log("Fetching markets from all sources...");
    const markets = await service.getMarkets();

    const sources = ['limitless', 'polymarket', 'myriad', 'manifold', 'hedgehog'];

    sources.forEach(source => {
        const sourceMarkets = markets.filter(m => m.source === source);
        console.log(`- ${source.toUpperCase()}: Fetched ${sourceMarkets.length} markets.`);
        if (sourceMarkets.length > 0) {
            console.log(`  Example: "${sourceMarkets[0].title}" (${sourceMarkets[0].id})`);
        }
    });

    const categories = Array.from(new Set(markets.map(m => m.category)));
    console.log(`\nTotal Consolidated Markets: ${markets.length}`);
    console.log(`Unique Categories: ${categories.length}`);
}

verify().catch(err => {
    console.error("Verification failed:", err);
    process.exit(1);
});
