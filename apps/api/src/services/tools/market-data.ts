/**
 * AVE Data tool for crypto market data. Used by the Conversation Intelligence Agent.
 * Replaces the CoinGecko tool with AVE Data REST API.
 */

import {
  MantleDataClient,
  type Chain,
  type TokenSearchResult,
  type TokenDetail,
  searchToken,
  getTokenDetail,
  checkContractRisk,
  type ContractRisk,
} from '@mantleagents/mantle-data';

let _client: MantleDataClient | undefined;

function getClient(): MantleDataClient {
  if (!_client) {
    _client = new MantleDataClient();
  }
  return _client;
}

// ---------------------------------------------------------------------------
// Cache
// ---------------------------------------------------------------------------

const marketDataCache = new Map<
  string,
  { data: TokenMarketData[]; expiresAt: number }
>();
const CACHE_TTL_MS = 2 * 60 * 1000; // 2 minutes

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TokenMarketData {
  address: string;
  chain: Chain;
  symbol: string;
  name: string;
  current_price: number;
  price_change_24h: number;
  market_cap: number;
  volume_24h: number;
  holder_count: number;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Get market data for tokens by address+chain identifiers.
 * ids format: "address-chain" (e.g. "0xabc...-bsc")
 */
export async function getAveMarketData(
  ids: string[],
): Promise<TokenMarketData[]> {
  const cacheKey = [...ids].sort().join(',');
  const cached = marketDataCache.get(cacheKey);
  if (cached && Date.now() < cached.expiresAt) return cached.data;

  const client = getClient();
  const results: TokenMarketData[] = [];

  const settled = await Promise.allSettled(
    ids.slice(0, 10).map(async (id) => {
      const lastDash = id.lastIndexOf('-');
      if (lastDash === -1) return null;
      const address = id.substring(0, lastDash);
      const chain = id.substring(lastDash + 1) as Chain;
      const detail = await getTokenDetail(client, chain, address);
      return mapDetail(detail);
    }),
  );

  for (const r of settled) {
    if (r.status === 'fulfilled' && r.value) {
      results.push(r.value);
    }
  }

  marketDataCache.set(cacheKey, {
    data: results,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });
  return results;
}

/**
 * Search tokens by keyword (name, symbol, or address).
 */
export async function searchAveTokens(
  query: string,
  chain?: Chain,
): Promise<Array<{ address: string; chain: string; symbol: string; name: string }>> {
  const client = getClient();
  const results = await searchToken(client, {
    keyword: query,
    chain,
    limit: 10,
  });

  return (results ?? []).map((t: TokenSearchResult) => ({
    address: t.token_address,
    chain: t.chain,
    symbol: t.symbol,
    name: t.name,
  }));
}

/**
 * Check token contract risk (honeypot, taxes, etc.).
 */
export async function checkAveContractRisk(
  chain: Chain,
  address: string,
): Promise<ContractRisk | null> {
  const client = getClient();
  try {
    return await checkContractRisk(client, chain, address);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mapDetail(detail: TokenDetail | null): TokenMarketData | null {
  if (!detail) return null;
  return {
    address: detail.token_address,
    chain: detail.chain,
    symbol: detail.symbol,
    name: detail.name,
    current_price: detail.price,
    price_change_24h: detail.price_change_24h,
    market_cap: detail.market_cap,
    volume_24h: detail.tx_volume_u_24h,
    holder_count: detail.holder_count,
  };
}
