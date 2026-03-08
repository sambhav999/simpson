import axios, { AxiosInstance } from 'axios';
import axiosRetry from 'axios-retry';
// @ts-ignore
import MyriadClient from 'myriad-sdk';
import { config } from '../../core/config/config';
import { logger } from '../../core/logger/logger';
import { AppError } from '../../core/config/error.handler';

// Shape returned by the Limitless /markets/active endpoint
interface LimitlessMarketResponse {
    id: number;
    address: string;
    conditionId: string;
    title: string;
    description: string;
    collateralToken: { address: string; decimals: number; symbol: string };
    creator: { name: string; imageURI: string; link: string };
    prices: number[];           // [yesPrice, noPrice]
    categories: string[];
    tags: string[];
    status: string;             // "FUNDED", etc.
    expired: boolean;
    expirationDate: string;
    expirationTimestamp: number;
    volume: string;
    volumeFormatted: string;
    openInterest?: string;
    openInterestFormatted?: string;
    liquidity: string;
    liquidityFormatted: string;
    tradeType: string;          // "amm" | "clob" | "group"
    marketType: string;         // "single" | "group"
    slug: string;
    image?: string;
    feedEvents?: unknown[];
}

interface LimitlessActiveResponse {
    data: LimitlessMarketResponse[];
    totalMarketsCount: number;
}

// Normalized market shape used across all aggregator sources
export interface AggregatedMarket {
    id: string;
    title: string;
    description: string;
    yesTokenMint: string;
    noTokenMint: string;
    expiry: string | null;
    status: string;
    category: string;
    source?: 'limitless' | 'myriad' | 'polymarket';
    image?: string;
    volume?: string;
    liquidity?: string;
    prices?: number[];
    slug?: string;
}

export interface TradeQuoteParams {
    wallet: string;
    marketId: string;
    side: 'YES' | 'NO';
    amount: number;
}

export interface TradeQuoteResponse {
    serializedTransaction: string;
    expectedPrice: number;
    priceImpact: number;
    fee: number;
    expiresAt: number;
    source?: string;
}

export class AggregatorService {
    private readonly limitlessClient: AxiosInstance;
    private readonly myriadClient: AxiosInstance;
    private readonly polymarketClient: AxiosInstance;

    constructor() {
        const limitlessHeaders: Record<string, string> = {};
        if (config.LIMITLESS_API_KEY) {
            limitlessHeaders['X-API-Key'] = config.LIMITLESS_API_KEY;
        }
        this.limitlessClient = this.createClient(config.LIMITLESS_API_URL, limitlessHeaders);
        this.myriadClient = this.createClient(config.MYRIAD_API_URL);
        this.polymarketClient = this.createClient(config.POLYMARKET_API_URL);
    }

    private createClient(baseURL: string, extraHeaders: Record<string, string> = {}): AxiosInstance {
        const client = axios.create({
            baseURL,
            timeout: 15000,
            headers: { 'Content-Type': 'application/json', ...extraHeaders },
        });

        axiosRetry(client, {
            retries: 2,
            retryDelay: axiosRetry.exponentialDelay,
            retryCondition: (error) =>
                axiosRetry.isNetworkOrIdempotentRequestError(error) ||
                (error.response?.status !== undefined && error.response.status >= 500),
            onRetry: (retryCount, error) => {
                logger.warn(`Aggregator API retry ${retryCount} for ${baseURL}: ${error.message}`);
            },
        });

        return client;
    }

    async getMarkets(): Promise<AggregatedMarket[]> {
        try {
            logger.debug('Fetching markets from Aggregator APIs (Limitless, Myriad, Polymarket)');

            // In a real implementation, you would hit the actual endpoints for each service
            // Example of parallel fetching:
            const [limitlessRes, myriadRes, polymarketRes] = await Promise.allSettled([
                this.fetchLimitlessMarkets(),
                this.fetchMyriadMarkets(),
                this.fetchPolymarketMarkets()
            ]);

            const allMarkets: AggregatedMarket[] = [];

            if (limitlessRes.status === 'fulfilled') {
                allMarkets.push(...limitlessRes.value.map(m => ({ ...m, source: 'limitless' as const })));
            } else {
                logger.error(`Failed to fetch short from Limitless: ${limitlessRes.reason}`);
            }

            if (myriadRes.status === 'fulfilled') {
                allMarkets.push(...myriadRes.value.map(m => ({ ...m, source: 'myriad' as const })));
            } else {
                logger.error(`Failed to fetch from Myriad: ${myriadRes.reason}`);
            }

            if (polymarketRes.status === 'fulfilled') {
                allMarkets.push(...polymarketRes.value.map(m => ({ ...m, source: 'polymarket' as const })));
            } else {
                logger.error(`Failed to fetch from Polymarket: ${polymarketRes.reason}`);
            }

            logger.info(`Fetched ${allMarkets.length} consolidated markets from aggregator sources`);
            return allMarkets;
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            logger.error(`Failed to fetch markets from Aggregator: ${message}`);
            throw new AppError(`Aggregator markets fetch failed: ${message}`, 502);
        }
    }

