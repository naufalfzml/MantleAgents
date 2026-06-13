import type { YieldOpportunity, MerklReward, ClaimableReward } from '@mantleagents/shared';
import { mantle } from 'viem/chains';

const MERKL_API_BASE = 'https://api.merkl.xyz/v4';
// Merkl indexes Mantle Mainnet (chainId 5000). This is independent of
// MANTLE_NETWORK (which controls where transactions are sent) since Merkl's
// opportunity/reward data is only available for mainnet.
const DEFAULT_CHAIN_ID = mantle.id; // 5000 — Mantle Mainnet

const OPPORTUNITIES_CACHE_TTL = 5 * 60 * 1000; // 5 min
const REWARDS_CACHE_TTL = 2 * 60 * 1000; // 2 min

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

const opportunitiesCache = new Map<string, CacheEntry<YieldOpportunity[]>>();
const rewardsCache = new Map<string, CacheEntry<MerklReward[]>>();

async function merklFetch(url: string): Promise<any> {
  // retry up to 3 times with exponential backoff
  for (let attempt = 0; attempt < 3; attempt++) {
    const res: any = await fetch(url);
    if (res.status === 429) {
      const delay = Math.pow(2, attempt) * 1000;
      console.warn(`[merkl] Rate limited, retrying in ${delay}ms...`);
      await new Promise(r => setTimeout(r, delay));
      continue;
    }
    if (!res.ok) throw new Error(`Merkl API error: ${res.status} ${res.statusText}`);
    return res;
  }
  throw new Error('Merkl API rate limit exceeded after 3 retries');
}

export async function fetchYieldOpportunities(): Promise<YieldOpportunity[]> {
  const cacheKey = 'all';
  const cached = opportunitiesCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < OPPORTUNITIES_CACHE_TTL) {
    return cached.data;
  }

  // Merkl API doesn't support protocol query param, fetch all and filter client-side
  const url = `${MERKL_API_BASE}/opportunities?chainId=${DEFAULT_CHAIN_ID}&status=LIVE`;

  const res = await merklFetch(url);
  const raw = await res.json();
  const rawItems = Array.isArray(raw) ? raw : [];

  const MERKL_APP_BASE = 'https://app.merkl.xyz/opportunities';
  const opportunities: YieldOpportunity[] = rawItems.map((item: any) => {
    const identifier = item.identifier ?? item.id ?? '';
    const type = item.type ?? '';
    const merklUrl =
      identifier && type
        ? `${MERKL_APP_BASE}/${type}/${identifier}`
        : undefined;
    return {
      id: identifier,
      name: item.name ?? '',
      vaultAddress: identifier,
      protocol: typeof item.protocol === 'object' ? (item.protocol?.name ?? '') : String(item.protocol ?? ''),
      status: item.status ?? 'LIVE',
      apr: Number(item.apr ?? 0),
      tvl: Number(item.tvl ?? 0),
      dailyRewards: Number(item.dailyRewards ?? 0),
      tokens: (item.tokens ?? []).map((t: any) => ({
        symbol: t.symbol ?? t.displaySymbol ?? '',
        address: t.address ?? '',
        decimals: t.decimals ?? 18,
        icon: t.icon ?? undefined,
      })),
      depositUrl: item.depositUrl,
      type,
      merklUrl,
    };
  });

  // Sort by APR descending
  opportunities.sort((a, b) => b.apr - a.apr);

  opportunitiesCache.set(cacheKey, { data: opportunities, timestamp: Date.now() });
  return opportunities;
}

export async function fetchUserRewards(
  walletAddress: string,
): Promise<MerklReward[]> {
  const cacheKey = walletAddress.toLowerCase();
  const cached = rewardsCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < REWARDS_CACHE_TTL) {
    return cached.data;
  }

  const url = `${MERKL_API_BASE}/users/${walletAddress}/rewards?chainId=${DEFAULT_CHAIN_ID}`;
  const res = await merklFetch(url);
  const raw = await res.json();
  const rawItems = Array.isArray(raw) ? raw : [];

  const rewards: MerklReward[] = rawItems.map((r: any) => ({
    token: {
      address: r.token?.address ?? '',
      symbol: r.token?.symbol ?? '',
      decimals: r.token?.decimals ?? 18,
    },
    amount: String(r.amount ?? '0'),
    claimed: String(r.claimed ?? '0'),
    pending: String(BigInt(r.amount ?? '0') - BigInt(r.claimed ?? '0')),
    proofs: r.proofs ?? [],
  }));

  rewardsCache.set(cacheKey, { data: rewards, timestamp: Date.now() });
  return rewards;
}

export async function fetchClaimableRewards(
  walletAddress: string,
): Promise<ClaimableReward[]> {
  const rewards = await fetchUserRewards(walletAddress);

  return rewards
    .filter(r => {
      const total = BigInt(r.amount);
      const claimed = BigInt(r.claimed);
      return total > claimed && r.proofs.length > 0;
    })
    .map(r => ({
      ...r,
      claimableAmount: String(BigInt(r.amount) - BigInt(r.claimed)),
      claimableValueUsd: 0, // Would need price feed to calculate
    }));
}

/** Clear all caches (for testing) */
export function clearMerklCache(): void {
  opportunitiesCache.clear();
  rewardsCache.clear();
}
