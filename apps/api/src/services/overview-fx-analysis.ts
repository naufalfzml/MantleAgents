import { createSupabaseAdmin } from '@mantleagents/db';
import { STABLE_TOKENS } from '@mantleagents/shared';
import { fetchFxNews } from './news-fetcher.js';
import { analyzeOverviewFx } from './llm-analyzer.js';
import { getMarketTokens } from './market-data-service.js';
import { fetchNewsForTokens } from './token-news-service.js';

const supabaseAdmin = createSupabaseAdmin(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const FX_CURRENCIES = STABLE_TOKENS.filter((t) => t !== 'USDm') as string[];

/**
 * Run FX analysis (news + LLM) and update overview_cache.
 * Does NOT execute trades. Used when Overview has no cached analysis.
 * Works without PARALLEL_API_KEY — falls back to LLM general knowledge.
 */
export async function runOverviewFxAnalysis(): Promise<void> {
  // Fetch news — tolerate missing API key or network errors
  let news: Awaited<ReturnType<typeof fetchFxNews>> = [];
  try {
    news = await fetchFxNews(FX_CURRENCIES.slice(0, 5));
  } catch {
    console.log('[overview-fx-analysis] News fetch unavailable, using general FX knowledge');
  }

  const result = await analyzeOverviewFx({
    news,
    allowedCurrencies: FX_CURRENCIES,
  });

  if (result.signals.length === 0) {
    console.log('[overview-fx-analysis] LLM returned no signals');
    return;
  }

  const analysis = {
    detail: {
      signals: result.signals.map((s) => ({
        currency: s.currency,
        direction: s.direction,
        confidence: s.confidence,
        reasoning: s.reasoning,
      })),
      marketSummary: result.marketSummary,
    },
    summary: `${result.signals.length} signals. ${result.marketSummary}`,
  };

  const { data: existing } = await supabaseAdmin
    .from('overview_cache')
    .select('payload')
    .eq('cache_key', 'trending_fx')
    .maybeSingle();

  let tokens = existing?.payload && typeof existing.payload === 'object' && 'tokens' in existing.payload
    ? (existing.payload as { tokens: unknown }).tokens
    : null;

  if (!tokens || !Array.isArray(tokens) || tokens.length === 0) {
    tokens = await getMarketTokens();
  }

  const top5Symbols = (tokens as Array<{ symbol: string; change24hPct: number }>)
    .sort((a, b) => Math.abs(b.change24hPct) - Math.abs(a.change24hPct))
    .slice(0, 5)
    .map((t) => t.symbol);
  const tokenNews = top5Symbols.length > 0 ? await fetchNewsForTokens(top5Symbols) : {};

  await supabaseAdmin
    .from('overview_cache')
    .upsert(
      {
        cache_key: 'trending_fx',
        payload: { tokens, analysis, tokenNews },
        cached_at: new Date().toISOString(),
      },
      { onConflict: 'cache_key' },
    );

  console.log('[overview-fx-analysis] Updated cache with', result.signals.length, 'signals');
}
