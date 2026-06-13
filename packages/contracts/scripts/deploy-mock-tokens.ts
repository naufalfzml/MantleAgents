// deploy-mock-tokens.ts
//
// Deploys mock USDC, USDT, and WMNT ERC20 tokens to Mantle Sepolia Testnet
// for use by MantleAgents agent wallets. Each token has a public faucet()
// for self-funding test balances.
//
// Usage:
//   pnpm --filter @mantleagents/contracts deploy:tokens
//
// Required env (reads from apps/api/.env so addresses can be copy-pasted
// straight into that file):
//   EVM_SIGNER_PRIVATE_KEY  — deployer key (must hold MNT for gas on testnet)
//   MANTLE_RPC_URL       — defaults to https://rpc.sepolia.mantle.xyz

import 'dotenv/config';
import path from 'node:path';
import { config as loadEnv } from 'dotenv';
import {
  createPublicClient,
  createWalletClient,
  http,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { MANTLE_TESTNET_CHAIN, mantleExplorerAddressUrl } from '../../../apps/api/src/lib/chains.js';
import { compileContract } from './compile.js';

// Load apps/api/.env in addition to any local env
loadEnv({ path: path.resolve(import.meta.dirname, '../../../apps/api/.env') });

const RPC_URL = process.env.MANTLE_RPC_URL || MANTLE_TESTNET_CHAIN.rpcUrls.default.http[0];
const PK = process.env.EVM_SIGNER_PRIVATE_KEY as `0x${string}` | undefined;

if (!PK) {
  throw new Error('EVM_SIGNER_PRIVATE_KEY is required (deployer wallet, needs MNT testnet gas)');
}

const account = privateKeyToAccount(PK);
const transport = http(RPC_URL);

const publicClient = createPublicClient({ chain: MANTLE_TESTNET_CHAIN, transport });
const walletClient = createWalletClient({ account, chain: MANTLE_TESTNET_CHAIN, transport });

interface TokenSpec {
  envVar: string;
  name: string;
  symbol: string;
  decimals: number;
  initialSupply: bigint; // minted to deployer
  faucetAmount: bigint;  // per-claim amount
}

const TOKENS: TokenSpec[] = [
  {
    envVar: 'MANTLE_USDC_ADDRESS',
    name: 'MantleAgents Mock USDC',
    symbol: 'mUSDC',
    decimals: 6,
    initialSupply: 1_000_000n * 10n ** 6n, // 1,000,000 mUSDC
    faucetAmount: 1_000n * 10n ** 6n, // 1,000 mUSDC per claim
  },
  {
    envVar: 'MANTLE_USDT_ADDRESS',
    name: 'MantleAgents Mock USDT',
    symbol: 'mUSDT',
    decimals: 6,
    initialSupply: 1_000_000n * 10n ** 6n,
    faucetAmount: 1_000n * 10n ** 6n,
  },
  {
    envVar: 'MANTLE_WMNT_ADDRESS',
    name: 'MantleAgents Mock Wrapped MNT',
    symbol: 'mWMNT',
    decimals: 18,
    initialSupply: 1_000_000n * 10n ** 18n,
    faucetAmount: 100n * 10n ** 18n, // 100 mWMNT per claim
  },
];

async function main() {
  console.log(`Deployer: ${account.address}`);
  console.log(`RPC:      ${RPC_URL} (chainId ${MANTLE_TESTNET_CHAIN.id})`);

  const balance = await publicClient.getBalance({ address: account.address });
  console.log(`Balance:  ${balance} wei MNT`);
  if (balance === 0n) {
    console.warn(
      '⚠️  Deployer balance is 0. Fund this address with Mantle Sepolia testnet MNT ' +
        'from a faucet before continuing.',
    );
  }

  const { abi, bytecode } = compileContract('MockERC20.sol', 'MockERC20');

  const results: Record<string, string> = {};

  for (const token of TOKENS) {
    console.log(`\nDeploying ${token.symbol} (${token.name})...`);

    const hash = await walletClient.deployContract({
      abi,
      bytecode,
      args: [token.name, token.symbol, token.decimals, token.initialSupply, token.faucetAmount],
    });

    console.log(`  tx: ${hash}`);
    const receipt = await publicClient.waitForTransactionReceipt({ hash });

    if (!receipt.contractAddress) {
      throw new Error(`No contractAddress in receipt for ${token.symbol}`);
    }

    console.log(`  deployed at: ${receipt.contractAddress}`);
    console.log(`  explorer: ${mantleExplorerAddressUrl(receipt.contractAddress)}`);
    results[token.envVar] = receipt.contractAddress;
  }

  console.log('\n--- Add these to apps/api/.env (and .env.example placeholders) ---\n');
  for (const [envVar, address] of Object.entries(results)) {
    console.log(`${envVar}=${address}`);
  }
}

main().catch((err) => {
  console.error('Deploy failed:', err);
  process.exit(1);
});
