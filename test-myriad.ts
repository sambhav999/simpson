import { AggregatorService } from './src/modules/markets-aggregator/aggregator.service';

async function test() {
    const service = new AggregatorService();
    console.log("Fetching markets...");
    const markets = await service.getMarkets();
    const myriadMarkets = markets.filter(m => m.source === 'myriad');
    console.log(`Fetched ${myriadMarkets.length} myriad markets.`);
    if (myriadMarkets.length > 0) {
        console.log(myriadMarkets[0]);
    }
}

test().catch(console.error);
