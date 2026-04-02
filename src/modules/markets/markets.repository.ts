import { PrismaService } from '../../core/config/prisma.service';
import { AggregatedMarket } from '../markets-aggregator/aggregator.service';
import { logger } from '../../core/logger/logger';
import crypto from 'crypto';
export interface MarketFilter {
  status?: string;
  category?: string;
  search?: string;
  source?: string;
  sort?: string;
}
export interface PaginationParams {
  page?: number;
  limit?: number;
}
export class MarketsRepository {
  private readonly prisma: PrismaService;
  constructor() {
    this.prisma = PrismaService.getInstance();
  }
  async upsertMarket(market: AggregatedMarket) {
    return this.prisma.market.upsert({
      where: { externalId: market.id },
      create: {
        externalId: market.id,
        title: market.title,
        description: market.description,
        yesTokenMint: market.yesTokenMint || 'N/A',
        noTokenMint: market.noTokenMint || 'N/A',
        expiry: market.expiry ? new Date(market.expiry) : null,
        status: market.status,
        category: market.category,
        image: market.image,
        source: market.source || 'polymarket',
        volume: this.parseNumericString(market.volume),
        liquidity: this.parseNumericString(market.liquidity),
        yesPrice: market.prices ? market.prices[0] : null,
        noPrice: market.prices ? market.prices[1] : null,
      },
      update: {
        title: market.title,
        description: market.description,
        yesTokenMint: market.yesTokenMint || undefined,
        noTokenMint: market.noTokenMint || undefined,
        status: market.status,
        expiry: market.expiry ? new Date(market.expiry) : null,
        category: market.category,
        image: market.image,
        source: market.source || undefined,
        volume: this.parseNumericString(market.volume),
        liquidity: this.parseNumericString(market.liquidity),
        yesPrice: market.prices ? market.prices[0] : null,
        noPrice: market.prices ? market.prices[1] : null,
      },
    });
  }
  async upsertMany(markets: AggregatedMarket[]) {
    let updated = 0;
    let created = 0;
    const changedIds: string[] = [];

    // Batch reads and upserts to avoid overwhelming the DB and keep memory footprint low
    const BATCH_SIZE = 50;
    for (let i = 0; i < markets.length; i += BATCH_SIZE) {
      const chunk = markets.slice(i, i + BATCH_SIZE);
      const chunkIds = chunk.map(m => m.id);

      // Pre-fetch only this chunk's existing markets
      const existingMarkets = await this.prisma.market.findMany({
        where: { externalId: { in: chunkIds } },
        select: { id: true, externalId: true, status: true, category: true, title: true, image: true }
      });
      const existingMap = new Map(existingMarkets.map(m => [m.externalId, m]));

      for (const market of chunk) {
        const existing = existingMap.get(market.id);

        let needsUpdate = !existing;
        if (existing) {
          needsUpdate = existing.status !== market.status ||
            existing.category !== market.category ||
            existing.title !== market.title ||
            existing.image !== market.image;
        }

        if (needsUpdate) {
          const dbMarket = await this.upsertMarket(market);
          if (!existing) {
            created++;
          } else {
            updated++;
          }
          changedIds.push(dbMarket.id);
        }
      }

      // Small artificial delay to ensure the event loop is yielded
      // so the HTTP server can fulfill health checks without CPU starvation
      await new Promise(resolve => setTimeout(resolve, 5));
    }

    logger.info(`Market sync: ${created} created, ${updated} updated`);
    return { created, updated, changedIds };
  }
  async findAll(filter: MarketFilter = {}, pagination: PaginationParams = {}) {
    const { status, category, search, source } = filter;
    const page = Math.max(1, pagination.page || 1);
    const limit = Math.min(100, Math.max(1, pagination.limit || 20));
    const skip = (page - 1) * limit;
    const where: Record<string, any> = {
      status: 'active',
      OR: [
        { expiry: null },
        { expiry: { gt: new Date() } }
      ]
    };
    
    if (category) where['category'] = category;
    if (source) where['source'] = source;
    if (search) {
      const searchFilter = [
        { title: { contains: search } },
        { description: { contains: search } },
      ];
      where['AND'] = [
        { OR: searchFilter }
      ];
    }
    let orderBy: any = { createdAt: 'desc' };

    if (filter.sort) {
      switch (filter.sort) {
        case 'newest':
          orderBy = { createdAt: 'desc' };
          break;
        case 'oldest':
          orderBy = { createdAt: 'asc' };
          break;
        case 'ending_soon':
          orderBy = { expiry: 'asc' };
          // Note: Frontend should usually filter for status=active when using this
          break;
        case 'volume':
          orderBy = { volume: 'desc' };
          break;
        case 'liquidity':
          orderBy = { liquidity: 'desc' };
          break;
        case 'trending':
          orderBy = [{ volume: 'desc' }, { liquidity: 'desc' }];
          break;
      }
    }

    const start = Date.now();
    const [markets, total] = await Promise.all([
      this.prisma.market.findMany({
        where,
        skip,
        take: limit,
        orderBy,
      }),
      this.prisma.market.count({ where }),
    ]);
    const duration = Date.now() - start;
    if (duration > 500) {
      logger.warn(`Market repository findAll took ${duration}ms (where: ${JSON.stringify(where)})`);
    }

    return {
      data: markets,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }
  async findById(id: string) {
    return this.prisma.market.findUnique({ where: { id } });
  }
  async findByExternalId(externalId: string) {
    return this.prisma.market.findUnique({ where: { externalId } });
  }
  async findByTokenMint(tokenMint: string) {
    return this.prisma.market.findFirst({
      where: {
        OR: [{ yesTokenMint: tokenMint }, { noTokenMint: tokenMint }],
      },
    });
  }

  async createCustomMarket(input: {
    walletAddress: string;
    title: string;
    description?: string;
    category: string;
    closesAt: Date;
    liquidity: number;
    sourceUrl?: string;
  }) {
    const referralCode = await this.generateUniqueReferralCode();
    const yesTokenMint = `custom_yes_${crypto.randomBytes(8).toString('hex')}`;
    const noTokenMint = `custom_no_${crypto.randomBytes(8).toString('hex')}`;

    return this.prisma.$transaction(async (tx) => {
      await tx.user.upsert({
        where: { walletAddress: input.walletAddress },
        create: {
          walletAddress: input.walletAddress,
          xpTotal: 0,
        },
        update: {},
      });

      const market = await tx.market.create({
        data: {
          title: input.title,
          description: input.description || '',
          category: input.category,
          yesTokenMint,
          noTokenMint,
          closesAt: input.closesAt,
          expiry: input.closesAt,
          status: 'active',
          source: 'simpredict',
          sourceUrl: input.sourceUrl || null,
          volume: 0,
          liquidity: input.liquidity,
          yesPrice: 0.5,
          noPrice: 0.5,
          resolved: false,
        },
      });

      const creatorMarket = await tx.creatorMarket.create({
        data: {
          creatorId: input.walletAddress,
          marketId: market.id,
          caption: input.description || `Hosted by ${input.walletAddress.slice(0, 6)}...${input.walletAddress.slice(-4)}`,
          referralCode,
        },
      });

      await tx.xPTransaction.create({
        data: {
          walletAddress: input.walletAddress,
          amount: 25,
          reason: 'market_hosted',
          metadata: { market_id: market.id },
        },
      });

      await tx.user.upsert({
        where: { walletAddress: input.walletAddress },
        update: {
          xpTotal: { increment: 25 },
        },
        create: {
          walletAddress: input.walletAddress,
          xpTotal: 25,
        },
      });

      return {
        ...market,
        creatorMarket,
      };
    });
  }

  private async generateUniqueReferralCode(): Promise<string> {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const referralCode = crypto.randomBytes(4).toString('hex');
      const existing = await this.prisma.creatorMarket.findUnique({
        where: { referralCode },
        select: { id: true },
      });

      if (!existing) {
        return referralCode;
      }
    }

    throw new Error('Unable to generate a unique referral code');
  }

  private parseNumericString(val?: string): number | undefined {
    if (!val) return undefined;
    // Remove currency symbols, commas, and other non-numeric chars except .
    const clean = val.replace(/[^\d.-]/g, '');
    const num = parseFloat(clean);
    return isNaN(num) ? undefined : num;
  }
}
