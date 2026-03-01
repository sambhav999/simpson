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