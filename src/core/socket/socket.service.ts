import { Server as SocketIOServer } from 'socket.io';
import { Server as HttpServer } from 'http';
import { logger } from '../logger/logger';

export enum SocketEvent {
  MARKET_UPDATE = 'market_update',
  PRICE_UPDATE = 'price_update',
  TRADE_RECORDED = 'trade_recorded',
}

export class SocketService {
  private static instance: SocketService;
  private io: SocketIOServer | null = null;

  private constructor() {}

  public static getInstance(): SocketService {
    if (!SocketService.instance) {
      SocketService.instance = new SocketService();
    }
    return SocketService.instance;
  }

  public init(server: HttpServer): void {
    if (this.io) {
      logger.warn('SocketService already initialized');
      return;
    }

    this.io = new SocketIOServer(server, {
      cors: {
        origin: '*', // In production, this should be restricted
        methods: ['GET', 'POST'],
      },
    });

    this.io.on('connection', (socket) => {
      logger.info(`Client connected: ${socket.id}`);
      
      socket.on('join', (room: string) => {
        socket.join(room);
        logger.debug(`Client ${socket.id} joined room: ${room}`);
      });

      socket.on('leave', (room: string) => {
        socket.leave(room);
        logger.debug(`Client ${socket.id} left room: ${room}`);
      });

      socket.on('disconnect', () => {
        logger.info(`Client disconnected: ${socket.id}`);
      });
    });

    logger.info('Socket.io initialized');
  }

  public broadcast(event: SocketEvent, data: any): void {
    if (!this.io) {
      logger.error('SocketService not initialized. Cannot broadcast.');
      return;
    }

    this.io.emit(event, data);
    logger.debug(`Broadcasted event ${event}: ${JSON.stringify(data).slice(0, 100)}...`);
  }

  public emitToRoom(room: string, event: SocketEvent, data: any): void {
    if (!this.io) {
      logger.error('SocketService not initialized. Cannot emit to room.');
      return;
    }

    this.io.to(room).emit(event, data);
    logger.debug(`Emitted event ${event} to room ${room}: ${JSON.stringify(data).slice(0, 100)}...`);
  }
}
