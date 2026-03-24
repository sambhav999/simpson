import axios from 'axios';
import { logger } from '../../core/logger/logger';

// Pyth Feed IDs for common assets
const PYTH_FEEDS: Record<string, string> = {
    'BTC': '0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43',
    'ETH': '0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace',
    'SOL': '0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d',
    'XRP': '0xec5d39984603e34199c4ad2ad54826bc1b7e25049588241603a11330364ecfb',
    'MNT': '0x17c06283d6a455a5933d59646b149b0621370e5b85a36338e55e513d31fc6665', // MNT/USD 
};

export interface MarketParams {
    asset: string;
    threshold: number;
    timestamp: number;
    comparison: 'above' | 'below';
}

export class PriceOracleService {
    private readonly HERMES_URL = 'https://hermes.pyth.network/v2/updates/price';

    /**
     * Parses a market title to extract resolution parameters.
     * Example: "ETH above $2144.28 on Mar 23, 20:00 UTC?"
     */
    parseMarketTitle(title: string): MarketParams | null {
        try {
            const regex = /([A-Z]+)\s+(above|below)\s+\$([0-9.]+)\s+on\s+([a-zA-Z]{3}\s+[0-9]{1,2}),\s+([0-9]{2}:[0-9]{2})\s+UTC/i;
            const match = title.match(regex);
            
            if (!match) return null;

            const [_, asset, comparison, threshold, dateStr, timeStr] = match;
            
            // Note: Year is assumed to be 2026 based on project context
            const fullDateStr = `${dateStr} 2026 ${timeStr} UTC`;
            const timestamp = Math.floor(new Date(fullDateStr).getTime() / 1000);

            if (isNaN(timestamp)) return null;

            return {
                asset: asset.toUpperCase(),
                threshold: parseFloat(threshold),
                timestamp,
                comparison: comparison.toLowerCase() as 'above' | 'below'
            };
        } catch (err) {
            return null;
        }
    }

    /**
     * Fetches the historical price for an asset at a specific timestamp from Pyth.
     */
    async getPriceAt(asset: string, timestamp: number): Promise<number | null> {
        const feedId = PYTH_FEEDS[asset];
        if (!feedId) {
            logger.warn(`No Pyth feed ID for asset: ${asset}`);
            return null;
        }

        try {
            const url = `${this.HERMES_URL}/${timestamp}?ids[]=${feedId}`;
            const response = await axios.get(url);
            
            const updates = response.data?.parsed;
            if (!updates || updates.length === 0) return null;

            const update = updates[0];
            const price = Number(update.price.price) * Math.pow(10, update.price.expo);
            return price;
        } catch (err) {
            logger.error(`Failed to fetch Pyth price for ${asset} at ${timestamp}: ${err}`);
            return null;
        }
    }

    /**
     * Determines the resolution of a market based on real data.
     */
    async getResolution(title: string): Promise<'YES' | 'NO' | null> {
        const params = this.parseMarketTitle(title);
        if (!params) return null;

        const actualPrice = await this.getPriceAt(params.asset, params.timestamp);
        if (actualPrice === null) return null;

        const resolvedYes = params.comparison === 'above' 
            ? actualPrice > params.threshold 
            : actualPrice < params.threshold;

        return resolvedYes ? 'YES' : 'NO';
    }
}
