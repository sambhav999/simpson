import { AggregatorService } from './src/modules/markets-aggregator/aggregator.service';
import { config } from './src/core/config/config';
import * as dotenv from 'dotenv';
dotenv.config();

async function test() {
    const service = new AggregatorService();
    // Use the private fetchSXBetMarkets via reflection/any cast
    const markets = await (service as any).fetchSXBetMarkets();
    console.log(JSON.stringify(markets.slice(0, 10), null, 2));
}

test();
