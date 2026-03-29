import { z } from 'zod';

const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  HELIUS_RPC_URL: z.string().url(),
  SOLANA_NETWORK: z.enum(['mainnet-beta', 'devnet', 'testnet']).default('mainnet-beta'),
  LIMITLESS_API_URL: z.string().url(),
  LIMITLESS_API_KEY: z.string().optional(),
  POLYMARKET_API_URL: z.string().url(),
  MANIFOLD_API_URL: z.string().url().default('https://api.manifold.markets/v0'),
  HEDGEHOG_API_URL: z.string().url().default('https://api.hedgehog.markets/v1'),
  KALSHI_API_URL: z.string().url().default('https://api.elections.kalshi.com/trade-api/v2'),
  SXBET_API_URL: z.string().url().default('https://api.sx.bet/markets/active'),
  PORT: z.coerce.number().default(3000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  LOG_LEVEL: z.string().default('info'),
  TREASURY_WALLET: z.string().optional(),

  // Auth
  JWT_SECRET: z.string().default('dev-secret-change-in-production'),
  JWT_EXPIRY: z.string().default('24h'),

  // Cloudflare R2
  R2_ENDPOINT: z.string().optional(),
  R2_ACCESS_KEY_ID: z.string().optional(),
  R2_SECRET_ACCESS_KEY: z.string().optional(),
  R2_BUCKET_NAME: z.string().default('simpredicts-cards'),

  // App
  APP_URL: z.string().default('https://zeevano.com'),
  CORS_ALLOWED_ORIGINS: z.string().optional(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment variables:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const config = parsed.data;
export type Config = z.infer<typeof envSchema>;
