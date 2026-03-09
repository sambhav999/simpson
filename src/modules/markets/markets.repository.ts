import { PrismaService } from '../../core/config/prisma.service';
import { AggregatedMarket } from '../markets-aggregator/aggregator.service';
import { logger } from '../../core/logger/logger';
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
      },
      update: {
        title: market.title,
        description: market.description,
        status: market.status,
        expiry: market.expiry ? new Date(market.expiry) : null,
        category: market.category,
        image: market.image,
        source: market.source || undefined,
        volume: this.parseNumericString(market.volume),
        liquidity: this.parseNumericString(market.liquidity),
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
    const where: Record<string, unknown> = {};
    if (status) where['status'] = status;
    if (category) where['category'] = category;
    if (source) where['source'] = source;
    if (search) {
      where['OR'] = [
        { title: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ];
    }
    let orderBy: any = { createdAt: 'desc' };

    if (filter.sort) {
      switch (filter.sort) {
        case 'volume':
          orderBy = { volume: 'desc' };
          break;
        case 'liquidity':
          orderBy = { liquidity: 'desc' };
          break;
        case 'closing_soon':
          orderBy = { expiry: 'asc' };
          if (!where['status']) where['status'] = 'active';
          where['expiry'] = { gt: new Date() }; // Only show future closures
          break;
        case 'trending':
          orderBy = [{ volume: 'desc' }, { liquidity: 'desc' }];
          break;
      }
    }

    const [markets, total] = await Promise.all([
      this.prisma.market.findMany({
        where,
        skip,
        take: limit,
        orderBy,
      }),
      this.prisma.market.count({ where }),
    ]);
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

  private parseNumericString(val?: string): number | undefined {
    if (!val) return undefined;
    // Remove currency symbols, commas, and other non-numeric chars except .
    const clean = val.replace(/[^\d.-]/g, '');
    const num = parseFloat(clean);
    return isNaN(num) ? undefined : num;
  }
}