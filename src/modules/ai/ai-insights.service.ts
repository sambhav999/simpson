import { PrismaService } from '../../core/config/prisma.service';
import { PortfolioService } from '../portfolio/portfolio.service';
import { ResolutionService } from '../markets/resolution.service';

type MarketDraftInput = {
  question: string;
  description?: string;
  category?: string;
};

export class AIInsightsService {
  private readonly prisma = PrismaService.getInstance();
  private readonly portfolioService = new PortfolioService();
  private readonly resolutionService = new ResolutionService();

  async improveMarketDraft(input: MarketDraftInput) {
    const normalizedQuestion = input.question.trim().replace(/\s+/g, ' ');
    const normalizedDescription = (input.description || '').trim();
    const category = (input.category || 'General').trim();
    const rewrittenQuestion = this.rewriteQuestion(normalizedQuestion);
    const suggestionDate = this.suggestCloseDate(normalizedQuestion);

    return {
      rewritten_question: rewrittenQuestion,
      suggested_description: normalizedDescription || `Resolve using the first authoritative public source that clearly confirms whether the event happened before the deadline.`,
      suggested_rules: [
        'Use one primary source of truth and list it in the market description.',
        'Define exactly what counts as YES and what counts as NO.',
        'Set the close time before the result is likely to be public.',
        'Avoid vague words like soon, major, likely, or successful without measurable criteria.',
      ],
      suggested_close_at: suggestionDate.toISOString(),
      source_suggestions: this.getSourceSuggestions(category, normalizedQuestion),
      quality_flags: this.getDraftQualityFlags(normalizedQuestion, normalizedDescription),
      clarity_score: this.getClarityScore(normalizedQuestion, normalizedDescription),
    };
  }

  async getPortfolioCoach(walletAddress: string) {
    const portfolio = await this.portfolioService.getPortfolio(walletAddress);
    const history = await this.portfolioService.getTradeHistory(walletAddress, { days: 1 });
    const activePositions = portfolio.positions.filter((position) => position.status === 'ACTIVE');
    const topPosition = [...activePositions].sort((a, b) => b.currentValue - a.currentValue)[0] || null;
    const totalExposure = activePositions.reduce((sum, position) => sum + position.currentValue, 0);
    const concentration = totalExposure > 0 && topPosition ? (topPosition.currentValue / totalExposure) * 100 : 0;
    const realizedDirection = portfolio.totalRealizedPnl >= 0 ? 'positive' : 'negative';
    const todayTrades = history.data.filter((event: any) => event.type === 'TRADE').length;
    const todayXp = history.data.filter((event: any) => event.type === 'XP').reduce((sum: number, event: any) => sum + Number(event.amount || 0), 0);

    return {
      headline: portfolio.totalPositions > 0
        ? `You have ${portfolio.totalPositions} tracked positions with ${portfolio.totalRealizedPnl >= 0 ? 'positive' : 'negative'} realized PnL.`
        : 'No positions yet. Your best next step is a small first trade to start building portfolio history.',
      pnl_summary: `Realized PnL is ${portfolio.totalRealizedPnl >= 0 ? '+' : ''}$${portfolio.totalRealizedPnl.toFixed(2)} and win rate is ${Math.round((portfolio.accuracy || 0) * 100)}%.`,
      concentration_risk: topPosition
        ? `${topPosition.marketTitle} is your largest active position and represents ${Math.round(concentration)}% of your active exposure.`
        : 'No active concentration risk right now because there are no live positions.',
      streak_note: portfolio.totalWins > 0
        ? `You have ${portfolio.totalWins} wins across ${portfolio.totalResolved} resolved positions.`
        : 'You do not have any recorded wins yet, so focus on building a clean first track record.',
      today_change: `Today you logged ${todayTrades} trade events and earned ${todayXp} XP. Your realized performance direction is ${realizedDirection}.`,
      actions: [
        concentration > 55 ? 'Reduce concentration by adding a second uncorrelated market.' : 'Your position sizing looks reasonably balanced so far.',
        portfolio.totalResolved < 3 ? 'Resolve more positions before trusting win-rate trends.' : 'Your resolved history is now large enough to compare streaks and accuracy.',
        portfolio.xpTotal < 500 ? 'Use Daily Challenge and discussion to build XP faster.' : 'You already have meaningful XP, so lean into creator and leaderboard loops.',
      ],
    };
  }

