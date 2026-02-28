import { MarketsRepository, MarketFilter, PaginationParams } from './markets.repository';
import { AggregatorService, DFlowMarket as AggregatedMarket } from '../markets-aggregator/aggregator.service';
import { RedisService } from '../../core/config/redis.service';
import { logger } from '../../core/logger/logger';
import { AppError } from '../../core/config/error.handler';
const CACHE_TTL = 60;
const MARKETS_CACHE_KEY = 'markets:all';
export class MarketsService {
  private readonly repository: MarketsRepository;
  private readonly aggregator: AggregatorService;
  private readonly redis = RedisService.getInstance();
  constructor() {
    this.repository = new MarketsRepository();
    this.aggregator = new AggregatorService();
  }
  async getMarkets(filter: MarketFilter = {}, pagination: PaginationParams = {}) {
    const cacheKey = `${MARKETS_CACHE_KEY}:${JSON.stringify({ filter, pagination })}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      logger.debug('Returning markets from cache');
      return JSON.parse(cached);
    }
    const result = await this.repository.findAll(filter, pagination);
    await this.redis.setex(cacheKey, CACHE_TTL, JSON.stringify(result));
    return result;
  }
  async getMarketById(id: string) {
    const cacheKey = `market:${id}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) return JSON.parse(cached);
    const market = await this.repository.findById(id);
    if (!market) throw new AppError(`Market ${id} not found`, 404);
    await this.redis.setex(cacheKey, CACHE_TTL * 5, JSON.stringify(market));
    return market;
  }
  async syncMarketsFromAggregator(): Promise<{ created: number; updated: number }> {
    logger.info('Syncing markets from Aggregator Sources...');
    const rawMarkets = await this.aggregator.getMarkets();
    if (rawMarkets.length === 0) {
      logger.warn('Aggregator returned 0 markets');
      return { created: 0, updated: 0 };
    }

    // Normalization logic
    const normalizedMarkets = rawMarkets.map((m) => ({
      ...m,
      title: m.title || `Market ${m.id}`,
      description: m.description || 'No description available.',
      category: this.normalizeCategory(m.category),
    }));

    const result = await this.repository.upsertMany(normalizedMarkets);

    // Targeted Cache invalidation
    if (result.changedIds.length > 0) {
      await this.invalidateTargetedCache(result.changedIds);
    }

    return { created: result.created, updated: result.updated };
  }

  private normalizeCategory(rawCat?: string): string {
    if (!rawCat) return 'General';
    const lower = rawCat.toLowerCase();
    if (lower.includes('crypto') || lower.includes('token') || lower.includes('btc') || lower.includes('sol')) return 'Crypto';
    if (lower.includes('sport') || lower.includes('nfl') || lower.includes('nba')) return 'Sports';
    if (lower.includes('politic') || lower.includes('election')) return 'Politics';
    return 'General';
  }

  private async invalidateTargetedCache(changedIds: string[]): Promise<void> {
    const keysToDelete = [`${MARKETS_CACHE_KEY}:*`]; // Always clear global list cache
    for (const id of changedIds) {
      keysToDelete.push(`market:${id}`); // specific market cache
    }

    // Redis del doesn't support glob patterns directly, we have to keys() first for the global one
    const globalKeys = await this.redis.keys(`${MARKETS_CACHE_KEY}*`);
    const allKeysToDrop = [...new Set([...globalKeys, ...changedIds.map(id => `market:${id}`)])];

    if (allKeysToDrop.length > 0) {
      await this.redis.del(...allKeysToDrop);
      logger.debug(`Invalidated ${allKeysToDrop.length} targeted market cache entries`);
    }
  }
}