import 'dotenv/config';
import { MarketsService } from './src/modules/markets/markets.service';

async function test() {
    const service = new MarketsService();
    try {
        const res = await service.syncMarketsFromAggregator();
        console.log("Sync Result:", res);
    } catch (err) {
        console.error("Sync Error:", err);
    }
}
test().catch(console.error);
