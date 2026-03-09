import 'dotenv/config';
import { AggregatorService } from './src/modules/markets-aggregator/aggregator.service';

async function test() {
  const service = new AggregatorService();
  const markets = await service.getMarkets();
  const limitless = markets.filter(m => m.source === 'limitless');
  console.log("Total aggregated markets:", markets.length);
  console.log("Limitless count:", limitless.length);
  if (limitless.length > 0) {
    console.log("Sample Limitless market:", limitless[0]);
  } else {
    console.log("No limitless markets found! The parser must be failing.");
  }
}
test().catch(console.error);