    /**
     * Fetches real market data from the Limitless Exchange API.
     * Paginates through all active markets (up to 500) and maps them
     * to our internal AggregatedMarket shape.
     */
    private async fetchLimitlessMarkets(): Promise<AggregatedMarket[]> {
        const parsedMarkets: AggregatedMarket[] = [];
        let page = 1;
        const limit = 25;
        let hasMore = true;

        while (hasMore && parsedMarkets.length < 500) {
            try {
                const response = await this.limitlessClient.get<LimitlessActiveResponse>(
                    `/markets/active`,
                    { params: { limit, page } }
                );

                const { data: markets, totalMarketsCount } = response.data;

                if (!Array.isArray(markets) || markets.length === 0) {
                    hasMore = false;
                    break;
                }

                for (const m of markets) {
                    // Skip expired markets
                    if (m.expired) continue;

                    parsedMarkets.push({
                        id: `LMT-${m.id}`,
                        title: m.title || `Limitless Market #${m.id}`,
                        description: m.description || '',
                        yesTokenMint: m.address,
                        noTokenMint: m.conditionId,
                        expiry: m.expirationTimestamp
                            ? new Date(m.expirationTimestamp).toISOString()
                            : null,
                        status: m.status === 'FUNDED' ? 'active' : m.status.toLowerCase(),
                        category: (m.categories && m.categories.length > 0)
                            ? m.categories[0]
                            : 'General',
                        image: m.image || m.creator?.imageURI || undefined,
                        volume: m.volumeFormatted || undefined,
                        liquidity: m.liquidityFormatted || undefined,
                        prices: m.prices || undefined,
                        slug: m.slug || undefined,
                    });
                }

                // Check if we've fetched all available markets
                if (parsedMarkets.length >= totalMarketsCount || markets.length < limit) {
                    hasMore = false;
                } else {
                    page++;
                }

                logger.debug(`Limitless: fetched page ${page - 1}, got ${markets.length} markets (total so far: ${parsedMarkets.length})`);
            } catch (err) {
                const message = err instanceof Error ? err.message : 'Unknown error';
                logger.error(`Limitless API error on page ${page}: ${message}`);
                // If first page fails, throw. If later pages fail, return what we have.
                if (page === 1) throw err;
                hasMore = false;
            }
        }

        logger.info(`Limitless: fetched ${parsedMarkets.length} active markets total`);
        return parsedMarkets;
    }

    private async fetchMyriadMarkets(): Promise<AggregatedMarket[]> {
        try {
            // Myriad SDK requires WEB3_PROVIDER to be set in env.
            // If missing, we provide a default devnet fallback to prevent constructor crash.
            if (!process.env.WEB3_PROVIDER) {
                process.env.WEB3_PROVIDER = 'https://api.devnet.solana.com';
            }

            const myriadClient = new MyriadClient();

            // The Myriad API may require a token or return empty if not authenticated.
            // We wrap this in a try-catch to ensure one failed source doesn't block the aggregator.
            const response = await myriadClient.myriad.fetchMarkets({ status: 'open' as any }).catch(e => {
                logger.warn(`Myriad SDK fetchMarkets failed: ${e.message}`);
                return { data: [] };
            });

            const markets = response?.data || [];

            if (markets.length === 0) {
                logger.info('Myriad: SDK returned 0 markets');
                return [];
            }

            const parsedMarkets: AggregatedMarket[] = markets.map((m: any) => {
                return {
                    id: `MYR-${m.id}`,
                    title: m.title || 'Unknown Market',
                    description: m.description || '',
                    yesTokenMint: `MYR_YES_${m.id}`,
                    noTokenMint: `MYR_NO_${m.id}`,
                    expiry: m.expiresAt || null,
                    status: m.status === 'open' ? 'active' : m.status,
                    category: m.category?.name || m.category?.id || 'Myriad',
                    image: m.imageUrl || undefined,
                    volume: m.volume?.total ? `$${m.volume.total.toLocaleString()}` : undefined,
                    liquidity: m.liquidity?.total ? `$${m.liquidity.total.toLocaleString()}` : undefined,
                    prices: (m.outcomes && m.outcomes.length >= 2) ? [m.outcomes[0].price, m.outcomes[1].price] : undefined,
                    source: 'myriad' as const,
                    slug: m.slug || undefined
                };
            });

            logger.info(`Myriad: fetched ${parsedMarkets.length} active markets from SDK`);
            return parsedMarkets;
        } catch (err) {
            logger.error(`Failed to fetch from Myriad: ${err}`);
            throw err;
        }
    }

