import { Router, Request, Response, NextFunction } from 'express';
import { TradesService } from './trades.service';
import { AppError } from '../../core/config/error.handler';
export const tradesRouter = Router();
const tradesService = new TradesService();
tradesRouter.post('/quote', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { wallet, marketId, side, amount } = req.body as {
      wallet?: string;
      marketId?: string;
      side?: string;
      amount?: number;
    };
    if (!wallet) return next(new AppError('wallet is required', 400));
    if (!marketId) return next(new AppError('marketId is required', 400));
    if (!side || !['YES', 'NO'].includes(side)) return next(new AppError('side must be YES or NO', 400));
    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
      return next(new AppError('amount must be a positive number', 400));
    }
    const quote = await tradesService.getTradeQuote({
      wallet,
      marketId,
      side: side as 'YES' | 'NO',
      amount: Number(amount),
    });
    res.json({ data: quote });
  } catch (error) {
    next(error);
  }
});

/**
 * Record a manual/simulated trade
 */
tradesRouter.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { walletAddress, marketId, tokenMint, side, amount, price } = req.body;

    if (!walletAddress || !marketId || !side || !amount) {
      return next(new AppError('Missing required trade fields', 400));
    }

    // Lookup market to get correct token mints if not provided
    const market = await (tradesService as any).prisma.market.findUnique({ where: { id: marketId } });
    const finalTokenMint = tokenMint || (side === 'YES' ? market?.yesTokenMint : market?.noTokenMint) || 'placeholder_mint';

    // Generate a unique simulation signature if not provided
    const signature = `sim_${Math.random().toString(36).substring(2)}${Date.now().toString(36)}`;

    const trade = await tradesService.recordTrade({
      walletAddress,
      marketId,
      tokenMint: finalTokenMint,
      side: 'BUY',
      betSide: side, // Explicitly save the YES/NO choice
      price: price || 0.5,
      amount: Number(amount),
      signature,
      timestamp: new Date()
    });

    res.json({ success: true, data: trade });
  } catch (error) {
    next(error);
  }
});

/**
 * Solana Pay Transaction Request - GET
 * Returns the metadata for the transaction request so the wallet can display the app details
 */
tradesRouter.get('/pay', (req: Request, res: Response) => {
  const metadata = tradesService.getSolanaPayMetadata();
  res.json(metadata);
});

/**
 * Solana Pay Transaction Request - POST
 * The mobile wallet sends the scanner's public key (account). 
 * The backend generates the specific transaction for them to sign.
 */
tradesRouter.post('/pay', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { account } = req.body as { account: string };
    const { reference, marketId, side, amount } = req.query as {
      reference?: string;
      marketId?: string;
      side?: string;
      amount?: string;
    };

    if (!account) return next(new AppError('Account is required', 400));
    if (!reference) return next(new AppError('Reference pubkey is required', 400));
    if (!marketId || !side || !amount) {
      return next(new AppError('Missing trade parameters (marketId, side, amount)', 400));
    }

    const transactionData = await tradesService.getSolanaPayTransaction({
      account,
      reference,
      marketId,
      side: side as 'YES' | 'NO',
      amount: Number(amount)
    });

    res.json(transactionData);
  } catch (error) {
    next(error);
  }
});

/**
 * Solana Pay Transaction Verification
 * The frontend polling endpoint to see if the transaction containing the unique reference key was completed
 */
tradesRouter.get('/verify', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { reference } = req.query as { reference?: string };
    if (!reference) return next(new AppError('Reference pubkey is required', 400));

    // Wait and check if the signature has been confirmed
    const solanaService = (tradesService as any).solana; // Access private property for simplicity in this example
    const connection = solanaService.getConnection();

    // Look up any signatures associated with this reference public key
    const signatures = await connection.getSignaturesForAddress(
      new (require('@solana/web3.js')).PublicKey(reference),
      { limit: 1 }
    );

    if (signatures.length === 0) {
      return res.json({ status: 'pending' });
    }

    res.json({ status: 'confirmed', signature: signatures[0].signature });
  } catch (error) {
    next(error);
  }
});
/**
 * Record a failed trade (e.g., insufficient funds)
 */
tradesRouter.post('/record-failure', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { walletAddress, marketId, side, amount, price, reason } = req.body;

    if (!walletAddress || !marketId || !side) {
      return next(new AppError('Missing required failure recording fields', 400));
    }

    const market = await (tradesService as any).prisma.market.findUnique({ where: { id: marketId } });
    const tokenMint = side === 'YES' ? market?.yesTokenMint : market?.noTokenMint;

    const trade = await tradesService.recordTrade({
      walletAddress,
      marketId,
      tokenMint: tokenMint || 'placeholder_mint',
      side: 'BUY',
      betSide: side,
      price: price || 0,
      amount: amount || 0,
      signature: `fail_${Date.now()}_${Math.random().toString(36).substring(7)}`,
      status: `FAILED_${(reason || 'UNKNOWN').toUpperCase().replace(/\s+/g, '_')}`,
      timestamp: new Date()
    });

    res.json({ success: true, data: trade });
  } catch (error) {
    next(error);
  }
});
