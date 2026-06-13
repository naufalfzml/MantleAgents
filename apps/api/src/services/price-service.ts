import {
  MantleDataClient,
  type Chain,
  type TokenDetail,
  getTokenDetail,
  batchTokenPrices,
} from '@mantleagents/mantle-data';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const PRICE_CACHE_TTL_MS = 60_000; // 1 minute

let _aveClient: MantleDataClient | undefined;

function getMantleDataClient(): MantleDataClient {
  if (!_aveClient) {
    _aveClient = new MantleDataClient();
  }
  return _aveClient;
}

// ---------------------------------------------------------------------------
// In-memory cache
// ---------------------------------------------------------------------------

interface CachedPrice {
  price: number;
  detail?: TokenDetail;
  fetchedAt: number;
}

const priceCache = new Map<string, CachedPrice>();

function cacheKey(chain: Chain, address: string): string {
  return `${address.toLowerCase()}-${chain}`;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Get current price for a single token via AVE Data REST.
 * Returns USD price. Results are cached for 1 minute.
 */
export async function getTokenPrice(
  chain: Chain,
  address: string,
): Promise<number> {
  const key = cacheKey(chain, address);
  const cached = priceCache.get(key);
  if (cached && Date.now() - cached.fetchedAt < PRICE_CACHE_TTL_MS) {
    return cached.price;
  }

  const client = getMantleDataClient();
  const detail = await getTokenDetail(client, chain, address);
  const price = detail?.price ?? 0;

  priceCache.set(key, { price, detail, fetchedAt: Date.now() });
  return price;
}

/**
 * Get full token detail (price, market cap, volume, holder count, etc.)
 */
export async function getTokenPriceDetail(
  chain: Chain,
  address: string,
): Promise<TokenDetail | null> {
  const key = cacheKey(chain, address);
  const cached = priceCache.get(key);
  if (
    cached?.detail &&
    Date.now() - cached.fetchedAt < PRICE_CACHE_TTL_MS
  ) {
    return cached.detail;
  }

  const client = getMantleDataClient();
  try {
    const detail = await getTokenDetail(client, chain, address);
    priceCache.set(key, {
      price: detail?.price ?? 0,
      detail,
      fetchedAt: Date.now(),
    });
    return detail;
  } catch (err) {
    console.warn(`[price-service] Failed to fetch detail for ${address} on ${chain}:`, err);
    return cached?.detail ?? null;
  }
}

/**
 * Batch fetch prices for multiple tokens.
 * tokenIds format: "address-chain" (e.g. "0xabc...-bsc")
 */
export async function fetchBatchPrices(
  tokenIds: string[],
): Promise<Map<string, number>> {
  const client = getMantleDataClient();
  const prices = new Map<string, number>();

  if (tokenIds.length === 0) return prices;

  try {
    const result = await batchTokenPrices(client, { token_ids: tokenIds });

    for (const [id, detail] of Object.entries(result)) {
      const price = (detail as any)?.price ?? 0;
      prices.set(id, price);

      // Also populate the single-token cache
      const parts = id.split('-');
      if (parts.length >= 2) {
        const chain = parts[parts.length - 1] as Chain;
        const address = parts.slice(0, -1).join('-');
        priceCache.set(cacheKey(chain, address), {
          price,
          fetchedAt: Date.now(),
        });
      }
    }
  } catch (err) {
    console.warn('[price-service] Batch price fetch failed:', err);
  }

  return prices;
}

/**
 * Fetch all prices for a list of token addresses on a given chain.
 * Returns a Map of symbol → USD price.
 *
 * This is the main interface consumed by market-data-service and snapshot-cron.
 */
export async function fetchAllPrices(
  tokens: Array<{ symbol: string; address: string; chain: Chain }>,
): Promise<Map<string, number>> {
  const prices = new Map<string, number>();

  if (tokens.length === 0) return prices;

  // Build batch request
  const tokenIds = tokens.map((t) => `${t.address.toLowerCase()}-${t.chain}`);

  try {
    const batchResult = await fetchBatchPrices(tokenIds);

    for (const token of tokens) {
      const id = `${token.address.toLowerCase()}-${token.chain}`;
      const price = batchResult.get(id) ?? 0;
      prices.set(token.symbol, price);
    }
  } catch (err) {
    console.warn('[price-service] fetchAllPrices failed, falling back to individual fetches:', err);

    // Fallback: fetch individually
    const results = await Promise.allSettled(
      tokens.map(async (t) => {
        const price = await getTokenPrice(t.chain, t.address);
        return { symbol: t.symbol, price };
      }),
    );

    for (const result of results) {
      if (result.status === 'fulfilled') {
        prices.set(result.value.symbol, result.value.price);
      }
    }
  }

  return prices;
}

/** Clear the price cache (useful for testing). */
export function clearPriceCache(): void {
  priceCache.clear();
}
