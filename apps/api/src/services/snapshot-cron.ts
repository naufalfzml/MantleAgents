import { createSupabaseAdmin } from '@mantleagents/db';
import { ALL_TOKEN_ADDRESSES } from '@mantleagents/shared';
import type { Chain } from '@mantleagents/mantle-data';
import { fetchAllPrices } from './price-service.js';

const SNAPSHOT_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes

const supabaseAdmin = createSupabaseAdmin(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

async function snapshotPrices(): Promise<void> {
  const defaultChain: Chain = (process.env.MARKETDATA_DEFAULT_CHAIN as Chain) ?? 'bsc';
  const tokenList = Object.entries(ALL_TOKEN_ADDRESSES).map(
    ([symbol, address]) => ({ symbol, address, chain: defaultChain }),
  );

  try {
    const prices = await fetchAllPrices(tokenList);

    if (prices.size === 0) {
      console.warn('[snapshot-cron] No prices fetched, skipping snapshot');
      return;
    }

    const now = new Date().toISOString();
    const rows = [...prices.entries()].map(([symbol, price]) => ({
      token_symbol: symbol,
      price_usd: price,
      snapshot_at: now,
    }));

    const { error } = await supabaseAdmin
      .from('token_price_snapshots')
      .insert(rows);

    if (error) {
      console.error('[snapshot-cron] Failed to insert snapshots:', error);
    } else {
      console.log(`[snapshot-cron] Saved ${rows.length} price snapshots`);
    }
  } catch (err) {
    console.warn('[snapshot-cron] Price snapshot failed:', err);
  }
}

export function startPriceSnapshotCron(): void {
  console.log('Starting price snapshot cron (every 15 min)');
  snapshotPrices();
  setInterval(snapshotPrices, SNAPSHOT_INTERVAL_MS);
}
