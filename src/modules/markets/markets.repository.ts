import { PrismaService } from '../../core/config/prisma.service';
import { DFlowMarket } from '../markets-aggregator/aggregator.service';
import { logger } from '../../core/logger/logger';
export interface MarketFilter {
  status?: string;
  category?: string;
  search?: string;
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
  async upsertMarket(market: DFlowMarket) {
    return this.prisma.market.upsert({
      where: { externalId: market.id },
      create: {
        externalId: market.id,
        title: market.title,
        description: market.description,
        yesTokenMint: market.yesTokenMint,
        noTokenMint: market.noTokenMint,
        expiry: market.expiry ? new Date(market.expiry) : null,
        status: market.status,
        category: market.category,
      },
      update: {
        title: market.title,
        description: market.description,
        status: market.status,
        expiry: market.expiry ? new Date(market.expiry) : null,
        category: market.category,
      },
    });
  }
  async upsertMany(markets: DFlowMarket[]) {
    let updated = 0;
    let created = 0;
    const changedIds: string[] = [];
    for (const market of markets) {
      const existing = await this.prisma.market.findUnique({
        where: { externalId: market.id },
      });
      const dbMarket = await this.upsertMarket(market);
      if (!existing) {
        created++;
        changedIds.push(dbMarket.id);
      } else if (existing.status !== market.status || existing.category !== market.category || existing.title !== market.title) {
        updated++;
        changedIds.push(dbMarket.id);
      }
    }
    logger.info(`Market sync: ${created} created, ${updated} updated`);
    return { created, updated, changedIds };
  }
  async findAll(filter: MarketFilter = {}, pagination: PaginationParams = {}) {
    const { status, category, search } = filter;
    const page = Math.max(1, pagination.page || 1);
    const limit = Math.min(100, Math.max(1, pagination.limit || 20));
    const skip = (page - 1) * limit;
    const where: Record<string, unknown> = {};
    if (status) where['status'] = status;
    if (category) where['category'] = category;
    if (search) {
      where['OR'] = [
        { title: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ];
    }
    const [markets, total] = await Promise.all([
      this.prisma.market.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
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
}