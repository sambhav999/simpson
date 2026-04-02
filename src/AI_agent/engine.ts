import { config } from '../core/config/config';
import { PrismaService } from '../core/config/prisma.service';
import { KNOWLEDGE_BASE } from './knowledge';

type KnowledgeItem = (typeof KNOWLEDGE_BASE)[number];

type LiveSnapshot = {
  totalMarkets: number;
  activeMarkets: number;
  resolvedMarkets: number;
  totalUsers: number;
  totalComments: number;
  totalVolume: number;
  totalAIPredictions: number;
  resolvedAIPredictions: number;
  aiWins: number;
  aiLosses: number;
  todaysFeaturedPredictions: number;
  trendingTitles: string[];
};

export class HomerAgent {
  private static readonly prisma = PrismaService.getInstance();

  public static async answer(message: string): Promise<string> {
    const normalized = this.normalize(message);

    if (this.isGreeting(normalized)) {
      const snapshot = await this.getLiveSnapshot();
      return [
        `Hello. I am the Simpredict Agent, and I can help with live markets, AI Oracle stats, treasury payouts, XP, comments, and product flow.`,
        `Right now Simpredict has ${this.formatNumber(snapshot.totalMarkets)} total markets, ${this.formatNumber(snapshot.activeMarkets)} active markets, and ${this.formatNumber(snapshot.totalAIPredictions)} AI predictions recorded.`,
      ].join(' ');
    }

    if (this.matchesAny(normalized, ['trending', 'hot', 'popular', 'live markets', 'market now', 'markets moving'])) {
      const snapshot = await this.getLiveSnapshot();
      const trending = snapshot.trendingTitles.length > 0
        ? `The highest-volume live markets right now include ${snapshot.trendingTitles.join(', ')}.`
        : `I could not find named trending markets right now, but live market data is available.`;
      return [
        `Simpredict is using real market data here, not mock cards.`,
        trending,
        `There are ${this.formatNumber(snapshot.activeMarkets)} active markets out of ${this.formatNumber(snapshot.totalMarkets)} total, with about ${this.formatCurrency(snapshot.totalVolume)} in total platform market volume.`,
      ].join(' ');
    }

    if (this.matchesAny(normalized, ['ai oracle', 'homer baba', 'oracle', 'predictions', 'all calls', 'todays predictions', 'expired predictions', 'old predictions'])) {
      const snapshot = await this.getLiveSnapshot();
      const accuracy = snapshot.resolvedAIPredictions > 0
        ? `${((snapshot.aiWins / snapshot.resolvedAIPredictions) * 100).toFixed(1)}%`
        : '0.0%';
      return [
        `The AI Oracle is backed by real database records.`,
        `Total AI predictions ever: ${this.formatNumber(snapshot.totalAIPredictions)}.`,
        `Today's featured predictions: ${this.formatNumber(snapshot.todaysFeaturedPredictions)}.`,
        `Resolved AI calls: ${this.formatNumber(snapshot.resolvedAIPredictions)} with ${this.formatNumber(snapshot.aiWins)} wins and ${this.formatNumber(snapshot.aiLosses)} losses, for ${accuracy} accuracy.`,
        `Today's, old, and expired sections are filtered views of that larger prediction history.`,
      ].join(' ');
    }

    if (this.matchesAny(normalized, ['comment', 'comments', 'discussion', 'reply', 'social'])) {
      const snapshot = await this.getLiveSnapshot();
      return [
        `Market discussion is live.`,
        `Connected users can post comments, and disconnected users are prompted to connect before commenting.`,
        `The platform currently has ${this.formatNumber(snapshot.totalComments)} comments stored across markets.`,
      ].join(' ');
    }

    if (this.matchesAny(normalized, ['treasury', 'payout', 'winner money', 'winner gets money', 'devnet', 'solana network'])) {
      const treasuryReady = Boolean(config.TREASURY_WALLET && config.TREASURY_PRIVATE_KEY);
      return [
        `Winner payouts are handled from the treasury wallet during market resolution.`,
        `The current Solana network is ${config.SOLANA_NETWORK}.`,
        treasuryReady
          ? `Treasury signing is configured, so winning users can receive treasury-funded payouts when a market resolves.`
          : `Treasury signing is not fully configured yet, so payouts would not work until the treasury signer is set.`,
        `Portfolio realized PnL and XP updates are part of the same resolution flow.`,
      ].join(' ');
    }

    if (this.matchesAny(normalized, ['xp', 'rewards', 'daily battle', 'daily challenge', 'streak', 'leaderboard', 'portfolio'])) {
      const knowledge = this.findBestKnowledgeMatch(normalized);
      const snapshot = await this.getLiveSnapshot();
      const base = knowledge?.answer || 'Simpredict tracks XP, market positions, realized PnL, and leaderboard stats with live backend data.';
      return [
        base,
        `There are currently ${this.formatNumber(snapshot.totalUsers)} users in the platform dataset and ${this.formatNumber(snapshot.activeMarkets)} active markets users can interact with now.`,
      ].join(' ');
    }

    const knowledge = this.findBestKnowledgeMatch(normalized);
    if (knowledge) {
      const shouldAppendSnapshot = this.matchesAny(normalized, ['simpredict', 'overview', 'about', 'platform', 'what is']);
      if (!shouldAppendSnapshot) {
        return knowledge.answer;
      }

      const snapshot = await this.getLiveSnapshot();
      return [
        knowledge.answer,
        `Live platform snapshot: ${this.formatNumber(snapshot.totalMarkets)} total markets, ${this.formatNumber(snapshot.activeMarkets)} active markets, ${this.formatNumber(snapshot.totalUsers)} users, ${this.formatNumber(snapshot.totalAIPredictions)} AI predictions, and ${this.formatNumber(snapshot.totalComments)} comments.`,
      ].join(' ');
    }

    const snapshot = await this.getLiveSnapshot();
    return [
      `I can help with live markets, AI Oracle stats, treasury payouts, XP, comments, Daily Challenge flow, and trading behavior on Simpredict.`,
      `Right now I can see ${this.formatNumber(snapshot.totalMarkets)} markets, ${this.formatNumber(snapshot.totalAIPredictions)} AI predictions, and ${this.formatNumber(snapshot.totalComments)} comments in the platform data.`,
      `Try asking about trending markets, AI Oracle performance, winner payouts, or how commenting and XP work.`,
    ].join(' ');
  }