  async getMarketExplainer(marketId: string) {
    const market = await this.prisma.market.findUnique({
      where: { id: marketId },
      include: {
        aiPredictions: { orderBy: { createdAt: 'desc' }, take: 1 },
        comments: {
          include: {
            replies: true,
          },
          orderBy: { createdAt: 'desc' },
          take: 30,
        },
      },
    });

    if (!market) {
      throw new Error('Market not found');
    }

    const trades = await this.prisma.trade.findMany({
      where: {
        marketId,
        side: 'BUY',
        status: 'SUCCESS',
      },
      orderBy: { timestamp: 'desc' },
      take: 40,
    });

    const normalizedYesPrice = this.normalizePercent(market.yesPrice, 50);
    const prices = trades
      .map((trade) => {
        const raw = typeof trade.price === 'number' ? trade.price : 0;
        const normalized = raw <= 1 ? raw * 100 : raw;
        return trade.betSide === 'NO' ? 100 - normalized : normalized;
      })
      .reverse();
    const firstObserved = prices[0] ?? normalizedYesPrice;
    const latestObserved = prices[prices.length - 1] ?? normalizedYesPrice;
    const priceDelta = latestObserved - firstObserved;
    const commentText = market.comments.map((comment) => comment.text).join(' ');
    const yesSignals = this.extractArgumentSignals(commentText, ['yes', 'bull', 'up', 'launch', 'approve', 'win', 'above']);
    const noSignals = this.extractArgumentSignals(commentText, ['no', 'bear', 'down', 'delay', 'reject', 'lose', 'below']);

    return {
      why_price_moved: priceDelta === 0
        ? 'Price has been fairly stable, which suggests the market has not seen a strong new catalyst yet.'
        : priceDelta > 0
          ? `YES probability moved up by about ${Math.abs(Math.round(priceDelta))} points as buyers leaned more optimistic.`
          : `YES probability moved down by about ${Math.abs(Math.round(priceDelta))} points as traders rotated toward NO.`,
      bull_case: market.aiPredictions[0]?.prediction === 'YES'
        ? market.aiPredictions[0].commentary
        : yesSignals || 'The bull case is that the event still has enough time and public momentum to resolve YES before the deadline.',
      bear_case: noSignals || 'The bear case is that timing, execution risk, or lack of an official source update prevents a YES resolution.',
      resolves_yes: `Resolve YES only if an authoritative source clearly confirms: ${market.description || market.title}.`,
      resolves_no: `Resolve NO if the deadline passes without that confirmation, or if a source explicitly disproves the stated outcome.`,
    };
  }

  async getCreatorHubInsights(walletAddress: string) {
    const creatorMarkets = await this.prisma.creatorMarket.findMany({
      where: { creatorId: walletAddress },
      include: {
        market: {
          include: {
            _count: { select: { comments: true } },
          },
        },
      },
      orderBy: { hostedAt: 'desc' },
      take: 30,
    });

    const activeMarkets = creatorMarkets.filter((entry) => !entry.market.resolved);
    const weaklyWrittenMarkets = activeMarkets
      .filter((entry) => (entry.market.description || '').trim().length < 80)
      .slice(0, 3)
      .map((entry) => ({
        market_id: entry.market.id,
        title: entry.market.title,
        reason: 'Description is short, so the resolution criteria may still feel ambiguous.',
      }));

    const likelyToResolveSoon = activeMarkets
      .filter((entry) => entry.market.closesAt && new Date(entry.market.closesAt).getTime() < Date.now() + 7 * 24 * 60 * 60 * 1000)
      .slice(0, 3)
      .map((entry) => ({
        market_id: entry.market.id,
        title: entry.market.title,
        closes_at: entry.market.closesAt,
      }));

    const commentLeaders = [...activeMarkets]
      .sort((a, b) => b.market._count.comments - a.market._count.comments)
      .slice(0, 3)
      .map((entry) => ({
        market_id: entry.market.id,
        title: entry.market.title,
        comments: entry.market._count.comments,
      }));

    return {
      audience_suggestions: this.getCreatorTopicSuggestions(activeMarkets.map((entry) => entry.market.category)),
      weakly_written_markets: weaklyWrittenMarkets,
      likely_to_get_comments: commentLeaders,
      likely_to_resolve_soon: likelyToResolveSoon,
      summary: activeMarkets.length > 0
        ? `You have ${activeMarkets.length} active creator-linked markets. The strongest next move is to tighten resolution rules on weaker drafts and spotlight markets that already have comment traction.`
        : 'You do not have active creator-linked markets yet, so start with one clean, source-backed market in a category your audience already follows.',
    };
  }

