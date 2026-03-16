
import axios from 'axios';

async function sampleApis() {
  const configs = [
    { name: 'Limitless', url: 'https://api.limitless.exchange/markets/active?limit=1' },
    { name: 'Polymarket', url: 'https://clob.polymarket.com/events?active=true&closed=false&limit=1' },
    { name: 'Manifold', url: 'https://api.manifold.markets/v0/markets?limit=1' },
    { name: 'Kalshi', url: 'https://api.elections.kalshi.com/trade-api/v2/markets?limit=1&status=open' }
  ];

  for (const config of configs) {
    try {
      console.log(`--- ${config.name} ---`);
      const res = await axios.get(config.url, { timeout: 10000 });
      const data = res.data?.data || res.data?.[0] || res.data?.markets?.[0] || res.data;
      console.log(JSON.stringify(data, null, 2).substring(0, 1000));
    } catch (err: any) {
      console.log(`${config.name} failed: ${err.message}`);
    }
  }
}

sampleApis();
