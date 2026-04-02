import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { AIInsightsService } from './ai-insights.service';

const router = Router();
const aiInsightsService = new AIInsightsService();

router.post('/market-copilot', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const schema = z.object({
      question: z.string().min(5).max(300),
      description: z.string().max(1000).optional(),
      category: z.string().max(50).optional(),
    });
    const body = schema.parse(req.body);
    const data = await aiInsightsService.improveMarketDraft(body);
    res.json({ data });
  } catch (error) {
    next(error);
  }
});

router.get('/portfolio/:wallet/coach', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await aiInsightsService.getPortfolioCoach(req.params.wallet);
    res.json({ data });
  } catch (error) {
    next(error);
  }
});

router.get('/markets/:id/explainer', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await aiInsightsService.getMarketExplainer(req.params.id);
    res.json({ data });
  } catch (error) {
    next(error);
  }
});

router.get('/creators/:wallet/hub', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await aiInsightsService.getCreatorHubInsights(req.params.wallet);
    res.json({ data });
  } catch (error) {
    next(error);
  }
});

router.get('/comments/market/:marketId/summary', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await aiInsightsService.getDiscussionSummary(req.params.marketId);
    res.json({ data });
  } catch (error) {
    next(error);
  }
});

router.get('/onboarding-guide', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const wallet = typeof req.query.wallet === 'string' ? req.query.wallet : undefined;
    const data = await aiInsightsService.getOnboardingGuide(wallet);
    res.json({ data });
  } catch (error) {
    next(error);
  }
});

export { router as aiRouter };
