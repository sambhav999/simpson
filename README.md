# SimPredict

**A non-custodial prediction marketplace powered by Solana, Pyth Network oracles, and DFlow.**

SimPredict aggregates real-time odds from leading prediction platforms (Polymarket, Limitless Exchange), presents them through a premium glassmorphism UI, and enables seamless trading via Solana Pay QR codes or direct browser wallet integration.

<p align="center">
  <img src="https://img.shields.io/badge/Node.js-20-339933?logo=node.js" alt="Node.js" />
  <img src="https://img.shields.io/badge/TypeScript-5.4-3178C6?logo=typescript" alt="TypeScript" />
  <img src="https://img.shields.io/badge/React-18-61DAFB?logo=react" alt="React" />
  <img src="https://img.shields.io/badge/Solana-Web3.js-9945FF?logo=solana" alt="Solana" />
  <img src="https://img.shields.io/badge/Prisma-5.10-2D3748?logo=prisma" alt="Prisma" />
  <img src="https://img.shields.io/badge/Redis-7-DC382D?logo=redis" alt="Redis" />
  <img src="https://img.shields.io/badge/Docker-Ready-2496ED?logo=docker" alt="Docker" />
</p>

---

## Architecture

This project is a **monorepo** consisting of:

| Layer | Stack | Description |
|-------|-------|-------------|
| **Frontend** (`/frontend`) | React 18 + Vite + Custom CSS | Glassmorphism SPA with real-time updates |
| **Backend** (`/src`) | Node.js + Express + Prisma | REST API, WebSocket server, background workers |
| **Database** | PostgreSQL (via Prisma ORM) | 16 models, optimized indexes |
| **Cache & Queue** | Redis 7 (IORedis + BullMQ) | High-performance caching & job scheduling |
| **Blockchain** | Solana (Web3.js + Solana Pay) | Non-custodial trade execution |

```
simpredict-backend/
├── src/                         # Node.js REST API + Background Jobs
│   ├── main.ts                  # Bootstrap & server lifecycle
│   ├── app.ts                   # Express app (middleware + 16 route mounts)
│   ├── core/                    # Prisma, Redis, Logger, Socket.IO singletons
│   ├── modules/                 # 20 feature modules
│   └── jobs/                    # 7 BullMQ background workers
├── frontend/                    # React Vite SPA
│   └── src/
│       ├── pages/               # 7 pages (Landing, Markets, Daily, etc.)
│       └── components/          # Reusable UI components
├── prisma/schema.prisma         # Database schema (16 models)
├── docker-compose.yml           # Redis + Backend + Migrations
├── Dockerfile                   # Multi-stage production build
└── render.yaml                  # Render.com IaC deployment
```

---

## Features

### 🎯 Prediction Marketplace
- **Multi-Source Aggregation** — Aggregates markets from Polymarket & Limitless Exchange in real-time
- **Market Explorer** — Browse, filter, and search markets by category, source, volume, and status
- **Market Detail** — Individual market pages with live odds, comments, AI predictions, and trade flow
- **Featured Markets** — Curated market highlights

### 🃏 Daily Challenges & AI Oracle
- **Daily Battle** — Auto-generated daily challenges (10-20 random markets) for user competition
- **Homer Baba 🔮** — AI Oracle that makes predictions with confidence scores and bullish/bearish commentary
- **AI vs Community** — Global scoreboard comparing Homer's accuracy against aggregated community predictions
- **XP Rewards** — Bonus multipliers for perfect scores and beating the AI

### 💰 Solana Trading
- **Solana Pay QR Codes** — Instant mobile trading via Phantom/Solflare wallets
- **Browser Wallet Connect** — Native Phantom and wallet adapter support
- **DFlow Routing** — MEV-protected order-flow auction execution
- **On-Chain Indexing** — Real-time Solana transaction listener with checkpoint recovery

### 📊 Portfolio & Leaderboards
- **Portfolio Tracking** — Active positions, PnL, total value, and trade history per wallet
- **Multi-Dimensional Leaderboards** — Rankings by PnL, volume, win rate, XP, accuracy, and creator referrals
- **User Profiles** — Customizable profiles with avatars, bios, and stats

### 🎮 Gamification
- **XP System** — Experience points earned via trades, predictions, and daily challenges
- **Points Currency** — Separate reward currency with full ledger tracking
- **Streak Tracking** — Current and all-time highest trading streaks

### 🌐 Social Features
- **Threaded Comments** — Comment on markets with upvoting and replies
- **Follow System** — Follow other users and track their activity
- **Activity Feed** — Social feed aggregating content from followed users

