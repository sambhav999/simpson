import WebSocket from 'ws';

const endpoint = 'wss://ws-subscriptions-clob.polymarket.com/ws/market';
const ws = new WebSocket(endpoint);

console.log(`🔌 Connecting to ${endpoint}...`);

ws.on('open', () => {
    console.log('✅ Connected!');
    const subscribeMsg = {
        type: 'subscribe',
        channels: ['markets']
    };
    console.log('📨 Sending subscription:', JSON.stringify(subscribeMsg));
    ws.send(JSON.stringify(subscribeMsg));
});

ws.on('message', (data) => {
    console.log('📥 Received Data:', data.toString().slice(0, 500));
    // Optionally close after one message if you just want to verify
    // ws.close();
});

ws.on('error', (err) => {
    console.error('❌ Error:', err);
});

ws.on('close', () => {
    console.log('🔌 Connection closed.');
});

// Auto-terminate after 10 seconds
setTimeout(() => {
    console.log('⏱️ Test timeout reached.');
    ws.close();
    process.exit();
}, 10000);
