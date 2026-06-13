import { createSupabaseAdmin } from '@mantleagents/db';
import { STABLE_TOKENS } from '@mantleagents/shared';
import { fetchFxNews } from './news-fetcher.js';
import { analyzeFxNews } from './llm-analyzer.js';
import { getMarketTokens } from './market-data-service.js';
import { fetchNewsForTokens } from './token-news-service.js';

const supabaseAdmin = createSupabaseAdmin(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const DEFAULT_CURRENCIES = ['EURm', 'GBPm', 'JPYm', 'CHFm', 'XAUT'];

/**
 * Run FX analysis (news + LLM) and update overview_cache.
 * Does NOT execute trades. Used when Overview has no cached analysis.
 */
export async function runOverviewFxAnalysis(): Promise<void> {
  const news = await fetchFxNews(DEFAULT_CURRENCIES);

  if (news.length === 0) {
    console.log('[overview-fx-analysis] No news found, skipping LLM');
    return;
  }

  const result = await analyzeFxNews({
    news,
    currentPositions: [],
    portfolioValueUsd: 0,
    allowedCurrencies: STABLE_TOKENS.filter((t) => t !== 'USDm'),
    walletBalances: [],
    customPrompt: null,
  });

  if (result.signals.length === 0) {
    console.log('[overview-fx-analysis] No signals from LLM');
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
