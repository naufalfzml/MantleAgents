import { type Address, erc20Abi } from 'viem';
import { chainClient } from '../lib/chain-client.js';
import { createSupabaseAdmin, type Database } from '@mantleagents/db';
import { STABLE_TOKEN_ADDRESSES, USDC_ADDRESS, USDT_ADDRESS } from '@mantleagents/shared';
import { logTimeline } from './agent-cron.js';
import { executeTrade } from './trade-executor.js';

type AgentConfigRow = Database['public']['Tables']['agent_configs']['Row'];

const supabaseAdmin = createSupabaseAdmin(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

/** Tokens we monitor for incoming deposits. */
const MONITORED_TOKENS: Array<{ symbol: string; address: Address; decimals: number }> = [
  { symbol: 'USDm', address: STABLE_TOKEN_ADDRESSES.USDm as Address, decimals: 18 },
  { symbol: 'USDC', address: USDC_ADDRESS as Address, decimals: 6 },
  { symbol: 'USDT', address: USDT_ADDRESS as Address, decimals: 6 },
];

/** In-memory cache of last known balances per wallet per token. */
const lastKnownBalances = new Map<string, bigint>();

function balanceKey(wallet: string, symbol: string): string {
  return `${wallet.toLowerCase()}:${symbol}`;
}

/**
 * Check all active agent wallets for new deposits.
 * Call this from the agent cron tick.
 */
export async function checkForDeposits(): Promise<void> {
  const { data: configs, error } = await supabaseAdmin
    .from('agent_configs')
    .select('wallet_address, server_wallet_address, server_wallet_id')
    .not('server_wallet_address', 'is', null);

  if (error || !configs) return;

  for (const rawConfig of configs) {
    const config = rawConfig as Pick<AgentConfigRow, 'wallet_address' | 'server_wallet_address' | 'server_wallet_id'>;
    const serverAddress = config.server_wallet_address as Address;
    if (!serverAddress) continue;

    for (const token of MONITORED_TOKENS) {
      try {
        const balance = await chainClient.readContract({
          address: token.address,
          abi: erc20Abi,
          functionName: 'balanceOf',
          args: [serverAddress],
        });

        const key = balanceKey(serverAddress, token.symbol);
        const previous = lastKnownBalances.get(key);

        // Update cache
        lastKnownBalances.set(key, balance);

        // If this is the first check (no previous balance), skip to avoid false positives
        if (previous === undefined) continue;

        // Detect new deposit
        if (balance > previous) {
          const depositAmount = balance - previous;
          const depositFormatted = Number(depositAmount) / 10 ** token.decimals;

          const agentType = (config as any).agent_type ?? 'fx';
          await logTimeline(config.wallet_address, 'funding', {
            summary: `Received ${depositFormatted.toFixed(2)} ${token.symbol}`,
            detail: {
              token: token.symbol,
              amount: depositFormatted,
              rawAmount: depositAmount.toString(),
            },
          }, undefined, agentType);

          // Auto-convert USDC/USDT deposits to USDm via DEX swap
          if (
            (token.symbol === 'USDC' || token.symbol === 'USDT') &&
            config.server_wallet_id
          ) {
            try {
              const result = await executeTrade({
                serverWalletId: config.server_wallet_id,
                serverWalletAddress: serverAddress,
                currency: token.symbol,
                direction: 'sell',
                amountUsd: depositFormatted,
              });

              if (result.success) {
                await logTimeline(config.wallet_address, 'funding', {
                  summary: `Auto-converted ${depositFormatted.toFixed(2)} ${token.symbol} → USDm`,
                  detail: {
                    token: token.symbol,
                    amount: depositFormatted,
                    rawAmount: depositAmount.toString(),
                    txHash: result.txHash,
                    rate: result.rate,
                  },
                  txHash: result.txHash,
                }, undefined, agentType);
              } else {
                await logTimeline(config.wallet_address, 'funding', {
                  summary: `Auto-conversion of ${depositFormatted.toFixed(2)} ${token.symbol} → USDm failed`,
                  detail: {
                    token: token.symbol,
                    amount: depositFormatted,
                    error: result.reason,
                    failureCategory: result.failureCategory,
                  },
                }, undefined, agentType);
              }
            } catch (conversionErr) {
              console.error(
                `Failed to auto-convert ${token.symbol} to USDm for ${serverAddress}:`,
                conversionErr,
              );
              await logTimeline(config.wallet_address, 'funding', {
                summary: `Auto-conversion of ${depositFormatted.toFixed(2)} ${token.symbol} → USDm failed`,
                detail: {
                  token: token.symbol,
                  amount: depositFormatted,
                  error: conversionErr instanceof Error ? conversionErr.message : String(conversionErr),
                },
              }, undefined, agentType);
            }
          }
        }
      } catch (err) {
        // Silently skip individual token balance checks
        console.error(`Failed to check ${token.symbol} balance for ${serverAddress}:`, err);
      }
    }
  }
}
