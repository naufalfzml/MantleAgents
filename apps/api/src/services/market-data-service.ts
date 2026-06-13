import { createSupabaseAdmin } from '@mantleagents/db';
import {
  STABLE_TOKENS,
  TOKEN_METADATA,
  ALL_TOKEN_ADDRESSES,
  type TokenInfo,
  type SupportedToken,
} from '@mantleagents/shared';
import {
  MantleDataClient,
  checkContractRisk,
  getKlineByToken,
  getTokenDetail,
  type Chain,
  type ContractRisk,
  type KlineCandle,
  type TokenDetail,
} from '@mantleagents/mantle-data';
import { priceCache, PRICE_CACHE_TTL_MS } from '../lib/cache.js';
import { fetchAllPrices } from './price-service.js';

const supabaseAdmin = createSupabaseAdmin(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const ALL_SYMBOLS: string[] = [...STABLE_TOKENS, 'XAUT'];
let mantleDataClient: MantleDataClient | undefined;

function getMantleDataClient(): MantleDataClient {
  if (!mantleDataClient) {
    mantleDataClient = new MantleDataClient();
  }
  return mantleDataClient;
}

export async function getMarketTokens(): Promise<TokenInfo[]> {
  const cached = priceCache.get<TokenInfo[]>('market_tokens');
  if (cached) return cached;

  // Build token list for AVE price fetch.
  // Default chain is 'bsc' — will be updated when token config moves to multi-chain.
  const defaultChain: Chain = (process.env.MARKETDATA_DEFAULT_CHAIN as Chain) ?? 'bsc';
  const tokenList = ALL_SYMBOLS
    .filter((s) => ALL_TOKEN_ADDRESSES[s])
    .map((s) => ({
      symbol: s,
      address: ALL_TOKEN_ADDRESSES[s],
      chain: defaultChain,
    }));

  const currentPrices = await fetchAllPrices(tokenList).catch((err) => {
    console.warn('[market-data] fetchAllPrices failed:', err);
    return new Map<string, number>();
  });

  // Fetch 24h-ago snapshots
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: dayAgoSnapshots } = await supabaseAdmin
    .from('token_price_snapshots')
    .select('token_symbol, price_usd')
    .in('token_symbol', ALL_SYMBOLS)
    .lte('snapshot_at', oneDayAgo)
    .order('snapshot_at', { ascending: false })
    .limit(ALL_SYMBOLS.length);

  const dayAgoPriceMap = new Map<string, number>();
  if (dayAgoSnapshots) {
    for (const snap of dayAgoSnapshots) {
      if (!dayAgoPriceMap.has(snap.token_symbol)) {
        dayAgoPriceMap.set(snap.token_symbol, snap.price_usd);
      }
    }
  }

  // Fetch 7-day daily samples for sparklines
  const sevenDaysAgo = new Date(
    Date.now() - 7 * 24 * 60 * 60 * 1000,
  ).toISOString();
  const { data: weekSnapshots } = await supabaseAdmin
    .from('token_price_snapshots')
    .select('token_symbol, price_usd, snapshot_at')
    .in('token_symbol', ALL_SYMBOLS)
    .gte('snapshot_at', sevenDaysAgo)
    .order('snapshot_at', { ascending: true });

  const sparklineMap = new Map<string, number[]>();
  if (weekSnapshots) {
    for (const snap of weekSnapshots) {
      const arr = sparklineMap.get(snap.token_symbol) ?? [];
      arr.push(snap.price_usd);
      sparklineMap.set(snap.token_symbol, arr);
    }
  }

  const tokens: TokenInfo[] = ALL_SYMBOLS.map((symbol) => {
    const price = currentPrices.get(symbol) ?? 0;
    const dayAgoPrice = dayAgoPriceMap.get(symbol);
    const change24hPct =
      dayAgoPrice && dayAgoPrice > 0
        ? ((price - dayAgoPrice) / dayAgoPrice) * 100
        : 0;

    const sparkline = sparklineMap.get(symbol) ?? [];
    // Downsample to ~28 points (4 per day) if we have too many
    const sparkline7d =
      sparkline.length > 28
        ? downsample(sparkline, 28)
        : sparkline.length > 0
          ? sparkline
          : [price];

    const meta = TOKEN_METADATA[symbol];

    return {
      symbol: symbol as SupportedToken,
      name: meta?.name ?? symbol,
      priceUsd: price,
      change24hPct: Math.round(change24hPct * 100) / 100,
      sparkline7d,
      flag: meta?.flag,
      decimals: meta?.decimals,
    };
  });

  priceCache.set('market_tokens', tokens, PRICE_CACHE_TTL_MS);
  return tokens;
}

export async function getN8nMarketData(params: {
  chain: Chain;
  tokenAddress: string;
  klineInterval?: 1 | 5 | 15 | 30 | 60 | 120 | 240 | 1440 | 4320 | 10080;
  klineLimit?: number;
}): Promise<{
  detail: TokenDetail;
  kline: KlineCandle[];
  riskSummary: ContractRisk | null;
}> {
  const client = getMantleDataClient();
  const { chain, tokenAddress, klineInterval = 60, klineLimit = 24 } = params;

  const [detail, kline, riskSummary] = await Promise.all([
    getTokenDetail(client, chain, tokenAddress),
    getKlineByToken(client, chain, tokenAddress, {
      interval: klineInterval,
      limit: klineLimit,
    }),
    checkContractRisk(client, chain, tokenAddress).catch(() => null),
  ]);

  return {
    detail,
    kline,
    riskSummary,
  };
}

function downsample(arr: number[], targetLen: number): number[] {
  if (arr.length <= targetLen) return arr;
  const result: number[] = [];
  const step = (arr.length - 1) / (targetLen - 1);
  for (let i = 0; i < targetLen; i++) {
    result.push(arr[Math.round(i * step)]);
  }
  return result;
}
