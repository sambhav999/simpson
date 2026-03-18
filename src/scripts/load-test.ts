import io from 'socket.io-client';

const URL = process.argv[2] || 'http://localhost:3000';
const MAX_CLIENTS = parseInt(process.argv[3]) || 1000;
const BATCH_SIZE = 50;
const BATCH_INTERVAL_MS = 100;

console.log(`🚀 Starting load test...`);
console.log(`🎯 Target: ${URL}`);
console.log(`👥 Target Clients: ${MAX_CLIENTS}`);

let clientCount = 0;
let lastReportedCount = 0;

function createClient() {
  const socket = io(URL, {
    transports: ['websocket'],
    forceNew: true,
    reconnection: false
  });

  socket.on('connect', () => {
    clientCount++;
  });

  socket.on('disconnect', () => {
    clientCount--;
  });

  socket.on('connect_error', (err: Error) => {
    // Silently handle errors to not spam console
  });
}

const interval = setInterval(() => {
  for (let i = 0; i < BATCH_SIZE; i++) {
    if (clientCount >= MAX_CLIENTS) {
      clearInterval(interval);
      break;
    }
    createClient();
  }
}, BATCH_INTERVAL_MS);

setInterval(() => {
  if (clientCount !== lastReportedCount) {
    console.log(`📈 Current Connections: ${clientCount}`);
    lastReportedCount = clientCount;
  }
  if (clientCount >= MAX_CLIENTS) {
    console.log('✅ Target reached. Monitoring for drops...');
  }
}, 2000);

process.on('SIGINT', () => {
  console.log('\n🛑 Test stopped by user.');
  process.exit();
});
