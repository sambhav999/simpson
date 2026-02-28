import { Connection, PublicKey, Context, KeyedAccountInfo, Commitment } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { SolanaService } from './solana.service';
import { PrismaService } from '../../core/config/prisma.service';
import { logger } from '../../core/logger/logger';
import { config } from '../../core/config/config';
export class SolanaListener {
  private readonly solana: SolanaService;
  private readonly prisma: PrismaService;
  private subscriptionIds: number[] = [];
  private wsConnection: Connection;
  private isRunning = false;
  private trackedMints: Set<string> = new Set();
  private isProcessing = false;
  private eventQueue: KeyedAccountInfo[] = [];
  private readonly MAX_QUEUE_SIZE = 100;

  constructor() {
    this.solana = SolanaService.getInstance();
    this.prisma = PrismaService.getInstance();
    this.wsConnection = new Connection(config.HELIUS_RPC_URL, {
      commitment: 'confirmed' as Commitment,
      wsEndpoint: config.HELIUS_RPC_URL.replace('https://', 'wss://'),
    });
  }
  async start(): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;
    logger.info('Starting Solana listener...');

    // Load tracked mints into memory
    await this.refreshTrackedMints();

    // Recovery / Restart Handling
    await this.recoverMissedEvents();

    await this.subscribeToTokenProgram();
    logger.info('Solana listener started');
  }

  private async refreshTrackedMints(): Promise<void> {
    const markets = await this.prisma.market.findMany({
      select: { yesTokenMint: true, noTokenMint: true },
      where: { status: 'active' },
    });
    this.trackedMints.clear();
    for (const market of markets) {
      if (this.solana.validatePublicKey(market.yesTokenMint)) {
        this.trackedMints.add(market.yesTokenMint);
      }
      if (this.solana.validatePublicKey(market.noTokenMint)) {
        this.trackedMints.add(market.noTokenMint);
      }
    }
    logger.info(`Tracking ${this.trackedMints.size} valid token mints`);
  }

  private async recoverMissedEvents(): Promise<void> {
    logger.info('Backfilling missed events since last restart...');
    const state = await this.prisma.indexerState.upsert({
      where: { id: 'singleton' },
      create: { id: 'singleton', lastSignature: null },
      update: {},
    });

    const markets = await this.prisma.market.findMany({
      where: { status: 'active' },
    });

    for (const market of markets) {
      // Skip markets with placeholder/invalid Solana public keys
      if (this.solana.validatePublicKey(market.yesTokenMint)) {
        await this.indexTransactionsForMint(market.yesTokenMint, state.lastSignature);
      }
      if (this.solana.validatePublicKey(market.noTokenMint)) {
        await this.indexTransactionsForMint(market.noTokenMint, state.lastSignature);
      }
    }
  }

  private async indexTransactionsForMint(mint: string, untilSignature: string | null): Promise<void> {
    try {
      const signatures = await this.solana.getTransactionHistory(mint, { limit: 100, after: untilSignature || undefined });
      if (signatures.length === 0) return;

      // Process chronologically (reverse the recent first order)
      for (const sigInfo of signatures.reverse()) {
        const transfers = await this.solana.parseTokenTransfers(sigInfo.signature);
        for (const transfer of transfers) {
          // If transfer involves our mint, record it and update positions
          if (transfer.tokenMint === mint) {
            await this.updatePositionFromTransfer(transfer);
          }
        }
        // Update state
        await this.prisma.indexerState.update({
          where: { id: 'singleton' },
          data: { lastSignature: sigInfo.signature },
        });
      }
    } catch (err) {
      logger.error(`Error backfilling mint ${mint}:`, err);
    }
  }

  private async updatePositionFromTransfer(transfer: any): Promise<void> {
    // Basic handler that would re-trigger handleTokenAccountChange logic
    // We already have the token account listener running, so this ensures we don't miss past trades
    // For MVP, just update the indexer state as proof of concept of restart handling
  }
  async stop(): Promise<void> {
    this.isRunning = false;
    for (const id of this.subscriptionIds) {
      try {
        await this.wsConnection.removeProgramAccountChangeListener(id);
      } catch (err) {
        logger.warn(`Failed to remove listener ${id}:`, err);
      }
    }
    this.subscriptionIds = [];
    this.eventQueue = [];
    logger.info('Solana listener stopped');
  }
  private async subscribeToTokenProgram(): Promise<void> {
    try {
      logger.info(`Setting up listeners for ${this.trackedMints.size} tracked mints`);
      const subId = this.wsConnection.onProgramAccountChange(
        TOKEN_PROGRAM_ID,
        async (keyedAccountInfo: KeyedAccountInfo, _context: Context) => {
          // Quick in-memory filter: parse mint from account data BEFORE any DB call
          const accountData = keyedAccountInfo.accountInfo.data;
          if (!accountData || accountData.length < 165) return;

          try {
            const mintBytes = accountData.slice(0, 32);
            const mint = new PublicKey(mintBytes).toBase58();

            // Only process if this mint belongs to one of our markets
            if (!this.trackedMints.has(mint)) return;

            // Queue the event instead of processing immediately
            if (this.eventQueue.length < this.MAX_QUEUE_SIZE) {
              this.eventQueue.push(keyedAccountInfo);
              this.processQueue();
            }
          } catch {
            // Invalid mint data, skip
          }
        },
        'confirmed',
        [
          { dataSize: 165 },
        ]
      );
      this.subscriptionIds.push(subId);
      logger.info(`Subscribed to SPL Token program with subscription ID ${subId}`);

      // Refresh tracked mints every 5 minutes
      setInterval(() => this.refreshTrackedMints(), 5 * 60 * 1000);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown';
      logger.error(`Failed to subscribe to token program: ${message}`);
    }
  }

  private async processQueue(): Promise<void> {
    if (this.isProcessing) return;
    this.isProcessing = true;
    try {
      while (this.eventQueue.length > 0) {
        const event = this.eventQueue.shift();
        if (event) {
          await this.handleTokenAccountChange(event);
        }
      }
    } finally {
      this.isProcessing = false;
    }
  }

  private async handleTokenAccountChange(keyedAccountInfo: KeyedAccountInfo): Promise<void> {
    try {
      const accountData = keyedAccountInfo.accountInfo.data;
      if (!accountData || accountData.length < 165) return;
      const mintBytes = accountData.slice(0, 32);
      const ownerBytes = accountData.slice(32, 64);
      const mint = new PublicKey(mintBytes).toBase58();
      const owner = new PublicKey(ownerBytes).toBase58();
      const amount = Number(accountData.readBigUInt64LE(64));

      // We already filtered by tracked mints, so just find the market
      const market = await this.prisma.market.findFirst({
        where: {
          OR: [{ yesTokenMint: mint }, { noTokenMint: mint }],
          status: 'active',
        },
      });
      if (!market) return;
      await this.prisma.user.upsert({
        where: { walletAddress: owner },
        create: { walletAddress: owner },
        update: {},
      });
      const mintInfo = await this.solana.getMintInfo(mint);
      const decimals = mintInfo?.decimals || 6;
      const uiAmount = amount / Math.pow(10, decimals);
      await this.prisma.position.upsert({
        where: {
          walletAddress_marketId_tokenMint: {
            walletAddress: owner,
            marketId: market.id,
            tokenMint: mint,
          },
        },
        create: {
          walletAddress: owner,
          marketId: market.id,
          tokenMint: mint,
          amount: uiAmount,
          averageEntryPrice: 0,
        },
        update: {
          amount: uiAmount,
        },
      });
      logger.debug(`Updated position for ${owner} in market ${market.id}: ${uiAmount} tokens`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown';
      logger.error(`Error handling token account change: ${message}`);
    }
  }
  async indexTransactionForWallet(walletAddress: string): Promise<void> {
    try {
      const markets = await this.prisma.market.findMany({
        select: { id: true, yesTokenMint: true, noTokenMint: true },
        where: { status: 'active' },
      });
      const marketMintMap = new Map<string, { marketId: string; side: string }>();
      for (const m of markets) {
        marketMintMap.set(m.yesTokenMint, { marketId: m.id, side: 'YES' });
        marketMintMap.set(m.noTokenMint, { marketId: m.id, side: 'NO' });
      }
      const signatures = await this.solana.getTransactionHistory(walletAddress, { limit: 100 });
      for (const sigInfo of signatures) {
        const exists = await this.prisma.trade.findUnique({
          where: { signature: sigInfo.signature },
        });
        if (exists) continue;
        const transfers = await this.solana.parseTokenTransfers(sigInfo.signature);
        for (const transfer of transfers) {
          const marketInfo = marketMintMap.get(transfer.tokenMint);
          if (!marketInfo) continue;
          if (transfer.toWallet !== walletAddress && transfer.fromWallet !== walletAddress) continue;
          const side = transfer.toWallet === walletAddress ? 'BUY' : 'SELL';
          await this.prisma.trade.upsert({
            where: { signature: sigInfo.signature },
            create: {
              walletAddress,
              marketId: marketInfo.marketId,
              tokenMint: transfer.tokenMint,
              side,
              price: 0,
              amount: transfer.amount,
              signature: sigInfo.signature,
              timestamp: transfer.timestamp,
            },
            update: {},
          });
          logger.debug(`Indexed trade ${sigInfo.signature} for ${walletAddress}`);
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown';
      logger.error(`Failed to index transactions for ${walletAddress}: ${message}`);
    }
  }
}