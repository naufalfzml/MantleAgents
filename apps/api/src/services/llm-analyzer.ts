import { generateText, Output } from 'ai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createGeminiProvider } from 'ai-sdk-provider-gemini-cli';
import { z } from 'zod';
import type { NewsArticle } from './news-fetcher.js';

function getGeminiProvider() {
  const authType = process.env.GEMINI_CLI_AUTH_TYPE || 'oauth-personal';
  if (authType === 'api-key') {
    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    if (!apiKey) throw new Error('GEMINI_API_KEY is required when GEMINI_CLI_AUTH_TYPE=api-key');
    return createGoogleGenerativeAI({ apiKey });
  }
  // oauth-personal: use Gemini CLI OAuth (no API key needed, uses Google account quota)
  return createGeminiProvider({ authType: 'oauth-personal' });
}

function getLlmModel(): string {
  return process.env.LLM_MODEL || 'gemini-2.5-flash';
}

export const SignalSchema = z.object({
  signals: z.array(z.object({
    currency: z.string(),
    direction: z.enum(['buy', 'sell', 'hold']),
    confidence: z.number().min(0).max(100),
    allocationPct: z.number().min(0).max(100),
    reasoning: z.string(),
    timeHorizon: z.enum(['short', 'medium', 'long']),
  })),
  marketSummary: z.string(),
  sourcesUsed: z.number(),
});

export type TradingSignals = z.infer<typeof SignalSchema>;

interface AnalysisParams {
  news: NewsArticle[];
  currentPositions: Array<{ tokenSymbol: string; balance: number }>;
  portfolioValueUsd: number;
  allowedCurrencies: string[];
  walletBalances?: Array<{ symbol: string; formatted: string; valueUsd: number }>;
  customPrompt?: string | null;
}

export async function analyzeFxNews(params: AnalysisParams): Promise<TradingSignals> {
  const { news, currentPositions, portfolioValueUsd, allowedCurrencies, walletBalances, customPrompt } = params;

  try {
    const result = await generateText({
      model: getGeminiProvider()(getLlmModel()),
      output: Output.object({ schema: SignalSchema }),
      system: buildSystemPrompt({ allowedCurrencies, currentPositions, portfolioValueUsd, walletBalances, customPrompt }),
      prompt: buildAnalysisPrompt({ news }),
    });

    if (!result.output) {
      console.error('LLM returned no output');
      return { signals: [], marketSummary: 'Analysis failed: no output from LLM', sourcesUsed: 0 };
    }

    return result.output;
  } catch (err) {
    console.error('LLM analysis failed:', err);
    return { signals: [], marketSummary: `Analysis failed: ${err instanceof Error ? err.message : 'Unknown error'}`, sourcesUsed: 0 };
  }
}

export function buildSystemPrompt(params: {
  allowedCurrencies: string[];
  currentPositions: Array<{ tokenSymbol: string; balance: number }>;
  portfolioValueUsd: number;
  walletBalances?: Array<{ symbol: string; formatted: string; valueUsd: number }>;
  customPrompt?: string | null;
}): string {
  const { allowedCurrencies, currentPositions, portfolioValueUsd, walletBalances, customPrompt } = params;

  const positionsSummary = currentPositions.length > 0
    ? currentPositions.map(p => `${p.tokenSymbol}: ${p.balance}`).join(', ')
    : 'No positions';

  // Show actual wallet balances so the LLM can size trades correctly
  const balanceLines = walletBalances && walletBalances.length > 0
    ? walletBalances.map(b => `  ${b.symbol}: ${b.formatted} (~$${b.valueUsd.toFixed(2)})`).join('\n')
    : '  Empty wallet';

  // Calculate available buying power from base stables (USDC, USDT, USDm)
  const baseStables = ['USDC', 'USDT', 'USDm'];
  const availableUsd = walletBalances
    ? walletBalances.filter(b => baseStables.includes(b.symbol)).reduce((sum, b) => sum + b.valueUsd, 0)
    : portfolioValueUsd;

  return [
    'You are a macro crypto analyst for a BSC on-chain trading portfolio.',
    'Your base currency is USDT (Binance-Peg USDT on BSC). Buys spend USDT.',
    `Your trading universe is limited to these tokens: ${allowedCurrencies.join(', ')}.`,
    'These are real BSC mainnet tokens: BNB (Binance Coin), ETH (Binance-Peg ETH), BTC (Binance-Peg BTC), USDT, USDC.',
    '',
    '## Wallet State',
    `Total portfolio value: $${portfolioValueUsd.toFixed(2)}`,
    `Available buying power (USDT): $${availableUsd.toFixed(2)}`,
    `On-chain balances:\n${balanceLines}`,
    `Tracked positions: ${positionsSummary}`,
    '',
    '## Strategy',
    'Use macro news (USD strength/weakness, risk-on/risk-off sentiment, crypto market conditions) to decide:',
    '- USD bearish / risk-on → buy BNB or ETH (reduce USD exposure)',
    '- USD bullish / risk-off → sell BNB/ETH back to USDT',
    '- BTC-specific news → consider BTC signals',
    '',
    '## Rules',
    'Generate trading signals based on the provided news articles.',
    'For each signal:',
    '- currency: must be one of the allowed tokens (BNB, ETH, BTC, USDT, USDC)',
    '- confidence: 0-100 (only signals >= 60 will be considered)',
    '- allocationPct: 0-100, what percentage of available buying power to use',
    '- reasoning: must cite specific news articles or data points',
    '- direction: buy (spend USDT to buy the token) or sell (convert back to USDT)',
    '- timeHorizon: short (hours), medium (days), long (weeks)',
    '',
    '## ALLOCATION GUIDELINES',
    `- Available: $${availableUsd.toFixed(2)} USDT. Sum of allocationPct across all buy signals must not exceed 100%.`,
    '- Scale with conviction: low (60-70) → 10-20%, medium (70-85) → 20-40%, high (85+) → 40-60%.',
    '- For sells: allocationPct is the % of your held position to sell.',
    '',
    '## CRITICAL CONSTRAINTS',
    '- You can only SELL tokens you actually hold. Check on-chain balances above.',
    '- Do NOT generate sell signals for tokens with zero balance.',
    '- Only generate signals for tokens in your allowed list.',
    '- When buying, use BNB as default unless BTC or ETH has stronger specific catalysts.',
    customPrompt ? `\nUser instructions: ${customPrompt}` : '',
  ].join('\n');
}

