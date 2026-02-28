# SimPredict Backend

A production-ready, non-custodial prediction marketplace backend powered by Solana and DFlow Prediction Markets API.

## Architecture Overview

```
simpredict-backend/
├── src/
│   ├── core/
│   │   ├── config/          # App config, Prisma client, Redis client, error handler
│   │   └── logger/          # Winston logger
│   ├── modules/
│   │   ├── markets/         # Market fetch, cache, REST endpoints
│   │   ├── portfolio/       # User positions, trade history, wallet sync
│   │   ├── trades/          # Trade quote via DFlow, trade recording
│   │   ├── leaderboard/     # PnL ranking engine
│   │   ├── dflow/           # DFlow Metadata + Trade API client
│   │   └── solana/          # Solana RPC service + WebSocket listener
│   ├── jobs/
│   │   ├── market-sync.job.ts      # Syncs markets every 60s (BullMQ)
│   │   └── portfolio-sync.job.ts   # Syncs positions every 30s (BullMQ)
│   └── main.ts
├── prisma/
│   └── schema.prisma
├── Dockerfile
├── docker-compose.yml
└── .env.example
```

## Prerequisites

- Node.js 20+
- PostgreSQL 14+
- Redis 7+
- A [Helius](https://helius.dev) account for Solana RPC access
- DFlow API credentials

## Environment Setup

```bash
cp .env.example .env
```

Edit `.env` with your values:

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `REDIS_URL` | Redis connection string |
| `HELIUS_RPC_URL` | Helius RPC URL with API key |
| `SOLANA_NETWORK` | `mainnet-beta`, `devnet`, or `testnet` |
| `DFLOW_METADATA_API` | DFlow markets metadata API base URL |
| `DFLOW_TRADE_API` | DFlow trade execution API base URL |
| `PORT` | Server port (default: 3000) |

### Helius RPC Setup

1. Sign up at [helius.dev](https://helius.dev)
2. Create a new project and copy your API key
3. Set `HELIUS_RPC_URL=https://mainnet.helius-rpc.com/?api-key=YOUR_KEY`

### DFlow Integration

1. Obtain your DFlow API credentials from [dflow.net](https://dflow.net)
2. Set `DFLOW_METADATA_API` and `DFLOW_TRADE_API` in your `.env`
3. The backend will auto-sync markets every 60 seconds

## Running Locally

### 1. Install dependencies

```bash
npm install
```

### 2. Generate Prisma client

```bash
npm run prisma:generate
```

### 3. Apply database schema

```bash
# Push schema directly (development)
npm run prisma:push

# Or run migrations (production)
npm run prisma:migrate
```

### 4. Start development server

```bash
npm run start:dev
```

The server starts on `http://localhost:3000`.

Health check: `GET http://localhost:3000/health`

## Running in Production (Docker)

### 1. Build and start all services

```bash
docker-compose up -d --build
```

This starts:
- `postgres` — PostgreSQL 16 on port 5432
- `redis` — Redis 7 on port 6379
- `migrate` — Runs Prisma migrations automatically
- `backend` — SimPredict API on port 3000

### 2. View logs

```bash
docker-compose logs -f backend
```

### 3. Stop services

```bash
docker-compose down
```

### 4. Stop and remove volumes (full reset)

```bash
docker-compose down -v
```

## API Reference

### Markets

#### `GET /markets`
Returns paginated list of all prediction markets.

Query params: `status`, `category`, `search`, `page`, `limit`

```json
{
  "data": [...],
  "pagination": { "page": 1, "limit": 20, "total": 100, "totalPages": 5 }
}
```

#### `GET /markets/:id`
Returns a single market by internal ID.

---

### Portfolio

#### `GET /portfolio/:wallet`
Returns all active positions for a wallet.

```json
{
  "data": {
    "walletAddress": "...",
    "totalPositions": 3,
    "totalValue": 150.5,
    "totalRealizedPnl": 12.4,
    "positions": [...]
  }
}
```

#### `GET /portfolio/:wallet/history`
Returns paginated trade history for a wallet.

Query params: `page`, `limit`, `marketId`

---

### Leaderboard

#### `GET /leaderboard`
Returns ranked users by PnL, volume, or win rate.

Query params: `page`, `limit`, `sortBy` (`totalPnl` | `totalVolume` | `winRate` | `tradeCount`)

---

### Trade

#### `POST /trade/quote`
Fetches a serialized trade transaction from DFlow. The user signs and submits this transaction client-side — **no funds are custodied by this backend**.

Request body:
```json
{
  "wallet": "<solana-wallet-address>",
  "marketId": "<internal-market-id>",
  "side": "YES",
  "amount": 10
}
```

Response:
```json
{
  "data": {
    "marketId": "...",
    "marketTitle": "...",
    "side": "YES",
    "tokenMint": "...",
    "amount": 10,
    "serializedTransaction": "<base64>",
    "expectedPrice": 0.65,
    "priceImpact": 0.002,
    "fee": 0.001,
    "expiresAt": 1700000000
  }
}
```

## Background Jobs

| Job | Interval | Description |
|---|---|---|
| `MarketSyncJob` | 60 seconds | Fetches and upserts markets from DFlow |
| `PortfolioSyncJob` | 30 seconds | Syncs token balances for tracked wallets |
| `LeaderboardUpdate` | 5 minutes | Recalculates PnL and rankings |

Jobs use BullMQ with Redis as the queue backend. They are fault-tolerant with retry logic.

## Solana Integration

- **RPC**: Connects to Helius with confirmed commitment and automatic retry
- **WebSocket listener**: Subscribes to SPL Token program account changes for active market token mints
- **Token balances**: Fetched via `getParsedTokenAccountsByOwner`
- **Transaction indexing**: Parses SPL token transfers and links them to known markets
- **Deduplication**: Trades are indexed by transaction signature — no duplicates

## Security Notes

- No private keys are stored or used
- All trades are signed by the user's wallet client-side
- Token mint addresses are validated as valid Solana public keys
- Rate limiting: 100 req/min per IP
- Helmet.js for HTTP security headers
- All inputs validated before processing

## Database Indexes

The schema includes indexes on:
- `markets(status)`, `markets(category)`, `markets(yesTokenMint)`, `markets(noTokenMint)`
- `positions(walletAddress)`, `positions(marketId)`
- `trades(walletAddress)`, `trades(marketId)`, `trades(signature)`, `trades(timestamp)`
- `leaderboard(totalPnl)`, `leaderboard(totalVolume)`

## Prisma Commands

```bash
# Generate client after schema changes
npm run prisma:generate

# Apply migrations in production
npm run prisma:migrate

# Open Prisma Studio (DB GUI)
npm run prisma:studio

# Push schema without migrations (dev only)
npm run prisma:push
```
# simpson