### 🎨 Creator Economy
- **Host Markets** — Creators can host markets with custom captions and unique referral codes
- **Attribution Tracking** — Click-through and conversion tracking for referral links
- **Creator Leaderboard** — Rankings based on referral performance

### 🃏 Meme Cards
- **SVG-to-PNG Generation** — Shareable prediction cards rendered via Satori + Resvg
- **Cloudflare R2 Storage** — Cards stored on S3-compatible edge storage
- **Click Tracking** — Analytics on card shares and engagement

---

## Getting Started

### Prerequisites

- **Node.js** ≥ 20
- **PostgreSQL** instance (local or managed)
- **Redis** instance (local or managed)
- **Solana RPC** endpoint (e.g., [Helius](https://helius.dev))

### 1. Install Dependencies

```bash
# Backend
npm install

# Frontend
cd frontend && npm install && cd ..
```

### 2. Configure Environment

Create a `.env` file in the project root and a `.env` inside `frontend/`. Use the tables below as a reference.

#### Backend `.env`

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | ✅ | MongoDB connection string (Atlas or local) |
| `REDIS_URL` | ✅ | Redis connection URL |
| `HELIUS_RPC_URL` | ✅ | Solana RPC endpoint (Helius recommended) |
| `SOLANA_NETWORK` | ✅ | `devnet` or `mainnet-beta` |
| `FEE_WALLET_ADDRESS` | ✅ | Wallet that receives platform fees |
| `TREASURY_WALLET` | ✅ | Treasury wallet for fund management |
| `PRIVY_APP_ID` | ✅ | Privy authentication app ID |
| `PRIVY_APP_SECRET` | ✅ | Privy authentication app secret |
| `PORT` | ✅ | Server port (default `3000`) |
| `NODE_ENV` | ✅ | `development` or `production` |
| `LIMITLESS_API_URL` | ✅ | Limitless Exchange API base URL |
| `LIMITLESS_API_KEY` | ❌ | Optional Limitless API key (`lmts_...`) |
| `POLYMARKET_API_URL` | ✅ | Polymarket Gamma API base URL |
| `MANIFOLD_API_URL` | ✅ | Manifold Markets API base URL |
| `HEDGEHOG_API_URL` | ✅ | Hedgehog Markets API base URL |
| `KALSHI_API_URL` | ✅ | Kalshi API base URL |
| `SXBET_API_URL` | ✅ | SX Bet API base URL |
| `LOG_LEVEL` | ❌ | Log verbosity (`info`, `debug`, `warn`, `error`) |
| `R2_ENDPOINT` | ❌ | Cloudflare R2 S3-compatible endpoint |
| `R2_ACCESS_KEY_ID` | ❌ | Cloudflare R2 access key |
| `R2_SECRET_ACCESS_KEY` | ❌ | Cloudflare R2 secret key |
| `R2_BUCKET_NAME` | ❌ | R2 bucket name for meme cards |
| `APP_URL` | ❌ | Frontend URL for CORS / redirects |

<details>
<summary><strong>Example <code>.env</code> (click to expand)</strong></summary>

```env
# Database
DATABASE_URL="mongodb+srv://<user>:<password>@<cluster>.mongodb.net/simpredict?appName=Cluster0"

# Redis
REDIS_URL="redis://localhost:6379"

# Solana
HELIUS_RPC_URL="https://devnet.helius-rpc.com/?api-key=<your-helius-api-key>"
SOLANA_NETWORK=devnet
FEE_WALLET_ADDRESS="<your-fee-wallet-public-key>"
TREASURY_WALLET="<your-treasury-wallet-public-key>"

# Aggregator APIs
LIMITLESS_API_URL="https://api.limitless.exchange"
LIMITLESS_API_KEY=""
POLYMARKET_API_URL="https://gamma-api.polymarket.com"
MANIFOLD_API_URL="https://api.manifold.markets/v0"
HEDGEHOG_API_URL="https://api.hedgehog.markets/v1"
KALSHI_API_URL="https://api.elections.kalshi.com/trade-api/v2"
SXBET_API_URL="https://api.sx.bet/markets/active"

# Server
PORT=3000
NODE_ENV=development

# Logging
LOG_LEVEL=info

# Auth (Privy)
PRIVY_APP_ID="<your-privy-app-id>"
PRIVY_APP_SECRET="<your-privy-app-secret>"

# Cloudflare R2 (Meme Cards) — optional
R2_ENDPOINT=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET_NAME=simpredicts-cards

# App
APP_URL=http://localhost:5173
```

</details>

#### Frontend `frontend/.env`

| Variable | Required | Description |
|----------|----------|-------------|
| `VITE_BACKEND_URL` | ✅ | Backend API base URL |
| `VITE_SOLANA_RPC_URL` | ✅ | Solana RPC for frontend transactions |
| `VITE_PRIVY_APP_ID` | ✅ | Privy app ID (same as backend) |


### 3. Set Up Database

```bash
npx prisma db push
npx prisma generate
```

### 4. Start Development Servers

**Terminal 1 — Backend** (runs on `http://localhost:3000`):
```bash
npm run start:dev
```

**Terminal 2 — Frontend** (runs on `http://localhost:5173`):
```bash
cd frontend && npm run dev
```

### 5. Seed Markets (Optional)

Trigger a manual market sync to populate your database:
```bash
curl -X POST http://localhost:3000/markets/sync
```

---

## API Overview

### Core Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/health` | Health check |
| `GET` | `/markets` | List markets (paginated) |
| `GET` | `/markets/featured` | Featured markets |
| `GET` | `/markets/:id` | Market details |
| `GET` | `/portfolio/:wallet` | Wallet portfolio |
| `GET` | `/portfolio/:wallet/history` | Trade history |
| `GET/POST` | `/trade/pay` | Solana Pay trade flow |
| `GET` | `/leaderboard` | Global leaderboard |
| `GET` | `/metrics` | Prometheus metrics |

### V1 API (`/api/`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/auth/nonce` | Generate auth nonce |
| `POST` | `/api/auth/verify` | Verify wallet signature |
| `GET` | `/api/predictions/ai` | AI predictions |
| `POST` | `/api/predictions/track` | Track prediction |
| `GET/POST` | `/api/daily/*` | Daily battle system |
| `POST` | `/api/creators/host` | Host a market |
| `POST` | `/api/cards/generate` | Generate meme card |
| `POST` | `/api/comments` | Create comment |
| `POST` | `/api/follow` | Follow user |
| `GET` | `/api/feed` | Activity feed |

> For more details on the API architecture, see the source code in `src/modules/`.

---

## Background Jobs

Seven BullMQ workers run on configurable cron schedules:

| Job | Interval | Purpose |
|-----|----------|---------|
| Market Sync | 5 min | Aggregates markets from Polymarket & Limitless |
| Portfolio Sync | 10 min | Refreshes wallet positions & PnL |
| Oracle Sync | 2 min | Fetches Pyth Network price feeds |
| Fee Reconciliation | 30 min | Reconciles protocol fee revenues |
| Resolution Sync | 15 min | Checks market resolution status |
| Leaderboard Update | 15 min | Recalculates global rankings |
| Cleanup | Daily | Prunes expired data |

---

## Deployment

### 🚀 Zomro VPS (Production)

The production backend is hosted on a managed VPS.

**Deployment Workflow:**
1. **SSH**: Connect as root.
2. **PM2**: `pm2 restart simpredict-backend --update-env`
3. **Logs**: `pm2 logs simpredict-backend`

### 🐳 Docker

```bash
# Start all services (Redis + Backend + Migrations)
docker compose up -d
```

### ☁️ Render.com

The included `render.yaml` provides one-click deployment for cloud-native setups.

---

## Production Optimization (2-Core)

For servers with limited cores (2 vCPUs), keep these configurations:
- **Sync Intervals**: Set `REPEAT_INTERVAL_MS` to `600_000` (10 min) in `market-sync.job.ts`.
- **Deduplication**: Ensure background jobs only run on `NODE_APP_INSTANCE=0`.

---

## Tech Stack

| Category | Technologies |
|----------|-------------|
| **Backend** | Node.js, Express, TypeScript, Prisma, BullMQ |
| **Frontend** | React 18, Vite, Custom CSS (Glassmorphism) |
| **Database** | PostgreSQL, Redis (IORedis) |
| **Blockchain** | Solana Web3.js, Solana Pay, Pyth Network, DFlow |
| **Real-Time** | Socket.IO (with Redis adapter) |
| **Image Gen** | Satori, Resvg, Cloudflare R2 |
| **Monitoring** | Winston, Morgan, Prometheus (prom-client) |
| **Security** | Helmet, CORS, Rate Limiting, JWT |
| **DevOps** | Docker, Docker Compose, Render.com |

---

## Scripts

| Command | Description |
|---------|-------------|
| `npm run start:dev` | Start backend with hot reload |
| `npm run build` | Compile TypeScript |
| `npm start` | Run production server |
| `npm run start:render` | Migrate + start (for Render) |
| `npm run lint` | ESLint fix |
| `npx prisma studio` | Open Prisma database GUI |
| `npx prisma db push` | Push schema to database |

---

## License

This project is proprietary software. All rights reserved.
