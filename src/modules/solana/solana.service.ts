import {
  Commitment,
  ConfirmedSignatureInfo,
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  ParsedTransactionWithMeta,
  PublicKey,
  sendAndConfirmTransaction,
  SystemProgram,
  Transaction,
} from '@solana/web3.js';
import {
  getAssociatedTokenAddress,
  getMint,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token';
import { config } from '../../core/config/config';
import { logger } from '../../core/logger/logger';
import { AppError } from '../../core/config/error.handler';
export interface TokenBalance {
  mint: string;
  amount: number;
  decimals: number;
  uiAmount: number;
}
export interface ParsedTransfer {
  signature: string;
  fromWallet: string;
  toWallet: string;
  tokenMint: string;
  amount: number;
  timestamp: Date;
  slot: number;
}
export class SolanaService {
  private readonly connection: Connection;
  private static instance: SolanaService;
  private readonly COMMITMENT: Commitment = 'confirmed';
  private readonly MAX_RETRIES = 3;
  private readonly RETRY_DELAY_MS = 1000;
  private treasuryKeypair: Keypair | null = null;
  constructor() {
    this.connection = new Connection(config.HELIUS_RPC_URL, {
      commitment: this.COMMITMENT,
      confirmTransactionInitialTimeout: 60000,
    });
  }
  static getInstance(): SolanaService {
    if (!SolanaService.instance) {
      SolanaService.instance = new SolanaService();
    }
    return SolanaService.instance;
  }
  getConnection(): Connection {
    return this.connection;
  }
  async sendTreasuryPayout(toWalletAddress: string, amountSol: number): Promise<string> {
    if (amountSol <= 0) {
      throw new AppError('Treasury payout amount must be positive', 400);
    }

    const treasury = this.getTreasuryKeypair();
    const destination = this.parsePublicKey(toWalletAddress);
    const lamports = Math.round(amountSol * LAMPORTS_PER_SOL);
    if (lamports <= 0) {
      throw new AppError('Treasury payout amount is too small after lamport conversion', 400);
    }

    const { blockhash } = await this.connection.getLatestBlockhash(this.COMMITMENT);
    const transaction = new Transaction({
      recentBlockhash: blockhash,
      feePayer: treasury.publicKey,
    }).add(
      SystemProgram.transfer({
        fromPubkey: treasury.publicKey,
        toPubkey: destination,
        lamports,
      })
    );

    const signature = await sendAndConfirmTransaction(
      this.connection,
      transaction,
      [treasury],
      { commitment: this.COMMITMENT }
    );

    logger.info(`Treasury payout sent: ${amountSol} SOL to ${toWalletAddress} (${signature})`);
    return signature;
  }
  async getTokenBalances(walletAddress: string): Promise<TokenBalance[]> {
    const wallet = this.parsePublicKey(walletAddress);
    const balances: TokenBalance[] = [];
    try {
      const tokenAccounts = await this.withRetry(() =>
        this.connection.getParsedTokenAccountsByOwner(wallet, { programId: TOKEN_PROGRAM_ID })
      );
      for (const { account } of tokenAccounts.value) {
        const parsed = account.data.parsed?.info;
        if (!parsed) continue;
        const mint = parsed.mint as string;
        const tokenAmount = parsed.tokenAmount;
        balances.push({
          mint,
          amount: tokenAmount.amount as number,
          decimals: tokenAmount.decimals as number,
          uiAmount: tokenAmount.uiAmount as number || 0,
        });
      }
      return balances;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Failed to get token balances for ${walletAddress}: ${message}`);
      throw new AppError(`Token balance fetch failed: ${message}`, 502);
    }
  }
  async getSpecificTokenBalance(walletAddress: string, tokenMint: string): Promise<TokenBalance | null> {
    try {
      const wallet = this.parsePublicKey(walletAddress);
      const mint = this.parsePublicKey(tokenMint);
      const ata = await getAssociatedTokenAddress(mint, wallet);
      const accountInfo = await this.withRetry(() =>
        this.connection.getParsedAccountInfo(ata)
      );
      if (!accountInfo.value) return null;
      const parsed = (accountInfo.value.data as { parsed: { info: { tokenAmount: { amount: string; decimals: number; uiAmount: number | null } } } }).parsed?.info;
      if (!parsed) return null;
      return {
        mint: tokenMint,
        amount: Number(parsed.tokenAmount.amount),
        decimals: parsed.tokenAmount.decimals,
        uiAmount: parsed.tokenAmount.uiAmount || 0,
      };
    } catch (error) {
      logger.debug(`No token account for ${tokenMint} at ${walletAddress}`);
      return null;
    }
  }
  async getTransactionHistory(
    walletAddress: string,
    options: { limit?: number; before?: string; after?: string } = {}
  ): Promise<ConfirmedSignatureInfo[]> {
    const wallet = this.parsePublicKey(walletAddress);
    const { limit = 50, before, after } = options;
    try {
      const signatures = await this.withRetry(() =>
        this.connection.getSignaturesForAddress(wallet, {
          limit: Math.min(limit, 1000),
          before,
          until: after,
        })
      );
      return signatures;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Failed to get transaction history for ${walletAddress}: ${message}`);
      throw new AppError(`Transaction history fetch failed: ${message}`, 502);
    }
  }
  async getParsedTransaction(signature: string): Promise<ParsedTransactionWithMeta | null> {
    try {
      const tx = await this.withRetry(() =>
        this.connection.getParsedTransaction(signature, {
          commitment: this.COMMITMENT as any,
          maxSupportedTransactionVersion: 0,
        })
      );
      return tx;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Failed to parse transaction ${signature}: ${message}`);
      return null;
    }
  }
  async parseTokenTransfers(signature: string): Promise<ParsedTransfer[]> {
    const tx = await this.getParsedTransaction(signature);
    if (!tx || !tx.meta || tx.meta.err) return [];
    const transfers: ParsedTransfer[] = [];
    const blockTime = tx.blockTime ? new Date(tx.blockTime * 1000) : new Date();
    const instructions = tx.transaction.message.instructions;
    for (const instruction of instructions) {
      if ('parsed' in instruction && instruction.program === 'spl-token') {
        const parsed = instruction.parsed as {
          type: string;
          info: {
            source?: string;
            destination?: string;
            authority?: string;
            mint?: string;
            tokenAmount?: { amount: string; decimals: number };
            amount?: string;
          };
        };
        if (parsed.type === 'transfer' || parsed.type === 'transferChecked') {
          const info = parsed.info;
          const amount = info.tokenAmount
            ? Number(info.tokenAmount.amount)
            : Number(info.amount || 0);
          if (info.source && info.destination && info.mint) {
            transfers.push({
              signature,
              fromWallet: info.source,
              toWallet: info.destination,
              tokenMint: info.mint,
              amount,
              timestamp: blockTime,
              slot: tx.slot,
            });
          }
        }
      }
    }
    return transfers;
  }
  async getMintInfo(tokenMint: string): Promise<{ decimals: number; supply: bigint } | null> {
    try {
      const mint = this.parsePublicKey(tokenMint);
      const mintInfo = await this.withRetry(() => getMint(this.connection, mint));
      return { decimals: mintInfo.decimals, supply: mintInfo.supply };
    } catch {
      return null;
    }
  }
  validatePublicKey(address: string): boolean {
    try {
      new PublicKey(address);
      return true;
    } catch {
      return false;
    }
  }
  private parsePublicKey(address: string): PublicKey {
    try {
      return new PublicKey(address);
    } catch {
      throw new AppError(`Invalid public key: ${address}`, 400);
    }
  }
  private getTreasuryKeypair(): Keypair {
    if (this.treasuryKeypair) {
      return this.treasuryKeypair;
    }
    if (!config.TREASURY_PRIVATE_KEY) {
      throw new AppError('TREASURY_PRIVATE_KEY is not configured', 500);
    }

    let secret: number[];
    try {
      const parsed = JSON.parse(config.TREASURY_PRIVATE_KEY);
      if (!Array.isArray(parsed) || parsed.some((value) => !Number.isInteger(value) || value < 0 || value > 255)) {
        throw new Error('invalid secret key format');
      }
      secret = parsed;
    } catch {
      throw new AppError('TREASURY_PRIVATE_KEY must be a JSON array of bytes', 500);
    }

    const keypair = Keypair.fromSecretKey(Uint8Array.from(secret));
    if (config.TREASURY_WALLET && keypair.publicKey.toBase58() !== config.TREASURY_WALLET) {
      throw new AppError('TREASURY_PRIVATE_KEY does not match TREASURY_WALLET', 500);
    }

    this.treasuryKeypair = keypair;
    return keypair;
  }
  private async withRetry<T>(fn: () => Promise<T>, retries = this.MAX_RETRIES): Promise<T> {
    let lastError: Error = new Error('Unknown error');
    for (let i = 0; i < retries; i++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        if (i < retries - 1) {
          const delay = this.RETRY_DELAY_MS * Math.pow(2, i);
          logger.warn(`Solana RPC retry ${i + 1}/${retries} after ${delay}ms: ${lastError.message}`);
          await new Promise((r) => setTimeout(r, delay));
        }
      }
    }
    throw lastError;
  }
}
