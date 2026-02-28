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