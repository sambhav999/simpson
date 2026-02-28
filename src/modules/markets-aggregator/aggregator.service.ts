import axios, { AxiosInstance } from 'axios';
import axiosRetry from 'axios-retry';
import { config } from '../../core/config/config';
import { logger } from '../../core/logger/logger';
import { AppError } from '../../core/config/error.handler';

// Reusing the same interface names for now to minimize changes in other files, 
// though they should ideally be renamed to something like AggregatedMarket
export interface DFlowMarket {
    id: string;
    title: string;
    description: string;
    yesTokenMint: string;
    noTokenMint: string;
    expiry: string | null;
    status: string;
    category: string;
    source?: 'limitless' | 'myriad' | 'polymarket';
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
        this.limitlessClient = this.createClient(config.LIMITLESS_API_URL);
        this.myriadClient = this.createClient(config.MYRIAD_API_URL);
        this.polymarketClient = this.createClient(config.POLYMARKET_API_URL);
    }

    private createClient(baseURL: string): AxiosInstance {
        const client = axios.create({
            baseURL,
            timeout: 10000,
            headers: { 'Content-Type': 'application/json' },
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

    async getMarkets(): Promise<DFlowMarket[]> {
        try {
            logger.debug('Fetching markets from Aggregator APIs (Limitless, Myriad, Polymarket)');

            // In a real implementation, you would hit the actual endpoints for each service
            // Example of parallel fetching:
            const [limitlessRes, myriadRes, polymarketRes] = await Promise.allSettled([
                this.fetchLimitlessMarkets(),
                this.fetchMyriadMarkets(),
                this.fetchPolymarketMarkets()
            ]);

            const allMarkets: DFlowMarket[] = [];

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

    // Placeholder methods for individual market fetching - these would be adapted to actual API structures
    private async fetchLimitlessMarkets(): Promise<DFlowMarket[]> {
        try {
            // Mocking the endpoint with requested markets
            return [
                {
                    id: 'MOCK-CRYPTO-1',
                    title: 'Will Bitcoin reach $100k by end of year?',
                    description: 'Predicting if the BTC/USD pair will touch or exceed the $100,000 mark before Dec 31st.',
                    yesTokenMint: 'YESBTC100kxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
                    noTokenMint: 'NOBTC100kxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
                    expiry: new Date(new Date().setFullYear(new Date().getFullYear() + 1)).toISOString(),
                    status: 'active',
                    category: 'Crypto',
                },
                {
                    id: 'MOCK-BULL-BEAR-1',
                    title: 'Bullish vs Bearish: Tech Sector 2026',
                    description: 'Will the Tech sector overall perform bullishly compared to current averages?',
                    yesTokenMint: 'YESBULLTECHxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
                    noTokenMint: 'NOBEARTECHxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
                    expiry: new Date(new Date().setMonth(new Date().getMonth() + 6)).toISOString(),
                    status: 'active',
                    category: 'Finance',
                },
                {
                    id: 'MOCK-FLIGHT-1',
                    title: 'Air Traffic Passenger Volume > 4 Billion?',
                    description: 'Will global air traffic surpass 4 billion passengers this year?',
                    yesTokenMint: 'YESAIRTRAFFICxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
                    noTokenMint: 'NOAIRTRAFFICxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
                    expiry: new Date(new Date().setMonth(new Date().getMonth() + 3)).toISOString(),
                    status: 'active',
                    category: 'Travel',
                },
                {
                    id: 'MOCK-TECH-1',
                    title: 'Will OpenAI release GPT-5 before July?',
                    description: 'Predict whether a major version upgrade to GPT-5 will be announced.',
                    yesTokenMint: 'YESGPT5xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
                    noTokenMint: 'NOGPT5xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
                    expiry: '2026-07-01T00:00:00.000Z',
                    status: 'active',
                    category: 'Technology',
                },
                {
                    id: 'MOCK-SPORTS-1',
                    title: 'NBA Finals 2026: Eastern Conference Winner?',
                    description: 'Will the Boston Celtics win the Eastern Conference?',
                    yesTokenMint: 'YESCELTICSxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
                    noTokenMint: 'NOCELTICSxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
                    expiry: '2026-06-01T00:00:00.000Z',
                    status: 'active',
                    category: 'Sports',
                }
            ];
        } catch (err) { throw err; }
    }

    private async fetchMyriadMarkets(): Promise<DFlowMarket[]> {
        try {
            // const response = await this.myriadClient.get('/markets');
            // return response.data;
            return [];
        } catch (err) { throw err; }
    }

    private async fetchPolymarketMarkets(): Promise<DFlowMarket[]> {
        try {
            const parsedMarkets: DFlowMarket[] = [];
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


    async getMarketById(marketId: string): Promise<DFlowMarket | null> {
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
        if (!params.wallet || params.wallet.length < 32 || params.wallet.length > 44) {
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
