import { Router, Request, Response, NextFunction } from 'express';
import { MarketsService } from './markets.service';
import { AppError } from '../../core/config/error.handler';
export const marketsRouter = Router();
const marketsService = new MarketsService();
marketsRouter.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { status, category, search, page, limit } = req.query;
    const result = await marketsService.getMarkets(
      {
        status: status as string | undefined,
        category: category as string | undefined,
        search: search as string | undefined,
      },
      {
        page: page ? Number(page) : undefined,
        limit: limit ? Number(limit) : undefined,
      }
    );
    res.json(result);
  } catch (error) {
    next(error);
  }
});
marketsRouter.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    if (!id) return next(new AppError('Market ID is required', 400));
    const market = await marketsService.getMarketById(id);
    res.json({ data: market });
  } catch (error) {
    next(error);
  }
});