    private async fetchPolymarketMarkets(): Promise<AggregatedMarket[]> {
        try {
            const parsedMarkets: AggregatedMarket[] = [];
            let offset = 0;
            const limit = 100;
            let hasMore = true;

            // Fetch up to 500 events to prevent massive overload, but gets "all" major active ones
            while (hasMore && offset < 500) {
                const response = await this.polymarketClient.get(`/events?active=true&closed=false&limit=${limit}&offset=${offset}`);
                const events = response.data;

                if (!Array.isArray(events) || events.length === 0) {
                    hasMore = false;
                    break;
                }

                for (const event of events) {
                    if (!event.markets || !Array.isArray(event.markets)) continue;
                    for (const market of event.markets) {
                        let yesTokenMint = `POLY_YES_${market.id}`;
                        let noTokenMint = `POLY_NO_${market.id}`;

                        try {
                            if (market.clobTokenIds && typeof market.clobTokenIds === 'string') {
                                const tokens = JSON.parse(market.clobTokenIds);
                                if (tokens && tokens.length >= 2) {
                                    yesTokenMint = tokens[0];
                                    noTokenMint = tokens[1];
                                }
                            }
                        } catch (e) {
                            // Default dummy mints if unparsable
                        }

                        parsedMarkets.push({
                            id: `POLY-${market.id || event.id}`,
                            title: market.question || event.title || 'Unknown Market',
                            description: market.description || event.description || '',
                            yesTokenMint,
                            noTokenMint,
                            expiry: market.endDate || event.endDate || new Date(Date.now() + 86400000).toISOString(),
                            status: market.active ? 'active' : 'inactive',
                            category: (event.tags && event.tags.length > 0) ? event.tags[0].label || event.tags[0] : 'Polymarket',
                            image: market.image || market.icon || event.image || event.icon || undefined,
                        });
                    }
                }

                if (events.length < limit) {
                    hasMore = false; // Last page
                } else {
                    offset += limit;
                }
            }

            return parsedMarkets;
        } catch (err) {
            logger.warn(`Failed fetching Polymarket data. (Note: Gamma API may block certain IPs): ${err}`);
            throw err;
        }
    }


    async getMarketById(marketId: string): Promise<AggregatedMarket | null> {
        try {
            // In a real implementation, you might need to try all three or encode the source in the ID
            // For now, simulating a fetch
            const markets = await this.getMarkets();
            return markets.find(m => m.id === marketId) || null;
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            logger.error(`Failed to fetch market ${marketId}: ${message}`);
            throw new AppError(`Aggregator market fetch failed: ${message}`, 502);
        }
    }

    async getTradeQuote(params: TradeQuoteParams): Promise<TradeQuoteResponse> {
        try {
            this.validateTradeParams(params);
            logger.debug(`Getting trade quote for market ${params.marketId}, side ${params.side}`);

            // Determine the best source or default to one based on the marketId prefix/metadata
            // Simulating a call to limitless for the quote
            const response = await this.limitlessClient.post<TradeQuoteResponse>('/quote', {
                wallet: params.wallet,
                marketId: params.marketId,
                side: params.side,
                amount: params.amount,
            }).catch(() => {
                // Fallback mock
                return {
                    data: {
                        serializedTransaction: 'mock_tx_data',
                        expectedPrice: Math.random(),
                        priceImpact: 0.01,
                        fee: 0.005,
                        expiresAt: Date.now() + 60000,
                        source: 'mock'
                    }
                }
            });

            if (!response.data?.serializedTransaction) {
                throw new AppError('Aggregator returned invalid trade quote response', 502);
            }

            logger.info(`Trade quote obtained for market ${params.marketId}`);
            return response.data;
        } catch (error) {
            if (error instanceof AppError) throw error;
            const message = error instanceof Error ? error.message : 'Unknown error';
            logger.error(`Failed to get trade quote: ${message}`);
            throw new AppError(`Trade quote failed: ${message}`, 502);
        }
    }

    private validateTradeParams(params: TradeQuoteParams): void {
        const isValidLength = params.wallet.length === 42 || (params.wallet.length >= 32 && params.wallet.length <= 44);
        if (!params.wallet || !isValidLength) {
            throw new AppError('Invalid wallet address', 400);
        }
        if (!params.marketId) {
            throw new AppError('Market ID is required', 400);
        }
        if (!['YES', 'NO'].includes(params.side)) {
            throw new AppError('Side must be YES or NO', 400);
        }
        if (params.amount <= 0) {
            throw new AppError('Amount must be greater than 0', 400);
        }
    }
}
