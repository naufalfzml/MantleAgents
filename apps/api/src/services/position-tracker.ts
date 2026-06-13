import { createSupabaseAdmin, type Database } from '@mantleagents/db';
import { getTokenAddress } from '@mantleagents/shared';

type PositionRow = Database['public']['Tables']['agent_positions']['Row'];

const supabaseAdmin = createSupabaseAdmin(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

/**
 * Get current positions for a wallet from the DB.
 * Throws on database error to prevent cascading incorrect calculations.
 */
export async function getPositions(walletAddress: string): Promise<PositionRow[]> {
  const { data, error } = await supabaseAdmin
    .from('agent_positions')
    .select('*')
    .eq('wallet_address', walletAddress)
    .gt('balance', 0);

  if (error) {
    console.error('Failed to fetch positions:', error);
    throw new Error(`Failed to fetch positions: ${error.message}`);
  }

  return (data ?? []) as PositionRow[];
}

/**
 * Calculate the total portfolio value in USD.
 * NOTE: Balances in agent_positions are stored in human-readable units (not raw wei).
 * The trade executor's rate already accounts for token decimals.
 */
export async function calculatePortfolioValue(
  positions: PositionRow[],
): Promise<number> {
  let total = 0;
  for (const pos of positions) {
    const { data: snapshot } = await supabaseAdmin
      .from('token_price_snapshots')
      .select('price_usd')
      .eq('token_symbol', pos.token_symbol)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const priceUsd = (snapshot as { price_usd: number } | null)?.price_usd ?? 1;
    total += (pos.balance ?? 0) * priceUsd;
  }
  return total;
}

/**
 * Update positions after a trade.
 * Throws on database error to ensure position consistency.
 */
export async function updatePositionAfterTrade(params: {
  walletAddress: string;
  currency: string;
  direction: 'buy' | 'sell';
  amountUsd: number;
  rate: number;
}): Promise<void> {
  const { walletAddress, currency, direction, amountUsd, rate } = params;
  const tokenAddress = getTokenAddress(currency) || '';

  const { data: existing } = await supabaseAdmin
    .from('agent_positions')
    .select('*')
    .eq('wallet_address', walletAddress)
    .eq('token_symbol', currency)
    .maybeSingle();

  const existingPos = existing as PositionRow | null;
  const currentBalance = existingPos?.balance ?? 0;
  const currentAvgRate = existingPos?.avg_entry_rate ?? 0;

  let newBalance: number;
  let newAvgRate: number;

  if (direction === 'buy') {
    const tokensAcquired = amountUsd * rate;
    newBalance = currentBalance + tokensAcquired;
    if (currentBalance > 0 && newBalance > 0) {
      // Weighted average: (old_cost + new_cost) / total_tokens
      newAvgRate = ((currentBalance * currentAvgRate) + amountUsd) / newBalance;
    } else {
      newAvgRate = amountUsd / tokensAcquired;
    }
  } else {
    const tokensReduced = amountUsd * rate;
    newBalance = Math.max(0, currentBalance - tokensReduced);
    newAvgRate = currentAvgRate;
  }

  // Clean up dust positions
  if (newBalance < 1e-6) {
    newBalance = 0;
  }

  const { error } = await supabaseAdmin
    .from('agent_positions')
    .upsert({
      wallet_address: walletAddress,
      token_symbol: currency,
      token_address: tokenAddress,
      balance: newBalance,
      avg_entry_rate: newAvgRate,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'wallet_address,token_symbol' });

  if (error) {
    console.error('Failed to update position:', error);
    throw new Error(`Failed to update position for ${currency}: ${error.message}`);
  }
}
