import { createSupabaseAdmin } from '@mantleagents/db';
import { getMarketTokens } from './market-data-service.js';
import { fetchYieldOpportunities } from './merkl-client.js';
import { fetchNewsForTokens, type TokenNewsResult } from './token-news-service.js';

const supabaseAdmin = createSupabaseAdmin(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

/** Latest FX analysis from any user (market analysis is global) */
interface CachedAnalysis {
  detail?: { signals?: Array<{ currency: string; direction: string; confidence: number; reasoning: string }>; marketSummary?: string };
  summary?: string;
}

export async function getCachedTrendingFx(): Promise<{
  tokens: Awaited<ReturnType<typeof getMarketTokens>>;
  analysis: CachedAnalysis | null;
  tokenNews: TokenNewsResult;
  updatedAt: string;
}> {
  const cacheKey = 'trending_fx';
  const oneHourAgo = new Date(Date.now() - CACHE_TTL_MS).toISOString();

  const { data: row } = await supabaseAdmin
    .from('overview_cache')
    .select('payload, cached_at')
    .eq('cache_key', cacheKey)
    .gte('cached_at', oneHourAgo)
    .maybeSingle();

  if (row?.payload && typeof row.payload === 'object' && 'tokens' in row.payload) {
    const payload = row.payload as Record<string, unknown>;
    const tokens = payload.tokens as Awaited<ReturnType<typeof getMarketTokens>>;
    const tokenNews = (payload.tokenNews as TokenNewsResult) ?? {};

    const top5Symbols = Array.isArray(tokens)
      ? [...tokens]
          .sort((a, b) => Math.abs(b.change24hPct) - Math.abs(a.change24hPct))
          .slice(0, 5)
          .map((t) => t.symbol)
      : [];
    const hasAnyNews = top5Symbols.some((s) => (tokenNews[s] ?? '').trim().length > 0);

    if (hasAnyNews || top5Symbols.length === 0) {
      return {
        tokens,
        analysis: (payload.analysis as CachedAnalysis | null) ?? null,
        tokenNews,
        updatedAt: row.cached_at,
      };
    }
  }

  const [tokens, analysisRow] = await Promise.all([
    getMarketTokens(),
    supabaseAdmin
      .from('fx_agent_timeline')
      .select('detail, summary')
      .eq('event_type', 'analysis')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const analysis: CachedAnalysis | null = analysisRow.data
    ? {
        detail: analysisRow.data.detail as CachedAnalysis['detail'],
        summary: analysisRow.data.summary ?? undefined,
      }
    : null;

  const top5Symbols = [...tokens]
    .sort((a, b) => Math.abs(b.change24hPct) - Math.abs(a.change24hPct))
    .slice(0, 5)
    .map((t) => t.symbol);

  const tokenNews = top5Symbols.length > 0 ? await fetchNewsForTokens(top5Symbols) : {};

  const now = new Date().toISOString();
  await supabaseAdmin
    .from('overview_cache')
    .upsert(
      {
        cache_key: cacheKey,
        payload: { tokens, analysis, tokenNews },
        cached_at: now,
      },
      { onConflict: 'cache_key' },
    );

  return { tokens, analysis, tokenNews, updatedAt: now };
}

export async function getCachedYieldOpportunities(): Promise<{
  opportunities: Awaited<ReturnType<typeof fetchYieldOpportunities>>;
  updatedAt: string;
}> {
  const cacheKey = 'yield_opportunities';
  const oneHourAgo = new Date(Date.now() - CACHE_TTL_MS).toISOString();

  const { data: row } = await supabaseAdmin
    .from('overview_cache')
    .select('payload, cached_at')
    .eq('cache_key', cacheKey)
    .gte('cached_at', oneHourAgo)
    .maybeSingle();

  if (row?.payload && typeof row.payload === 'object' && 'opportunities' in row.payload) {
    return {
      opportunities: row.payload.opportunities as Awaited<
        ReturnType<typeof fetchYieldOpportunities>
      >,
      updatedAt: row.cached_at,
    };
  }

  const opportunities = await fetchYieldOpportunities();
  const now = new Date().toISOString();
  await supabaseAdmin
    .from('overview_cache')
    .upsert(
      {
        cache_key: cacheKey,
        payload: { opportunities },
        cached_at: now,
      },
      { onConflict: 'cache_key' },
    );

  return { opportunities, updatedAt: now };
}