  private static normalize(message: string): string {
    return message.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
  }

  private static isGreeting(message: string): boolean {
    return ['hi', 'hello', 'hey', 'yo', 'hola'].some((word) => message === word || message.startsWith(`${word} `));
  }

  private static matchesAny(message: string, phrases: string[]): boolean {
    return phrases.some((phrase) => message.includes(phrase));
  }

  private static findBestKnowledgeMatch(message: string): KnowledgeItem | null {
    const queryWords = message.split(/\s+/).filter(Boolean);
    let bestMatch: KnowledgeItem | null = null;
    let maxMatchedWords = 0;

    for (const item of KNOWLEDGE_BASE) {
      for (const keyword of item.keywords) {
        const keywordWords = this.normalize(keyword).split(/\s+/).filter(Boolean);
        let matchedWords = 0;

        for (const keywordWord of keywordWords) {
          const found = queryWords.some((queryWord) =>
            queryWord === keywordWord ||
            (keywordWord.length > 3 && queryWord.startsWith(keywordWord.slice(0, -1))) ||
            (queryWord.length > 3 && keywordWord.startsWith(queryWord.slice(0, -1)))
          );

          if (found) {
            matchedWords += 1;
          }
        }

        if (matchedWords === keywordWords.length && matchedWords > maxMatchedWords) {
          maxMatchedWords = matchedWords;
          bestMatch = item;
        }
      }
    }

    return bestMatch;
  }

  private static async getLiveSnapshot(): Promise<LiveSnapshot> {
    const now = new Date();
    const [
      totalMarkets,
      activeMarkets,
      resolvedMarkets,
      totalUsers,
      totalComments,
      marketVolume,
      totalAIPredictions,
      aiWins,
      aiLosses,
      todaysFeaturedPredictions,
      trendingMarkets,
    ] = await Promise.all([
      this.prisma.market.count(),
      this.prisma.market.count({
        where: {
          resolved: false,
          status: 'active',
        },
      }),
      this.prisma.market.count({ where: { resolved: true } }),
      this.prisma.user.count(),
      this.prisma.comment.count(),
      this.prisma.market.aggregate({
        _sum: { volume: true },
      }),
      this.prisma.aIPrediction.count(),
      this.prisma.aIPrediction.count({ where: { resolved: true, result: 'WIN' } }),
      this.prisma.aIPrediction.count({ where: { resolved: true, result: 'LOSS' } }),
      this.prisma.aIPrediction.count({
        where: {
          featured: true,
          market: {
            OR: [
              { closesAt: { gt: now } },
              { expiry: { gt: now } },
            ],
          },
        },
      }),
      this.prisma.market.findMany({
        where: {
          resolved: false,
          status: 'active',
        },
        orderBy: [
          { volume: 'desc' },
          { liquidity: 'desc' },
        ],
        select: { title: true },
        take: 3,
      }),
    ]);

    return {
      totalMarkets,
      activeMarkets,
      resolvedMarkets,
      totalUsers,
      totalComments,
      totalVolume: Number(marketVolume._sum.volume || 0),
      totalAIPredictions,
      resolvedAIPredictions: aiWins + aiLosses,
      aiWins,
      aiLosses,
      todaysFeaturedPredictions,
      trendingTitles: trendingMarkets.map((market) => `"${market.title}"`),
    };
  }

  private static formatNumber(value: number): string {
    return new Intl.NumberFormat('en-US').format(value);
  }

  private static formatCurrency(value: number): string {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0,
    }).format(value);
  }
}
