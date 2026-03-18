import WebSocket from 'ws';
import { logger } from '../../core/logger/logger';
import { SocketService, SocketEvent } from '../../core/socket/socket.service';

export class ExternalStreamsService {
  private pythWs: WebSocket | null = null;
  private polymarketWs: WebSocket | null = null;
  private socketService: SocketService;

  constructor() {
    this.socketService = SocketService.getInstance();
  }

  public start(): void {
    this.connectToPyth();
    this.connectToPolymarket();
  }

  private connectToPyth(): void {
    const endpoint = 'wss://hermes.pyth.network/ws';
    this.pythWs = new WebSocket(endpoint);

    this.pythWs.on('open', () => {
      logger.info('Connected to Pyth Hermes WebSocket');
      // Subscribe to price feeds
      const subscribeMsg = {
        type: 'subscribe',
        ids: [
          '0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43', // BTC/USD
          '0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d', // SOL/USD
        ],
      };
      this.pythWs?.send(JSON.stringify(subscribeMsg));
    });

    this.pythWs.on('message', (data: string) => {
      try {
        const msg = JSON.parse(data);
        if (msg.type === 'price_update' && msg.price_feed) {
          const feedId = msg.price_feed.id;
          const price = Number(msg.price_feed.price.price) * Math.pow(10, msg.price_feed.price.expo);
          
          this.socketService.emitToRoom(`feed:${feedId}`, SocketEvent.PRICE_UPDATE, {
            feedId,
            price,
            timestamp: new Date().toISOString(),
          });
        }
      } catch (err) {
        logger.error('Error parsing Pyth message', err);
      }
    });

    this.pythWs.on('error', (err) => {
      logger.error('Pyth WebSocket error', err);
    });

    this.pythWs.on('close', () => {
      logger.warn('Pyth WebSocket closed. Reconnecting in 5s...');
      setTimeout(() => this.connectToPyth(), 5000);
    });
  }

  private connectToPolymarket(): void {
    // Polymarket uses CLOB WebSocket for real-time updates
    const endpoint = 'wss://ws-subscriptions-clob.polymarket.com/ws/market';
    this.polymarketWs = new WebSocket(endpoint);

    let pingInterval: NodeJS.Timeout;

    this.polymarketWs.on('open', () => {
      logger.info('Connected to Polymarket CLOB WebSocket');
      
      // Subscribe to simplified market updates
      const subscribeMsg = {
        type: 'subscribe',
        channels: ['markets'],
      };
      this.polymarketWs?.send(JSON.stringify(subscribeMsg));

      // Start heartbeat to prevent timeout (every 20s)
      pingInterval = setInterval(() => {
        if (this.polymarketWs?.readyState === WebSocket.OPEN) {
          this.polymarketWs.send('ping');
        }
      }, 20000);
    });

    this.polymarketWs.on('message', (data: string) => {
      if (data.toString() === 'pong') return;

      try {
        const msg = JSON.parse(data.toString());
        
        // Handle CLOB events (e.g., price changes, market updates)
        // The 'markets' channel sends events with specific types
        if (msg.event_type === 'price_change' || msg.event_type === 'market_updated') {
          const payload = {
            source: 'polymarket',
            marketId: msg.market_id || msg.data?.id,
            data: msg,
          };
          
          this.socketService.emitToRoom(`market:${payload.marketId}`, SocketEvent.MARKET_UPDATE, payload);
          this.socketService.emitToRoom('markets:all', SocketEvent.MARKET_UPDATE, payload);
        }
      } catch (err) {
        // Silently skip non-JSON or heartbeat messages
      }
    });

    this.polymarketWs.on('error', (err) => {
      logger.error('Polymarket WebSocket error', err);
    });

    this.polymarketWs.on('close', () => {
      clearInterval(pingInterval);
      logger.warn('Polymarket WebSocket closed. Reconnecting in 5s...');
      setTimeout(() => this.connectToPolymarket(), 5000);
    });
  }

  public stop(): void {
    this.pythWs?.close();
    this.polymarketWs?.close();
  }
}
