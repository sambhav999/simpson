import axios from 'axios';
import https from 'https';

const agent = new https.Agent({
    rejectUnauthorized: false
});

const urls = [
    'https://api.hedgehog.markets/v1/market/symbols',
    'https://api.hedgehog.markets/api/v1/market/symbols',
    'https://api.hedgehog.markets/api/v1/markets',
    'https://api.hedgehog.markets/v1/markets',
];

async function test() {
    for (const url of urls) {
        try {
            console.log(`Testing ${url}...`);
            const res = await axios.get(url, { 
                timeout: 5000,
                httpsAgent: agent
            });
            console.log(`SUCCESS: ${url} returned ${res.status}`);
            console.log(JSON.stringify(res.data).substring(0, 500));
        } catch (err: any) {
            console.log(`FAILED: ${url} - ${err.message}`);
            if (err.response) {
                console.log(`Response: ${err.response.status} ${JSON.stringify(err.response.data)}`);
            }
        }
    }
}

test();
