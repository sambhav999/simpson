
import axios from 'axios';

async function sampleApis() {
  const configs = [
    { name: 'Polymarket', url: 'https://gamma-api.polymarket.com/events?active=true&closed=false&limit=1' },
    { name: 'Manifold', url: 'https://api.manifold.markets/v0/markets?limit=1' },
  ];

  for (const config of configs) {
    try {
      console.log(`--- ${config.name} ---`);
      const res = await axios.get(config.url, { timeout: 15000 });
      const data = res.data?.[0] || res.data;
      console.log(JSON.stringify(data, null, 2).substring(0, 1500));
    } catch (err: any) {
      console.log(`${config.name} failed: ${err.message}`);
    }
  }
}

sampleApis();
