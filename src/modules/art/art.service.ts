
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
        
        // We use the https://images.unsplash.com/source API keywords logic
        // But since source.unsplash is flaky, we'll use a curated list of reliable templates
        // and a randomizer based on the seed.
        
        const style = this.getStyleForCategory(normalizedCategory);
        
        // This URL format is highly compatible and supports search + random sig
        // Using source.unsplash.com/featured/?{keywords} as a reliable redirector
        // We'll add a sig parameter to ensure uniqueness per marketId
        const encodedKeywords = encodeURIComponent(`${normalizedCategory},${keywords},${style}`);
        
        // sig ensures that different markets with same keywords get different images
        // but the same market always gets the same image.
        const sig = this.stringToNumber(seed);
        
        return `https://source.unsplash.com/featured/800x600?${encodedKeywords}&sig=${sig}`;
    }

    private static normalizeCategory(category: string): string {
        const cat = (category || 'General').toLowerCase();
        if (cat.includes('crypto')) return 'cryptocurrency';
        if (cat.includes('politics')) return 'government';
        if (cat.includes('sports')) return 'sports';
        if (cat.includes('entertainment')) return 'cinema';
        if (cat.includes('tech')) return 'technology';
        return 'abstract';
    }

    private static extractKeywords(title: string, category: string): string {
        // Simple extraction: take first 2-3 words that aren't stop words
        const stops = new Set(['will', 'the', 'a', 'to', 'in', 'on', 'with', 'by', 'is', 'at', 'reach', 'reach', 'handle', 'exceed', 'price', 'be', 'market', 'high', 'low']);
        const words = title.toLowerCase()
            .replace(/[?.,!]/g, '')
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
