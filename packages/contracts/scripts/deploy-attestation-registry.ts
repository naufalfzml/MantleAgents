// deploy-attestation-registry.ts
//
// Deploys AgentAttestationRegistry to Mantle Sepolia Testnet. Output address
// should be set as MANTLE_ATTESTATION_REGISTRY_ADDRESS in apps/api/.env.
//
// Usage:
//   pnpm --filter @mantleagents/contracts deploy:attestation-registry

import 'dotenv/config';
import path from 'node:path';
import { config as loadEnv } from 'dotenv';
import { createPublicClient, createWalletClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { MANTLE_TESTNET_CHAIN, mantleExplorerAddressUrl } from '../../../apps/api/src/lib/chains.js';
import { compileContract } from './compile.js';

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

async function main() {
  console.log(`Deployer: ${account.address}`);
  console.log(`RPC:      ${RPC_URL} (chainId ${MANTLE_TESTNET_CHAIN.id})`);

  const { abi, bytecode } = compileContract('AgentAttestationRegistry.sol', 'AgentAttestationRegistry');

  console.log('\nDeploying AgentAttestationRegistry...');
  const hash = await walletClient.deployContract({ abi, bytecode, args: [] });
  console.log(`  tx: ${hash}`);

  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (!receipt.contractAddress) {
    throw new Error('No contractAddress in receipt');
  }

  console.log(`  deployed at: ${receipt.contractAddress}`);
  console.log(`  explorer: ${mantleExplorerAddressUrl(receipt.contractAddress)}`);
  console.log(`\nSet in apps/api/.env:\nMANTLE_ATTESTATION_REGISTRY_ADDRESS=${receipt.contractAddress}`);

  // Also write the ABI for the API to import
  const fs = await import('node:fs');
  const outDir = path.resolve(import.meta.dirname, '../../../apps/api/src/abis');
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(
    path.join(outDir, 'attestation-registry.json'),
    JSON.stringify(abi, null, 2),
  );
  console.log(`\nABI written to apps/api/src/abis/attestation-registry.json`);
}

main().catch((err) => {
  console.error('Deploy failed:', err);
  process.exit(1);
});
