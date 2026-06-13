import {
  MantleDataClient,
  type Chain,
  type ContractRisk,
  checkContractRisk,
} from '@mantleagents/mantle-data';
import { createSupabaseAdmin } from '@mantleagents/db';
import { getTokenPrice } from './price-service.js';
import { agentEvents } from './agent-events.js';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const POLL_INTERVAL_MS = 30_000; // 30 seconds

let _aveClient: MantleDataClient | undefined;

function getMantleDataClient(): MantleDataClient {
  if (!_aveClient) {
    _aveClient = new MantleDataClient();
  }
  return _aveClient;
}

// Cast to any — token_watchlist and price_alerts are not in generated DB types yet.
// Once Supabase types are regenerated after migration, remove the cast.
const supabaseAdmin: any = createSupabaseAdmin(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WatchlistItem {
  id: string;
  wallet_address: string;
  chain: string;
  token_address: string;
  token_symbol: string;
  risk_score: ContractRisk | null;
  added_at: string;
  current_price?: number;
}

export interface PriceAlert {
  id: string;
  wallet_address: string;
  chain: string;
  token_address: string;
  token_symbol: string;
  condition: 'above' | 'below';
  threshold: number;
  triggered: boolean;
  triggered_at: string | null;
  triggered_price: number | null;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Watchlist CRUD
// ---------------------------------------------------------------------------

export async function getWatchlist(
  walletAddress: string,
): Promise<WatchlistItem[]> {
  const { data, error } = await supabaseAdmin
    .from('token_watchlist')
    .select('*')
    .eq('wallet_address', walletAddress)
    .order('added_at', { ascending: false });

  if (error) throw new Error(`Failed to get watchlist: ${error.message}`);
  return (data ?? []) as WatchlistItem[];
}

export async function addToWatchlist(params: {
  walletAddress: string;
  chain: Chain;
  tokenAddress: string;
  tokenSymbol: string;
}): Promise<WatchlistItem> {
  const { walletAddress, chain, tokenAddress, tokenSymbol } = params;

  // Run the contract risk check (transaction simulation / GoPlus) in background.
  let riskScore: ContractRisk | null = null;
  try {
    const client = getMantleDataClient();
    riskScore = await checkContractRisk(client, chain, tokenAddress);
    console.log(
      `[monitor] Risk check for ${tokenSymbol} on ${chain}: ${riskScore?.risk_level ?? 'unknown'}`,
    );
  } catch (err) {
    console.warn(`[monitor] Risk check failed for ${tokenSymbol}:`, err);
  }

  const { data, error } = await supabaseAdmin
    .from('token_watchlist')
    .upsert(
      {
        wallet_address: walletAddress,
        chain,
        token_address: tokenAddress,
        token_symbol: tokenSymbol,
        risk_score: riskScore as any,
      },
      { onConflict: 'wallet_address,chain,token_address' },
    )
    .select()
    .single();

  if (error) throw new Error(`Failed to add to watchlist: ${error.message}`);
  return data as WatchlistItem;
}

export async function removeFromWatchlist(
  walletAddress: string,
  id: string,
): Promise<void> {
  const { error } = await supabaseAdmin
    .from('token_watchlist')
    .delete()
    .eq('id', id)
    .eq('wallet_address', walletAddress);

  if (error) throw new Error(`Failed to remove from watchlist: ${error.message}`);
}

// ---------------------------------------------------------------------------
// Alert CRUD
// ---------------------------------------------------------------------------

export async function getAlerts(
  walletAddress: string,
): Promise<PriceAlert[]> {
  const { data, error } = await supabaseAdmin
    .from('price_alerts')
    .select('*')
    .eq('wallet_address', walletAddress)
    .order('created_at', { ascending: false });

  if (error) throw new Error(`Failed to get alerts: ${error.message}`);
  return (data ?? []) as PriceAlert[];
}

export async function createAlert(params: {
  walletAddress: string;
  chain: Chain;
  tokenAddress: string;
  tokenSymbol: string;
  condition: 'above' | 'below';
  threshold: number;
}): Promise<PriceAlert> {
  const { data, error } = await supabaseAdmin
    .from('price_alerts')
    .insert({
      wallet_address: params.walletAddress,
      chain: params.chain,
      token_address: params.tokenAddress,
      token_symbol: params.tokenSymbol,
      condition: params.condition,
      threshold: params.threshold,
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to create alert: ${error.message}`);
  return data as PriceAlert;
}

export async function deleteAlert(
  walletAddress: string,
  id: string,
): Promise<void> {
  const { error } = await supabaseAdmin
    .from('price_alerts')
    .delete()
    .eq('id', id)
    .eq('wallet_address', walletAddress);

  if (error) throw new Error(`Failed to delete alert: ${error.message}`);
}

// ---------------------------------------------------------------------------
// Price polling + alert checking
// ---------------------------------------------------------------------------

async function pollPricesAndCheckAlerts(): Promise<void> {
  // 1. Get all unique tokens across all watchlists
  const { data: watchlistTokens, error: wlError } = await supabaseAdmin
    .from('token_watchlist')
    .select('chain, token_address, token_symbol')
    .limit(500);

  if (wlError || !watchlistTokens || watchlistTokens.length === 0) return;

  // Deduplicate by chain+address
  const uniqueTokens = new Map<
    string,
    { chain: Chain; address: string; symbol: string }
  >();
  for (const t of watchlistTokens) {
    const key = `${t.token_address}-${t.chain}`;
    if (!uniqueTokens.has(key)) {
      uniqueTokens.set(key, {
        chain: t.chain as Chain,
        address: t.token_address,
        symbol: t.token_symbol,
      });
    }
  }

  // 2. Fetch prices
  const prices = new Map<string, number>();
  const pricePromises = [...uniqueTokens.entries()].map(
    async ([key, token]) => {
      try {
        const price = await getTokenPrice(token.chain, token.address);
        prices.set(key, price);
      } catch {
        // Skip failed price fetches
      }
    },
  );
  await Promise.allSettled(pricePromises);

  if (prices.size === 0) return;

  // 3. Check active alerts
  const { data: activeAlerts, error: alertError } = await supabaseAdmin
    .from('price_alerts')
    .select('*')
    .eq('triggered', false);

  if (alertError || !activeAlerts) return;

  for (const alert of activeAlerts as PriceAlert[]) {
    const key = `${alert.token_address}-${alert.chain}`;
    const currentPrice = prices.get(key);
    if (currentPrice === undefined) continue;

    const threshold = Number(alert.threshold);
    const triggered =
      (alert.condition === 'above' && currentPrice >= threshold) ||
      (alert.condition === 'below' && currentPrice <= threshold);

    if (triggered) {
      console.log(
        `[monitor] Alert triggered: ${alert.token_symbol} ${alert.condition} ${threshold} (current: ${currentPrice})`,
      );

      // Update alert as triggered
      await supabaseAdmin
        .from('price_alerts')
        .update({
          triggered: true,
          triggered_at: new Date().toISOString(),
          triggered_price: currentPrice,
        })
        .eq('id', alert.id);

      // Emit event for real-time WebSocket broadcast
      agentEvents.emit(`monitor:${alert.wallet_address}`, {
        type: 'alert_triggered',
        alert: {
          id: alert.id,
          tokenSymbol: alert.token_symbol,
          chain: alert.chain,
          condition: alert.condition,
          threshold,
          currentPrice,
        },
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Cron start
// ---------------------------------------------------------------------------

let pollInterval: ReturnType<typeof setInterval> | null = null;

export function startMonitorCron(): void {
  if (pollInterval) return;

  console.log(`[monitor] Starting price monitor cron (every ${POLL_INTERVAL_MS / 1000}s)`);

  // Initial poll
  pollPricesAndCheckAlerts().catch((err) =>
    console.warn('[monitor] Initial poll failed:', err),
  );

  pollInterval = setInterval(() => {
    pollPricesAndCheckAlerts().catch((err) =>
      console.warn('[monitor] Poll failed:', err),
    );
  }, POLL_INTERVAL_MS);
}

export function stopMonitorCron(): void {
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }
}
