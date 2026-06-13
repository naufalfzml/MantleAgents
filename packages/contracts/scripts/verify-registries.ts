// verify-registries.ts — sanity check that the configured ERC-8004 registry
// addresses actually have contract code on the configured Mantle chain.
//
// Usage: pnpm --filter @mantleagents/contracts verify:registries

import 'dotenv/config';
import path from 'node:path';
import { config as loadEnv } from 'dotenv';
import { createPublicClient, http } from 'viem';
import { MANTLE_TESTNET_CHAIN, mantleExplorerAddressUrl } from '../../../apps/api/src/lib/chains.js';

loadEnv({ path: path.resolve(import.meta.dirname, '../../../apps/api/.env') });

const RPC_URL = process.env.MANTLE_RPC_URL || MANTLE_TESTNET_CHAIN.rpcUrls.default.http[0];
const publicClient = createPublicClient({ chain: MANTLE_TESTNET_CHAIN, transport: http(RPC_URL) });

const targets: Array<{ label: string; envVar: string }> = [
  { label: 'IdentityRegistry', envVar: 'MANTLE_IDENTITY_REGISTRY_ADDRESS' },
  { label: 'ReputationRegistry', envVar: 'MANTLE_REPUTATION_REGISTRY_ADDRESS' },
  { label: 'AttestationRegistry (ours)', envVar: 'MANTLE_ATTESTATION_REGISTRY_ADDRESS' },
  { label: 'mUSDC', envVar: 'MANTLE_USDC_ADDRESS' },
  { label: 'mUSDT', envVar: 'MANTLE_USDT_ADDRESS' },
  { label: 'mWMNT', envVar: 'MANTLE_WMNT_ADDRESS' },
];

async function main() {
  console.log(`RPC: ${RPC_URL} (chainId ${MANTLE_TESTNET_CHAIN.id})\n`);

  for (const t of targets) {
    const address = process.env[t.envVar];
    if (!address) {
      console.log(`${t.label.padEnd(28)} ${t.envVar} not set`);
      continue;
    }
    const code = await publicClient.getCode({ address: address as `0x${string}` });
    const hasCode = Boolean(code && code !== '0x');
    console.log(
      `${t.label.padEnd(28)} ${address}  ${hasCode ? '✅ contract found' : '❌ NO CODE (empty/EOA)'}`,
    );
    console.log(`${' '.repeat(28)} ${mantleExplorerAddressUrl(address)}`);
  }
}

main().catch((err) => {
  console.error('Verify failed:', err);
  process.exit(1);
});
