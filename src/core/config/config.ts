import { z } from 'zod';

const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  HELIUS_RPC_URL: z.string().url(),
  SOLANA_NETWORK: z.enum(['mainnet-beta', 'devnet', 'testnet']).default('mainnet-beta'),
  LIMITLESS_API_URL: z.string().url(),
  MYRIAD_API_URL: z.string().url(),
  POLYMARKET_API_URL: z.string().url(),
  PORT: z.coerce.number().default(3000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  LOG_LEVEL: z.string().default('info'),
  TREASURY_WALLET: z.string().optional(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment variables:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const config = parsed.data;
export type Config = z.infer<typeof envSchema>;