  async getDiscussionSummary(marketId: string) {
    const comments = await this.prisma.comment.findMany({
      where: { marketId },
      orderBy: { createdAt: 'desc' },
      take: 40,
    });

    const text = comments.map((comment) => comment.text).join(' ');
    const lowQuality = comments.filter((comment) => this.isLowQualityComment(comment.text));
    const yesArgument = this.extractArgumentSignals(text, ['yes', 'bull', 'up', 'approve', 'launch', 'win']);
    const noArgument = this.extractArgumentSignals(text, ['no', 'bear', 'down', 'delay', 'reject', 'lose']);

    return {
      summary: comments.length > 0
        ? `Discussion is active with ${comments.length} recent comments. The conversation is leaning ${yesArgument ? 'YES' : noArgument ? 'NO' : 'mixed'} based on repeated phrases and comment quality.`
        : 'No discussion signals yet. The first useful comments should focus on evidence, deadlines, and the exact source of truth.',
      strongest_yes_argument: yesArgument || 'The strongest YES case has not clearly emerged from the discussion yet.',
      strongest_no_argument: noArgument || 'The strongest NO case has not clearly emerged from the discussion yet.',
      spam_warning: lowQuality.length > 0
        ? `${lowQuality.length} recent comments look low-signal or spammy and may need moderation.`
        : 'Recent comments look mostly substantive rather than spammy.',
      low_quality_count: lowQuality.length,
    };
  }

  async getOnboardingGuide(walletAddress?: string) {
    const user = walletAddress
      ? await this.prisma.user.findUnique({
          where: { walletAddress },
          include: {
            _count: {
              select: {
                comments: true,
                creatorMarkets: true,
                positions: true,
              },
            },
          },
        })
      : null;
    const pointsBalance = walletAddress
      ? await this.prisma.pointsLedger.aggregate({
          where: { walletAddress },
          _sum: { amount: true },
        })
      : null;

    const starterClaimed = walletAddress
      ? await this.prisma.pointsLedger.findFirst({ where: { walletAddress, reason: 'completed_tutorial' } })
      : null;

    return {
      headline: walletAddress
        ? `This onboarding flow is tuned for ${walletAddress.slice(0, 4)}...${walletAddress.slice(-4)}.`
        : 'Connect a wallet to personalize the onboarding checklist.',
      steps: [
        {
          id: 'connect',
          title: 'Connect wallet',
          status: walletAddress ? 'done' : 'next',
          guidance: walletAddress ? 'Wallet is connected, so you can move into claims and first actions.' : 'Connect a Solana wallet first so the app can track claims, trades, and creator activity.',
        },
        {
          id: 'claim',
          title: 'Claim starter reward',
          status: starterClaimed ? 'done' : walletAddress ? 'next' : 'locked',
          guidance: starterClaimed ? 'Starter points are already claimed.' : 'Claim starter points or daily bonus to seed your first actions.',
        },
        {
          id: 'trade',
          title: 'Make first trade',
          status: user?._count.positions ? 'done' : walletAddress ? 'next' : 'locked',
          guidance: user?._count.positions ? 'You already have a recorded position.' : 'Use a small devnet trade first so your portfolio and activity feed become meaningful.',
        },
        {
          id: 'comment',
          title: 'Join discussion',
          status: user?._count.comments ? 'done' : walletAddress ? 'next' : 'locked',
          guidance: user?._count.comments ? 'You have already started building discussion presence.' : 'Comment on one market to unlock the social layer and earn quick XP.',
        },
        {
          id: 'create',
          title: 'Create first market',
          status: user?._count.creatorMarkets ? 'done' : walletAddress ? 'next' : 'locked',
          guidance: user?._count.creatorMarkets ? 'You already have creator-linked markets.' : 'Use the AI market copilot to create a clean, source-backed first market.',
        },
      ],
      current_points_balance: Number(pointsBalance?._sum.amount || 0),
    };
  }

