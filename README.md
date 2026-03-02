# SimPredict

A comprehensive, production-ready prediction marketplace built with React, Node.js, Express, Prisma, and Solana.

This application acts as a real-time aggregator for top prediction markets (such as Polymarket and Limitless), providing users a premium UI to browse events, track their portfolio, view global leaderboards, and execute seamless trades via Solana Pay QR codes or direct browser wallet integration.

---

## Architecture Overview

This project is a monorepo consisting of:
1. **Frontend (`/frontend`)**: A React Single Page Application (SPA) styled with custom CSS and glassmorphism.
2. **Backend (`/src`)**: A robust Node.js + Express API powered by Prisma (PostgreSQL) and Redis.

```
simpredict-backend/
├── frontend/                # React Vite Application
│   ├── src/
│   │   ├── App.tsx          # Main Views (Markets, Portfolio, Leaderboard)
│   │   ├── main.tsx         # Entrypoint
│   │   └── App.css          # Global Styles
├── src/                     # Node.js REST API
│   ├── core/
│   │   └── config/          # Prisma & Redis singletons
│   ├── modules/
│   │   ├── markets-aggregator/ # Fetches from Polymarket, Limitless, Myriad
│   │   ├── markets/         # Market service and DB repository
│   │   ├── portfolio/       # Wallet positions and trades
│   │   ├── leaderboard/     # Global PnL and Streak rankings
│   │   └── trade/           # Solana Pay QR generation and execution parsing
│   ├── jobs/                # Background BullMQ workers (Market Sync)
│   └── main.ts              # Express Server Setup
├── prisma/
│   └── schema.prisma        # Database Models (User, Market, Position, Trade...)
└── .env                     # Configuration Secrets
```

---

## 🚀 Features

### Frontend (React UI)
- **Markets View:** Browse dynamically synced prediction markets (Polymarket + Limitsless Mocks) with full-bleed premium cover images.
- **Portfolio View:** Track active positions, overall PnL, Total Value, and recent trade history for connected wallets.
- **Leaderboard View:** See top traders globally, sortable by Highest Streak and Total Volume. Connected user is dynamically highlighted!
- **Solana Pay Integration:** Instantly generate dynamic Solana Pay QR Codes to seamlessly execute trades from a mobile phantom/solflare wallet!
- **Browser Wallet Connect:** Connect Phantom or MetaMask natively to view tracked balances and history.

### Backend (Node + Express)
- **Aggregator Service:** Reaches out to leading API providers to extract, normalize, and cache current prediction events, including their thumbnails and categories!
- **Solana Pay API:** `GET /trade/pay` and `POST /trade/pay` endpoints that implement the official Solana Pay specification to facilitate secure, gasless signing flows.
- **High-Performance Caching:** Upstash Redis provides lightning-fast Leaderboard sorting and Market querying.
- **Prisma ORM:** PostgreSQL schema mapping users, streaks, trade ledgers, and indexer states.

---

## 🛠️ Environment Setup

You need to define your environment variables in the root `.env` file for the backend.

```env
# Database
DATABASE_URL=postgresql://user:pass@host:5432/simpredict

# Redis
REDIS_URL=rediss://default:pass@host:6379

# Solana
HELIUS_RPC_URL=https://mainnet.helius-rpc.com/?api-key=YOUR_API_KEY
SOLANA_NETWORK=mainnet-beta

# Aggregator APIs
LIMITLESS_API_URL="https://api.limitless.exchange"
MYRIAD_API_URL="https://api.myriad.markets"
POLYMARKET_API_URL="https://gamma-api.polymarket.com"

# Server
PORT=3000
NODE_ENV=development
```

*(Note: The `frontend` directory also has its own `.env` file that points to the backend URL.)*

---

## ⚙️ Running Locally

### 1. Install Dependencies
Install packages for both the backend and frontend:
```bash
# Root (Backend)
npm install

# Frontend
cd frontend
npm install
cd ..
```

### 2. Prepare the Database (Backend)
Push the Prisma Schema to your PostgreSQL instance:
```bash
npx prisma db push
npx prisma generate
```

### 3. Sync Markets (Backend)
Manually trigger the aggregator to populate your database with images and markets:
```bash
npx ts-node -e "import { MarketsService } from './src/modules/markets/markets.service'; async function run() { console.log('Syncing...'); const svc = new MarketsService(); await svc.syncMarketsFromAggregator(); process.exit(0); }; run();"
```

### 4. Start the Application
Run both the frontend and backend concurrently (in separate terminals):

**Terminal 1 (Backend):**
```bash
npm run start:dev
```
*(Runs on `http://localhost:3000`)*

**Terminal 2 (Frontend React App):**
```bash
cd frontend
npm run dev
```
*(Runs on `http://localhost:5173`)*

---

## 📡 Core API Reference

### Markets & UI
- `GET /markets`: Returns paginated lists of actively aggregated markets, formatted with `image`, `expiry`, and `category`.
- `GET /portfolio/:wallet`: Returns the active PnL and Token Values tracking the provided Solana Wallet.
- `GET /portfolio/:wallet/history`: Returns chronological trades.
- `GET /leaderboard`: Returns top trader wallet addresses sorted by `totalVolume`, `streak`, or `totalPnl`.

### Solana Pay (Trade)
When a user clicks "Trade", the frontend queries the Solana Pay protocol:
- **Phase 1** `GET /trade/pay?marketId=123&wallet=abc&side=YES&amount=10`
  *Returns the required `label` and `icon` for the wallet UI.*
- **Phase 2** `POST /trade/pay?marketId=123&wallet=abc&side=YES&amount=10`
  *The mobile wallet posts the public key; the backend returns a serialized base64 Solana Transaction for the user to sign!*

---
