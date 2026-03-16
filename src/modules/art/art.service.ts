
import { logger } from '../../core/logger/logger';

export class ArtService {
    /**
     * Generates a unique, high-quality Unsplash image URL for a market based on its title and category.
     * Uses the market ID as a seed to ensure the image is stable.
     */
    static getMarketArt(marketId: string, title: string, category: string): string {
        const seed = marketId || title;
        const normalizedCategory = this.normalizeCategory(category);
        
        // Extract keywords from title for better relevance
        const keywords = this.extractKeywords(title, normalizedCategory);
        const style = this.getStyleForCategory(normalizedCategory);
        
        // Switch to LoremFlickr for better reliability as Unsplash Source is deprecated
        // Format: https://loremflickr.com/g/800/600/keywords/all?lock=seed
        const combinedKeywords = `${normalizedCategory},${keywords},${style}`.replace(/ /g, '');
        const lock = this.stringToNumber(seed) % 10000;
        
        return `https://loremflickr.com/800/600/${combinedKeywords}/all?lock=${lock}`;
    }

    private static normalizeCategory(category: string): string {
        const cat = (category || 'General').toLowerCase();
        if (cat.includes('crypto')) return 'cryptocurrency';
        if (cat.includes('politics')) return 'government';
        if (cat.includes('sports')) return 'sports';
        if (cat.includes('entertainment')) return 'cinema';
        if (cat.includes('tech')) return 'technology';
        return 'business';
    }

    private static extractKeywords(title: string, category: string): string {
        // Simple extraction: take first 2 words, stripping non-alphanumeric characters
        const stops = new Set(['will', 'the', 'a', 'to', 'in', 'on', 'with', 'by', 'is', 'at', 'reach', 'handle', 'exceed', 'price', 'be', 'market', 'high', 'low']);
        const words = title.toLowerCase()
            .replace(/[^a-z0-9 ]/g, '') // Strip everything except letters, numbers, and spaces
            .split(' ')
            .filter(w => w.length > 3 && !stops.has(w));
            
        return words.slice(0, 2).join(',') || category;
    }

    private static getStyleForCategory(category: string): string {
        // Map categories to artistic styles for a premium look
        const styles: Record<string, string> = {
            'cryptocurrency': 'neon,cyberpunk',
            'government': 'architecture,monumental',
            'sports': 'dynamic,action',
            'cinema': 'neon,glamour',
            'technology': 'future,hardware',
            'abstract': 'minimalist,vibrant'
        };
        return styles[category] || 'digital art';
    }

    private static stringToNumber(str: string): number {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            hash = str.charCodeAt(i) + ((hash << 5) - hash);
        }
        return Math.abs(hash);
    }
}
