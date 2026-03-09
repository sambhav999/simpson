import * as dotenv from 'dotenv';
dotenv.config();
import { AggregatorService } from './src/modules/markets-aggregator/aggregator.service';

async function testKalshi() {
    console.log('Testing Kalshi Integration...');
    const service = new AggregatorService();
    const markets = await service.getMarkets();

    const kalshiMarkets = markets.filter(m => m.source === 'kalshi');
    console.log(`Successfully fetched ${kalshiMarkets.length} markets from Kalshi.`);

    if (kalshiMarkets.length > 0) {
        console.log('\nSample Kalshi Market:');
        console.log(JSON.stringify(kalshiMarkets[0], null, 2));
    } else {
        console.log('No Kalshi markets found. Check API or fetching logic.');
    }
}

testKalshi().catch(console.error);
