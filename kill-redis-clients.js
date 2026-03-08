const Redis = require('ioredis');

async function checkAndFlushClients() {
    const url = 'redis://default:Hrcb4CF0WDvxYadD3W75idUVpDaoKwT2@redis-11413.crce198.eu-central-1-3.ec2.cloud.redislabs.com:11413';
    const redis = new Redis(url);

    console.log('Connecting to Redis...');

    redis.on('error', (err) => {
        console.error('Redis error:', err);
        process.exit(1);
    });

    redis.on('ready', async () => {
        console.log('Connected! Fetching client list...');
        try {
            const clients = await redis.client('LIST');
            const clientLines = clients.split('\n').filter(line => line.trim() !== '');
            console.log(`Total connected clients: ${clientLines.length}`);

            // We don't want to kill our own connection
            const myId = await redis.client('ID');

            let killed = 0;
            for (const line of clientLines) {
                const idMatch = line.match(/id=(\d+)/);
                if (idMatch) {
                    const id = parseInt(idMatch[1], 10);
                    if (id !== myId) {
                        await redis.client('KILL', 'ID', id);
                        killed++;
                    }
                }
            }
            console.log(`Successfully killed ${killed} old idle connections.`);
            console.log('The new deployment should now be able to start.');
        } catch (e) {
            console.error('Error listing/killing clients:', e.message);
        } finally {
            process.exit(0);
        }
    });
}

checkAndFlushClients();
