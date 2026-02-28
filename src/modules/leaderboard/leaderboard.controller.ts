import { Router, Request, Response, NextFunction } from 'express';
import { LeaderboardService } from './leaderboard.service';
export const leaderboardRouter = Router();
const leaderboardService = new LeaderboardService();
leaderboardRouter.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { page, limit, sortBy } = req.query;
    const result = await leaderboardService.getLeaderboard({
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
      sortBy: sortBy as string | undefined,
    });
    res.json(result);
  } catch (error) {
    next(error);
  }
});