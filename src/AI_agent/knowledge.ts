export const KNOWLEDGE_BASE = [
  {
    intent: 'platform_overview',
    keywords: ['what is simpredict', 'simpredict', 'overview', 'about simpredict', 'prediction market'],
    answer: 'Simpredict is a Solana-based prediction market platform with live market ingestion, AI Oracle predictions, wallet-based trading, leaderboard tracking, portfolio analytics, and market discussions.',
  },
  {
    intent: 'homer_baba',
    keywords: ['homer baba', 'ai oracle', 'oracle', 'who is homer', 'who is baba'],
    answer: 'Homer Baba is the Simpredict AI Oracle. It publishes market calls with confidence and commentary, and its performance is tracked against the community on the AI scoreboard.',
  },
  {
    intent: 'daily_challenges',
    keywords: ['daily challenge', 'daily battle', 'daily', 'daily game', 'battle rewards'],
    answer: 'Daily Challenge lets users predict a rotating set of markets. Submitting gives XP, and strong performance can earn bonus XP for high scores, perfect cards, or beating Homer Baba.',
  },
  {
    intent: 'trading',
    keywords: ['how to trade', 'buy yes', 'buy no', 'trade', 'wallet trade', 'solana pay'],
    answer: 'Trading on Simpredict is wallet-driven. Users connect a Solana-compatible wallet, request a quote, sign the transaction, and then the backend records the resulting position and trade details.',
  },
  {
    intent: 'xp_points',
    keywords: ['xp', 'how to earn xp', 'rewards', 'experience points', 'points'],
    answer: 'XP is the main progression system on Simpredict. Users earn it from actions like trading, daily participation, and successful market outcomes, while wallet and ledger data track the underlying activity.',
  },
  {
    intent: 'leaderboard',
    keywords: ['leaderboard', 'rank', 'top users', 'accuracy leaderboard', 'xp leaderboard'],
    answer: 'Simpredict has leaderboard views for metrics like XP, PnL, accuracy, and volume, so users can compare performance against the rest of the platform.',
  },
  {
    intent: 'portfolio',
    keywords: ['portfolio', 'positions', 'pnl', 'trade history', 'my performance'],
    answer: 'The portfolio area shows open and resolved positions, realized PnL, wallet activity history, accuracy, and XP totals tied to the connected user.',
  },
  {
    intent: 'social',
    keywords: ['comments', 'discussion', 'social', 'reply', 'market comments'],
    answer: 'Each market has a live discussion section. Connected users can post comments, and those comments are loaded from the backend rather than from mock client-side data.',
  },
  {
    intent: 'treasury',
    keywords: ['treasury', 'winner payout', 'payouts', 'winner money', 'devnet payouts'],
    answer: 'When a market resolves, Simpredict can pay winners from the treasury wallet, update realized PnL in the portfolio, and award XP in the same backend flow.',
  },
  {
    intent: 'tech_stack',
    keywords: ['tech stack', 'technology', 'backend', 'frontend', 'stack'],
    answer: 'The backend uses Node.js, Express, Prisma, MongoDB, Redis, and Solana services. The frontend uses React, Vite, TanStack Query, and wallet integrations for the trading UX.',
  },
  {
    intent: 'ui_navigation_predictions',
    keywords: ['where are predictions', 'show predictions', 'ai oracle page', 'oracle tab'],
    answer: 'AI Oracle predictions live in the Oracle section of the app, where users can browse today\'s featured calls, older predictions, expired calls, and scoreboard stats.',
  },
  {
    intent: 'ui_navigation_portfolio',
    keywords: ['where is my portfolio', 'my portfolio', 'my trades', 'my balance'],
    answer: 'The Portfolio page is where users review positions, trade history, realized PnL, XP, and accuracy after connecting a wallet.',
  },
];
