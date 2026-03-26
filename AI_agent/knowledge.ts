export const KNOWLEDGE_BASE = [
  {
    intent: 'platform_overview',
    keywords: ['what is simpredict', 'simpredict', 'overview', 'about', 'prediction marketplace'],
    answer: "SimPredict is a production-grade, non-custodial prediction marketplace powered by Solana, Pyth Network oracles, and DFlow. It aggregates real-time odds from leading platforms like Polymarket and Limitless Exchange, presenting them through a premium glassmorphism UI."
  },
  {
    intent: 'homer_baba',
    keywords: ['homer baba', 'oracle', 'ai oracle', 'who is homer', 'who is baba'],
    answer: "Homer Baba is the project's AI Oracle! 🔮 He makes daily predictions on market outcomes with confidence scores and detailed commentary. You can compete against his accuracy in the 'AI vs Community' scoreboard."
  },
  {
    intent: 'daily_challenges',
    keywords: ['daily challenge', 'daily battle', 'daily 5', 'how to play daily', 'rewards'],
    answer: "Daily Battles are auto-generated challenges where you predict the outcomes of 10-20 random active markets. Participation earns you 10 XP, and perfect scores or beating Homer's accuracy unlock even more rewards!"
  },
  {
    intent: 'trading',
    keywords: ['how to trade', 'buy', 'sell', 'solana pay', 'qr code', 'wallet', 'phantom'],
    answer: "You can trade outcomes directly via Solana Pay QR codes (using mobile wallets like Phantom or Solflare) or through native browser wallet integration. All trades use USDC on Solana and are routed through DFlow for MEV protection."
  },
  {
    intent: 'xp_points',
    keywords: ['xp', 'points', 'how to earn xp', 'experience', 'rewards', 'currency'],
    answer: "You earn XP (Experience Points) by trading (+20 XP), participating in Daily Battles (+10 XP), and making correct predictions. Points are a separate reward currency tracked in your wallet's ledger."
  },
  {
    intent: 'leaderboard',
    keywords: ['leaderboard', 'rank', 'badges', 'legendary baba', 'oracle prophet'],
    answer: "The global leaderboard ranks users by Volume, PnL, XP, and Accuracy. As you earn more XP, you unlock badges like 'Market Caller', 'Oracle Prophet', and the ultimate 'Legendary Baba' (50,000+ XP)!"
  },
  {
    intent: 'portfolio',
    keywords: ['portfolio', 'my trades', 'pnl', 'track', 'history', 'stats'],
    answer: "The Portfolio view shows your active positions, calculates your unrealized PnL in real-time, and provides a full history of your past trades and accuracy stats."
  },
  {
    intent: 'social',
    keywords: ['social', 'comment', 'follow', 'feed', 'upvote'],
    answer: "SimPredict features a social layer where you can comment on markets, follow other traders, and see a real-time activity feed of their trades and predictions."
  },
  {
    intent: 'tech_stack',
    keywords: ['tech stack', 'technology', 'how it works', 'prisma', 'node', 'solana', 'react'],
    answer: "SimPredict is built with a modern stack: Node.js/Express and Prisma (PostgreSQL) on the backend, React 18/Vite on the frontend, and Solana for non-custodial trading. It uses Redis for caching and BullMQ for background jobs."
  }
];
