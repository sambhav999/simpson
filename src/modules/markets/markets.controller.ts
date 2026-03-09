import { Router, Request, Response, NextFunction } from 'express';
import { MarketsService } from './markets.service';
import { PrismaService } from '../../core/config/prisma.service';
import { AppError } from '../../core/config/error.handler';
import { optionalAuth } from '../../core/config/auth.middleware';

export const marketsRouter = Router();
const marketsService = new MarketsService();
const prisma = PrismaService.getInstance();

// GET /markets — List markets with filtering
marketsRouter.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { status, category, search, source, sort, page, limit } = req.query;
    const result = await marketsService.getMarkets(
      {
        status: status as string | undefined,
        category: category as string | undefined,
        search: search as string | undefined,
        source: source as string | undefined,
        sort: sort as string | undefined,
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


// POST /markets/sync — Manually trigger market sync from all aggregator sources
marketsRouter.post('/sync', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await marketsService.syncMarketsFromAggregator();
    res.json({ message: 'Market sync completed', ...result });
  } catch (error) {
    next(error);
  }
});

// GET /markets/featured — Homer Baba's featured markets
marketsRouter.get('/featured', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const predictions = await prisma.aIPrediction.findMany({
      where: { featured: true },
      include: {
        market: true,
      },
      orderBy: [{ featuredRank: 'asc' }, { createdAt: 'desc' }],
      take: 30,
    });

    const markets = predictions.map((p, idx) => ({
      id: p.market.id,
      question: p.market.title,
      description: p.market.description,
      category: p.market.category,
      yes_price: p.market.yesPrice,
      no_price: p.market.noPrice,
      volume: p.market.volume,
      liquidity: p.market.liquidity,
      closes_at: p.market.closesAt || p.market.expiry,
      source: p.market.source,
      source_url: p.market.sourceUrl,
      image_url: p.market.image,
      created_at: p.market.createdAt,
      ai_prediction: {
        prediction: p.prediction,
        confidence: p.confidence,
        commentary: p.commentary,
      },
      featured_rank: p.featuredRank || idx + 1,
    }));

    res.json({ markets });
  } catch (error) {
    next(error);
  }
});

// GET /markets/:id — Market detail with AI prediction
marketsRouter.get('/:id', optionalAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    if (!id) return next(new AppError('Market ID is required', 400));

    const market = await prisma.market.findUnique({
      where: { id },
      include: {
        aiPredictions: { orderBy: { createdAt: 'desc' }, take: 1 },
        creatorMarkets: {
          include: { creator: { select: { walletAddress: true, username: true, avatarUrl: true } } },
          take: 1,
        },
        _count: { select: { comments: true } },
      },
    });

    if (!market) throw new AppError(`Market ${id} not found`, 404);

    const aiPrediction = market.aiPredictions[0];
    const creator = market.creatorMarkets[0];

    res.json({
      id: market.id,
      question: market.title,
      description: market.description,
      category: market.category,
      yes_price: market.yesPrice,
      no_price: market.noPrice,
      volume: market.volume,
      liquidity: market.liquidity,
      closes_at: market.closesAt || market.expiry,
      resolved: market.resolved,
      resolution: market.resolution,
      source: market.source,
      source_url: market.sourceUrl,
      image_url: market.image,
      ai_prediction: aiPrediction ? {
        prediction: aiPrediction.prediction,
        confidence: aiPrediction.confidence,
        commentary: aiPrediction.commentary,
        created_at: aiPrediction.createdAt,
      } : null,
      creator: creator ? {
        id: creator.creator.walletAddress,
        username: creator.creator.username,
        caption: creator.caption,
        referral_code: creator.referralCode,
      } : null,
      comments_count: market._count.comments,
    });
  } catch (error) {
    next(error);
  }
});