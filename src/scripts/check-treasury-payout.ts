import 'dotenv/config';
import { Keypair, LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js';
import { config } from '../core/config/config';
import { SolanaService } from '../modules/solana/solana.service';

type CliOptions = {
  send: boolean;
  airdrop: boolean;
  recipient?: string;
  amount: number;
};

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    send: false,
    airdrop: false,
    amount: 0.01,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--send') options.send = true;
    else if (arg === '--airdrop') options.airdrop = true;
    else if (arg === '--recipient') options.recipient = argv[++i];
    else if (arg === '--amount') options.amount = Number(argv[++i]);
  }

  return options;
}

function requireTreasuryKeypair(): Keypair {
  if (!config.TREASURY_PRIVATE_KEY) {
    throw new Error('TREASURY_PRIVATE_KEY is not configured in .env');
  }

  let secret: number[];
  try {
    const parsed = JSON.parse(config.TREASURY_PRIVATE_KEY);
    if (!Array.isArray(parsed) || parsed.some((value) => !Number.isInteger(value) || value < 0 || value > 255)) {
      throw new Error('Invalid byte array');
    }
    secret = parsed;
  } catch {
    throw new Error('TREASURY_PRIVATE_KEY must be a JSON array of bytes');
  }

  return Keypair.fromSecretKey(Uint8Array.from(secret));
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const solana = SolanaService.getInstance();

  console.log(`Network: ${config.SOLANA_NETWORK}`);
  console.log(`RPC: ${config.HELIUS_RPC_URL}`);
  console.log(`Treasury wallet: ${config.TREASURY_WALLET || 'not set'}`);
  console.log(`Payout multiplier: ${config.TREASURY_PAYOUT_MULTIPLIER}`);

  if (!config.TREASURY_PRIVATE_KEY) {
    console.log('Dry-run result: TREASURY_PRIVATE_KEY is missing, so real payout sending cannot be verified yet.');
    process.exit(0);
  }

  const treasuryKeypair = requireTreasuryKeypair();
  const derivedWallet = treasuryKeypair.publicKey.toBase58();
  console.log(`Derived treasury wallet: ${derivedWallet}`);

  if (config.TREASURY_WALLET && derivedWallet !== config.TREASURY_WALLET) {
    throw new Error('TREASURY_PRIVATE_KEY does not match TREASURY_WALLET');
  }

  const connection = solana.getConnection();
  const treasuryBalanceLamports = await connection.getBalance(treasuryKeypair.publicKey, 'confirmed');
  console.log(`Treasury balance: ${treasuryBalanceLamports / LAMPORTS_PER_SOL} SOL`);

  if (options.airdrop) {
    if (config.SOLANA_NETWORK !== 'devnet' && config.SOLANA_NETWORK !== 'testnet') {
      throw new Error('Airdrop is only supported for devnet/testnet checks');
    }

    const signature = await connection.requestAirdrop(
      treasuryKeypair.publicKey,
      Math.round(options.amount * LAMPORTS_PER_SOL)
    );
    await connection.confirmTransaction(signature, 'confirmed');
    console.log(`Airdrop requested successfully: ${signature}`);
  }

  if (!options.send) {
    console.log('Dry-run result: treasury keypair is valid and RPC is reachable.');
    process.exit(0);
  }

  if (!options.recipient) {
    throw new Error('Provide --recipient <wallet> when using --send');
  }

  const recipient = new PublicKey(options.recipient);
  const recipientBalanceBefore = await connection.getBalance(recipient, 'confirmed');
  const treasuryBalanceBefore = await connection.getBalance(treasuryKeypair.publicKey, 'confirmed');
  console.log(`Recipient balance before: ${recipientBalanceBefore / LAMPORTS_PER_SOL} SOL`);
  console.log(`Treasury balance before: ${treasuryBalanceBefore / LAMPORTS_PER_SOL} SOL`);

  const signature = await solana.sendTreasuryPayout(options.recipient, options.amount);
  const recipientBalanceAfter = await connection.getBalance(recipient, 'confirmed');
  const treasuryBalanceAfter = await connection.getBalance(treasuryKeypair.publicKey, 'confirmed');
  console.log(`Recipient balance after: ${recipientBalanceAfter / LAMPORTS_PER_SOL} SOL`);
  console.log(`Treasury balance after: ${treasuryBalanceAfter / LAMPORTS_PER_SOL} SOL`);
  console.log(`Payout sent successfully: ${signature}`);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Treasury payout check failed: ${message}`);
  process.exit(1);
});