export function buildAnalysisPrompt(params: { news: NewsArticle[] }): string {
  if (params.news.length === 0) {
    return 'No news articles available. Return empty signals array and a brief market summary.';
  }

  const articles = params.news.map((n, i) =>
    `[${i + 1}] ${n.title}\n    Source: ${n.source || n.url}\n    ${n.excerpt}`
  ).join('\n\n');

  return `Analyze these ${params.news.length} FX news articles and generate trading signals:\n\n${articles}`;
}

/** Dedicated system prompt for overview FX analysis (Mantle stablecoins, no trade execution). */
function buildOverviewSystemPrompt(allowedCurrencies: string[]): string {
  return [
    'You are a macro FX analyst generating market outlook signals for Mantle blockchain FX stablecoin pairs.',
    'These tokens track real-world fiat currencies: USDm=USD, EURm=EUR, GBPm=GBP, JPYm=JPY,',
    'BRLm=BRL, KESm=KES, PHPm=PHP, CHFm=CHF, ZARm=ZAR, AUDm=AUD, CADm=CAD, NGNm=NGN.',
    `Your analysis universe: ${allowedCurrencies.join(', ')}`,
    '',
    '## Task',
    'Generate directional signals (buy/sell/hold vs USD baseline) based on macro FX trends.',
    '- "buy" = this currency is appreciating vs USD (bullish)',
    '- "sell" = this currency is weakening vs USD (bearish)',
    '- "hold" = neutral / insufficient data',
    '- confidence: 0-100 (express your conviction)',
    '- allocationPct: 0-100 (relative weight, not actual capital allocation)',
    '- reasoning: brief macro rationale (use news if available, otherwise general FX knowledge)',
    '- timeHorizon: short/medium/long',
    '',
    'Generate at least 3-5 signals covering different currency regions.',
    'If no news is available, base signals on established macro FX trends and fundamentals.',
  ].join('\n');
}

/** Overview-specific FX analysis: no trade execution, uses Mantle FX stablecoin system prompt. */
export async function analyzeOverviewFx(params: {
  news: NewsArticle[];
  allowedCurrencies: string[];
}): Promise<TradingSignals> {
  const { news, allowedCurrencies } = params;

  const prompt = news.length > 0
    ? buildAnalysisPrompt({ news })
    : `No live news available. Generate FX market outlook signals for ${allowedCurrencies.join(', ')} based on current macro trends and historical patterns.`;

  try {
    const result = await generateText({
      model: getGeminiProvider()(getLlmModel()),
      output: Output.object({ schema: SignalSchema }),
      system: buildOverviewSystemPrompt(allowedCurrencies),
      prompt,
    });

    if (!result.output) {
      return { signals: [], marketSummary: 'Analysis returned no output', sourcesUsed: 0 };
    }

    return result.output;
  } catch (err) {
    console.error('[analyzeOverviewFx] LLM failed:', err);
    return { signals: [], marketSummary: `Analysis failed: ${err instanceof Error ? err.message : 'Unknown error'}`, sourcesUsed: 0 };
  }
}
