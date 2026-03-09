import { MarketsRepository, MarketFilter, PaginationParams } from './markets.repository';
import { AggregatorService, AggregatedMarket } from '../markets-aggregator/aggregator.service';
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
    const version = await this.getCacheVersion();
    const cacheKey = `${MARKETS_CACHE_KEY}:${version}:${JSON.stringify({ filter, pagination })}`;

    const cached = await this.redis.get(cacheKey);
    if (cached) {
      logger.debug(`Returning markets from cache (key: ${cacheKey})`);
      return JSON.parse(cached);
    }

    const start = Date.now();
    const result = await this.repository.findAll(filter, pagination);
    const duration = Date.now() - start;

    logger.debug(`Markets DB query took ${duration}ms`);
    await this.redis.setex(cacheKey, CACHE_TTL, JSON.stringify(result));
    return result;
  }

  private async getCacheVersion(): Promise<string> {
    const key = `${MARKETS_CACHE_KEY}:v`;
    let version = await this.redis.get(key);
    if (!version) {
      version = '1';
      await this.redis.set(key, version);
    }
    return version;
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
    if (lower.includes('crypto') || lower.includes('token') || lower.includes('btc') || lower.includes('sol') || lower.includes('doge') || lower.includes('eth')) return 'Crypto';
    if (lower.includes('sport') || lower.includes('nfl') || lower.includes('nba') || lower.includes('soccer') || lower.includes('football')) return 'Sports';
    if (lower.includes('politic') || lower.includes('election') || lower.includes('vote')) return 'Politics';
    if (lower.includes('hourly') || lower.includes('daily') || lower.includes('weekly')) return 'Crypto'; // Limitless recurring price markets
    if (lower.includes('entertainment') || lower.includes('culture') || lower.includes('pop')) return 'Entertainment';
    return 'General';
  }

  private async invalidateTargetedCache(changedIds: string[]): Promise<void> {
    // Increment the global version key to invalidate all list caches instantly and safely
    const versionKey = `${MARKETS_CACHE_KEY}:v`;
    await this.redis.incr(versionKey);

    const keysToDelete: string[] = [];
    for (const id of changedIds) {
      keysToDelete.push(`market:${id}`);
    }

    if (keysToDelete.length > 0) {
      await this.redis.del(...keysToDelete);
      logger.debug(`Invalidated ${keysToDelete.length} specific market cache entries and incremented global version`);
    } else {
      logger.debug('Incremented global markets cache version');
    }
  }
}