  async getResolutionCopilot(marketId: string) {
    return this.resolutionService.getResolutionSuggestion(marketId);
  }

  private rewriteQuestion(question: string) {
    if (/^(will|is|does|can|has|have)\b/i.test(question)) {
      return question.endsWith('?') ? question : `${question}?`;
    }

    const trimmed = question.replace(/\?+$/, '');
    return `Will ${trimmed.charAt(0).toLowerCase()}${trimmed.slice(1)}?`;
  }

  private suggestCloseDate(question: string) {
    const yearMatch = question.match(/\b(20\d{2})\b/);
    if (yearMatch) {
      return new Date(`${yearMatch[1]}-12-31T23:00:00.000Z`);
    }

    return new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  }

  private getSourceSuggestions(category: string, question: string) {
    const text = `${category} ${question}`.toLowerCase();
    if (text.includes('crypto') || text.includes('token') || text.includes('btc') || text.includes('sol')) {
      return ['Official protocol blog or X account', 'CoinGecko / CoinMarketCap', 'Exchange announcement page'];
    }
    if (text.includes('sports')) {
      return ['Official league site', 'ESPN scoreboard', 'Team press release'];
    }
    if (text.includes('politic') || text.includes('election')) {
      return ['Election authority results page', 'Official government release', 'Associated Press race call'];
    }
    if (text.includes('tech') || text.includes('openai') || text.includes('product')) {
      return ['Official company blog', 'Press release page', 'Developer docs or launch event page'];
    }

    return ['Official source URL', 'Trusted newsroom with timestamped update', 'Named resolution authority in description'];
  }

  private getDraftQualityFlags(question: string, description: string) {
    const flags: string[] = [];
    if (!/\bby\b|\bbefore\b|\bon\b/i.test(question)) {
      flags.push('Question does not clearly include a deadline.');
    }
    if (description.length < 60) {
      flags.push('Resolution criteria are still brief and could be more explicit.');
    }
    if (!/\?/.test(question)) {
      flags.push('Question should be phrased as a yes/no market.');
    }
    return flags;
  }

  private getClarityScore(question: string, description: string) {
    let score = 58;
    if (/\bby\b|\bbefore\b|\bon\b/i.test(question)) score += 12;
    if (description.length >= 80) score += 15;
    if (description.toLowerCase().includes('source')) score += 10;
    if (question.endsWith('?')) score += 5;
    return Math.max(0, Math.min(100, score));
  }

  private normalizePercent(value: number | null | undefined, fallback: number) {
    if (typeof value !== 'number' || Number.isNaN(value)) return fallback;
    return value <= 1 ? value * 100 : value;
  }

  private extractArgumentSignals(text: string, keywords: string[]) {
    const normalized = text.toLowerCase();
    const hits = keywords.filter((keyword) => normalized.includes(keyword));
    if (hits.length === 0) return '';
    return `Repeated discussion signals mention ${hits.slice(0, 3).join(', ')}, which is the strongest visible pattern in recent comments.`;
  }

  private isLowQualityComment(text: string) {
    const normalized = text.trim().toLowerCase();
    return normalized.length < 4 || /(hii+|gm|nice|first|lol|moon)/.test(normalized);
  }

  private getCreatorTopicSuggestions(categories: string[]) {
    const categorySet = new Set(categories.map((category) => category || 'General'));
    if (categorySet.has('Crypto')) {
      return ['Add one short-dated crypto milestone market', 'Pair your crypto market with a rule-heavy source-backed question'];
    }
    if (categorySet.has('Tech')) {
      return ['Create one product launch market with a named source URL', 'Add an earnings or release-date market that can resolve cleanly'];
    }
    return ['Create one tightly scoped headline market', 'Use categories your audience already comments on most'];
  }
}
