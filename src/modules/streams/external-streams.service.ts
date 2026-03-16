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
    // Polymarket uses Gamma API for WebSocket updates
    const endpoint = 'wss://gamma-api.polymarket.com/ws';
    this.polymarketWs = new WebSocket(endpoint);

    this.polymarketWs.on('open', () => {
      logger.info('Connected to Polymarket Gamma WebSocket');
      // Subscribe to all market updates (or specific ones)
      const subscribeMsg = {
        type: 'subscribe',
        topic: 'markets',
      };
      this.polymarketWs?.send(JSON.stringify(subscribeMsg));
    });

    this.polymarketWs.on('message', (data: string) => {
      try {
        const msg = JSON.parse(data);
        // Map Polymarket events to our internal events
        if (msg.event === 'market_updated') {
          const payload = {
            source: 'polymarket',
            marketId: msg.data.id,
            data: msg.data,
          };
          // Emit to specific market room AND general markets room
          this.socketService.emitToRoom(`market:${msg.data.id}`, SocketEvent.MARKET_UPDATE, payload);
          this.socketService.broadcast(SocketEvent.MARKET_UPDATE, payload);
        }
      } catch (err) {
        logger.error('Error parsing Polymarket message', err);
      }
    });

    this.polymarketWs.on('error', (err) => {
      logger.error('Polymarket WebSocket error', err);
    });

    this.polymarketWs.on('close', () => {
      logger.warn('Polymarket WebSocket closed. Reconnecting in 5s...');
      setTimeout(() => this.connectToPolymarket(), 5000);
    });
  }

  public stop(): void {
    this.pythWs?.close();
    this.polymarketWs?.close();
  }
}
