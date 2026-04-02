import { Router, Request, Response, NextFunction } from 'express';
import { MarketsService } from './markets.service';
import { PrismaService } from '../../core/config/prisma.service';
import { AppError } from '../../core/config/error.handler';
import { optionalAuth, requireAuth } from '../../core/config/auth.middleware';
import { z } from 'zod';

export const marketsRouter = Router();
const marketsService = new MarketsService();
const prisma = PrismaService.getInstance();

function mapMarketForFrontend(market: {
  id: string;
  title: string;
  description: string;
  category: string;
  yesPrice: number | null;
  noPrice: number | null;
  volume: number | null;
  liquidity: number | null;
  closesAt: Date | null;
  expiry: Date | null;
  resolved?: boolean;
  resolution?: string | null;
  source: string;
  sourceUrl: string | null;
  image: string | null;
  createdAt?: Date;
}) {
  return {
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
    created_at: market.createdAt,
  };
}

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
    res.json({
      data: result.data.map(mapMarketForFrontend),
      pagination: result.pagination,
    });
  } catch (error) {
    next(error);
  }
});

marketsRouter.post('/', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const schema = z.object({
      question: z.string().min(10).max(200),
      description: z.string().max(1000).optional().default(''),
      category: z.string().min(2).max(50),
      closes_at: z.string().datetime(),
      liquidity: z.coerce.number().positive().max(1_000_000),
    });

    const body = schema.parse(req.body);
    const created = await marketsService.createCustomMarket({
      walletAddress: req.user!.wallet,
      title: body.question.trim(),
      description: body.description?.trim() || '',
      category: body.category.trim(),
      closesAt: new Date(body.closes_at),
      liquidity: body.liquidity,
    });

    res.status(201).json({
      data: {
        ...mapMarketForFrontend(created),
        creator: created.creatorMarket ? {
          id: req.user!.wallet,
          username: null,
          caption: created.creatorMarket.caption,
          referral_code: created.creatorMarket.referralCode,
        } : null,
      },
    });
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
      ...mapMarketForFrontend(p.market),
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

// GET /markets/sparkline?ids=a,b,c — recent real trade-derived yes-price history
marketsRouter.get('/sparkline', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const rawIds = String(req.query.ids || '');
    const ids = rawIds.split(',').map((id) => id.trim()).filter(Boolean).slice(0, 20);
    if (ids.length === 0) {
      return res.json({ sparklines: {} });
    }

    const [markets, trades] = await Promise.all([
      prisma.market.findMany({
        where: { id: { in: ids } },
        select: { id: true, yesPrice: true },
      }),
      prisma.trade.findMany({
        where: {
          marketId: { in: ids },
          side: 'BUY',
          status: 'SUCCESS',
        },
        select: {
          marketId: true,
          betSide: true,
          price: true,
          timestamp: true,
        },
        orderBy: { timestamp: 'desc' },
        take: ids.length * 25,
      }),
    ]);

    const marketMap = new Map(markets.map((market) => [market.id, market]));
    const grouped = new Map<string, number[]>();

    for (const trade of trades.reverse()) {
      const points = grouped.get(trade.marketId) || [];
      const rawPrice = typeof trade.price === 'number' ? trade.price : 0;
      const normalized = rawPrice <= 1 ? rawPrice * 100 : rawPrice;
      const yesPrice = trade.betSide === 'NO' ? Math.max(0, 100 - normalized) : normalized;
      points.push(Math.max(0, Math.min(100, Number(yesPrice.toFixed(2)))));
      grouped.set(trade.marketId, points.slice(-15));
    }

    const sparklines = Object.fromEntries(ids.map((id) => {
      const points = grouped.get(id);
      const fallback = marketMap.get(id)?.yesPrice;
      const normalizedFallback = typeof fallback === 'number'
        ? (fallback <= 1 ? fallback * 100 : fallback)
        : 50;
      return [id, points && points.length > 0 ? points : [normalizedFallback]];
    }));

    res.json({ sparklines });
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
      ...mapMarketForFrontend(market),
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
