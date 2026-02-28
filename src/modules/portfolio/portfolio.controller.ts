import { Router, Request, Response, NextFunction } from 'express';
import { PortfolioService } from './portfolio.service';
import { AppError } from '../../core/config/error.handler';
export const portfolioRouter = Router();
const portfolioService = new PortfolioService();
portfolioRouter.get('/:wallet', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { wallet } = req.params;
    if (!wallet) return next(new AppError('Wallet address is required', 400));
    const portfolio = await portfolioService.getPortfolio(wallet);
    res.json({ data: portfolio });
  } catch (error) {
    next(error);
  }
});
portfolioRouter.get('/:wallet/history', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { wallet } = req.params;
    const { page, limit, marketId } = req.query;
    if (!wallet) return next(new AppError('Wallet address is required', 400));
    const history = await portfolioService.getTradeHistory(wallet, {
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
      marketId: marketId as string | undefined,
    });
    res.json(history);
  } catch (error) {
    next(error);
  }
});