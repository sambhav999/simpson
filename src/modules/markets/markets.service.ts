import { MarketsRepository, MarketFilter, PaginationParams } from './markets.repository';
import { AggregatorService, AggregatedMarket } from '../markets-aggregator/aggregator.service';
import { RedisService } from '../../core/config/redis.service';
import { logger } from '../../core/logger/logger';
import { AppError } from '../../core/config/error.handler';

const CACHE_TTL = 300;               // 5 minutes (up from 60s)
const STALE_TTL = CACHE_TTL + 120;   // 7 minutes — serve stale for 2 min while refreshing
const MARKETS_CACHE_KEY = 'markets:all';

export class MarketsService {
  private readonly repository: MarketsRepository;
  private readonly aggregator: AggregatorService;
  private readonly redis = RedisService.getInstance();
  private refreshingKeys = new Set<string>(); // Prevent duplicate background refreshes

  constructor() {
    this.repository = new MarketsRepository();
    this.aggregator = new AggregatorService();
  }

  async getMarkets(filter: MarketFilter = {}, pagination: PaginationParams = {}) {
    const version = await this.getCacheVersion();
    const cacheKey = `${MARKETS_CACHE_KEY}:${version}:${JSON.stringify({ filter, pagination })}`;

    const cached = await this.redis.get(cacheKey);
    if (cached) {
      const parsed = JSON.parse(cached);

      // Stale-while-revalidate: check if cache is past fresh TTL but still within stale TTL
      const ttl = await this.redis.ttl(cacheKey);
      if (ttl > 0 && ttl <= (STALE_TTL - CACHE_TTL) && !this.refreshingKeys.has(cacheKey)) {
        // Cache is stale — serve it immediately but refresh in background
        this.refreshingKeys.add(cacheKey);
        this.refreshCache(cacheKey, filter, pagination).finally(() => {
          this.refreshingKeys.delete(cacheKey);
        });
      }

      logger.debug(`Returning markets from cache (key: ${cacheKey})`);
      return parsed;
    }

    const start = Date.now();
    const result = await this.repository.findAll(filter, pagination);
    const duration = Date.now() - start;

    logger.debug(`Markets DB query took ${duration}ms`);
    await this.redis.setex(cacheKey, STALE_TTL, JSON.stringify(result));
    return result;
  }

  /**
   * Background refresh: re-fetch from DB and update cache without blocking the response.
   */
  private async refreshCache(cacheKey: string, filter: MarketFilter, pagination: PaginationParams): Promise<void> {
    try {
      const result = await this.repository.findAll(filter, pagination);
      await this.redis.setex(cacheKey, STALE_TTL, JSON.stringify(result));
      logger.debug(`Background cache refresh completed for ${cacheKey}`);
    } catch (error) {
      logger.warn(`Background cache refresh failed for ${cacheKey}`, error);
    }
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

  async createCustomMarket(input: {
    walletAddress: string;
    title: string;
    description?: string;
    category: string;
    closesAt: Date;
    liquidity: number;
    sourceUrl?: string;
  }) {
    const now = new Date();
    if (input.closesAt.getTime() <= now.getTime()) {
      throw new AppError('Market close date must be in the future', 400);
    }

    const market = await this.repository.createCustomMarket(input);
    await this.invalidateTargetedCache([market.id]);
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

  /**
   * Pre-populate cache for the most common queries so users never hit a cold cache.
   * Called after every market sync job.
   */
  async warmCache(): Promise<void> {
    logger.info('Warming market caches...');
    const start = Date.now();

    const commonQueries: Array<{ filter: MarketFilter; pagination: PaginationParams }> = [
      { filter: {}, pagination: { page: 1, limit: 20 } },                          // Default homepage
      { filter: { sort: 'trending' }, pagination: { page: 1, limit: 20 } },        // Trending
      { filter: { sort: 'volume' }, pagination: { page: 1, limit: 20 } },          // By volume
      { filter: { category: 'Crypto' }, pagination: { page: 1, limit: 20 } },      // Crypto category
      { filter: { category: 'Politics' }, pagination: { page: 1, limit: 20 } },    // Politics category
      { filter: { category: 'Sports' }, pagination: { page: 1, limit: 20 } },      // Sports category
      { filter: { category: 'Tech' }, pagination: { page: 1, limit: 20 } },        // Tech category
      { filter: { category: 'Science' }, pagination: { page: 1, limit: 20 } },     // Science category
      { filter: { category: 'General' }, pagination: { page: 1, limit: 20 } },     // General category
    ];

    const version = await this.getCacheVersion();

    for (const query of commonQueries) {
      try {
        const cacheKey = `${MARKETS_CACHE_KEY}:${version}:${JSON.stringify(query)}`;
        const result = await this.repository.findAll(query.filter, query.pagination);
        await this.redis.setex(cacheKey, STALE_TTL, JSON.stringify(result));
      } catch (error) {
        logger.warn(`Cache warming failed for query: ${JSON.stringify(query.filter)}`);
      }
    }

    const duration = Date.now() - start;
    logger.info(`Cache warming completed in ${duration}ms (${commonQueries.length} queries)`);
  }

  private normalizeCategory(rawCat?: string): string {
    if (!rawCat) return 'General';
    const lower = rawCat.toLowerCase();
    if (lower.includes('crypto') || lower.includes('token') || lower.includes('btc') || lower.includes('sol') || lower.includes('doge') || lower.includes('eth')) return 'Crypto';
    if (lower.includes('sport') || lower.includes('nfl') || lower.includes('nba') || lower.includes('soccer') || lower.includes('football')) return 'Sports';
    if (lower.includes('politic') || lower.includes('election') || lower.includes('vote')) return 'Politics';
    if (lower.includes('hourly') || lower.includes('daily') || lower.includes('weekly')) return 'Crypto'; // Limitless recurring price markets
    if (
      lower.includes('tech') ||
      lower.includes('technology') ||
      lower.includes('software') ||
      lower.includes('hardware') ||
      lower.includes('ai') ||
      lower.includes('artificial intelligence') ||
      lower.includes('openai') ||
      lower.includes('google') ||
      lower.includes('apple') ||
      lower.includes('microsoft')
    ) return 'Tech';
    if (
      lower.includes('science') ||
      lower.includes('research') ||
      lower.includes('space') ||
      lower.includes('nasa') ||
      lower.includes('physics') ||
      lower.includes('biology') ||
      lower.includes('chemistry') ||
      lower.includes('climate') ||
      lower.includes('medical') ||
      lower.includes('health')
    ) return 'Science';
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
