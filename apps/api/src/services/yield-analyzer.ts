import { generateText, Output } from 'ai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createGeminiProvider } from 'ai-sdk-provider-gemini-cli';
import { z } from 'zod';
import type { YieldOpportunity, YieldSignal, YieldAnalysisResult, YieldGuardrails, ProgressReasoningData } from '@mantleagents/shared';
import { emitProgress } from './agent-events.js';

function getGeminiProvider() {
  const authType = process.env.GEMINI_CLI_AUTH_TYPE || 'oauth-personal';
  if (authType === 'api-key') {
    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    if (!apiKey) throw new Error('GEMINI_API_KEY is required when GEMINI_CLI_AUTH_TYPE=api-key');
    return createGoogleGenerativeAI({ apiKey });
  }
  return createGeminiProvider({ authType: 'oauth-personal' });
}

function getLlmModel(): string {
  return process.env.LLM_MODEL || 'gemini-2.5-flash';
}

const YieldSignalSchema = z.object({
  vaultAddress: z.string(),
  vaultName: z.string(),
  action: z.enum(['deposit', 'withdraw', 'hold']),
  amountUsd: z.number(),
  allocationPct: z.number().min(0).max(100),
  confidence: z.number().min(0).max(100),
  reasoning: z.string(),
  estimatedApr: z.number(),
  riskLevel: z.enum(['low', 'medium', 'high']),
});

const YieldAnalysisSchema = z.object({
  strategySummary: z.string(),
  signals: z.array(YieldSignalSchema),
});

export type { YieldAnalysisResult };

/** Opportunity with optional swap-executability metadata from strategy layer */
interface YieldOpportunityForAnalysis extends YieldOpportunity {
  depositTokenSymbol?: string;
  routeFromUSDC?: boolean;
}

interface YieldAnalysisInput {
  opportunities: YieldOpportunityForAnalysis[];
  currentPositions: Array<{ vaultAddress: string; depositAmountUsd: number; currentApr: number | null }>;
  portfolioValueUsd: number;
  guardrails: YieldGuardrails;
  customPrompt?: string | null;
  walletAddress?: string;
  walletBalances?: Array<{ symbol: string; formatted: string; valueUsd: number }>;
}

const STAGE_MESSAGES = [
  'Fetching vault data...',
  'Comparing APRs...',
  'Evaluating risk...',
  'Generating recommendations...',
];
const STAGE_INTERVAL_MS = 3500;

function formatYieldResultForDisplay(strategySummary: string, signals: YieldSignal[]): string {
  const lines: string[] = [strategySummary];
  if (signals.length > 0) {
    lines.push('');
    lines.push('Recommendations:');
    for (const s of signals) {
      const action = s.action.charAt(0).toUpperCase() + s.action.slice(1);
      lines.push(`- ${s.vaultName}: ${action} $${s.amountUsd.toFixed(2)} (${s.estimatedApr.toFixed(1)}% APR) — ${s.reasoning}`);
    }
  }
  return lines.join('\n');
}

export async function analyzeYieldOpportunities(input: YieldAnalysisInput): Promise<YieldAnalysisResult> {
  // Emit stage messages at intervals during analysis
  let stageIndex = 0;
  const stageTimer =
    input.walletAddress
      ? setInterval(() => {
          const stage = STAGE_MESSAGES[stageIndex % STAGE_MESSAGES.length];
          stageIndex += 1;
          emitProgress(
            input.walletAddress!,
            'analyzing_yields',
            stage,
            { stage } as ProgressReasoningData,
            'yield'
          );
        }, STAGE_INTERVAL_MS)
      : null;

  try {
    const result = await generateText({
      model: getGeminiProvider()(getLlmModel()),
      output: Output.object({ schema: YieldAnalysisSchema }),
      system: buildYieldSystemPrompt(input),
      prompt: buildYieldAnalysisPrompt(input),
    });

    if (stageTimer) clearInterval(stageTimer);

    if (!result.output) {
      console.error('[yield-analyzer] LLM returned no structured output');
      return { signals: [], strategySummary: 'Analysis failed: no structured output from LLM', sourcesUsed: 0 };
    }

    const signals: YieldSignal[] = result.output.signals.map((s: any) => ({
      vaultAddress: s.vaultAddress,
      vaultName: s.vaultName,
      action: s.action,
      amountUsd: s.amountUsd,
      allocationPct: s.allocationPct,
      confidence: s.confidence,
      reasoning: s.reasoning,
      estimatedApr: s.estimatedApr,
      riskLevel: s.riskLevel,
    }));

    // Emit formatted result (human-readable, not JSON)
    if (input.walletAddress) {
      const formatted = formatYieldResultForDisplay(result.output.strategySummary, signals);
      emitProgress(
        input.walletAddress,
        'analyzing_yields',
        'Analysis complete',
        { cumulative_reasoning: formatted } as ProgressReasoningData,
        'yield'
      );
    }

    return {
      signals,
      strategySummary: result.output.strategySummary,
      sourcesUsed: input.opportunities.length,
    };
  } catch (err) {
    if (stageTimer) clearInterval(stageTimer);
    console.error('[yield-analyzer] LLM analysis failed:', err);
    return {
      signals: [],
      strategySummary: `Analysis failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
      sourcesUsed: 0,
    };
  }
}

export function buildYieldSystemPrompt(input: YieldAnalysisInput): string {
  const { currentPositions, portfolioValueUsd, guardrails, customPrompt, walletBalances } = input;

  const positionList = currentPositions.length > 0
    ? currentPositions.map(p =>
        `- Vault ${p.vaultAddress.slice(0, 10)}...: $${p.depositAmountUsd.toFixed(2)} deposited, APR: ${p.currentApr?.toFixed(1) ?? 'unknown'}%`
      ).join('\n')
    : '- No current positions';

  const walletBalancesSection = walletBalances && walletBalances.length > 0
    ? [
        '',
        '## Wallet Balances (on-chain)',
        walletBalances
          .map((b) => `${b.symbol}: ${b.formatted} ($${b.valueUsd.toFixed(2)})`)
          .join(', '),
      ].join('\n')
    : '';

  const walletWarning = portfolioValueUsd === 0 && (!walletBalances || walletBalances.length === 0)
    ? '\n\n⚠️ **IMPORTANT**: User wallet is currently empty ($0.00). Provide analysis and recommendations but DO NOT suggest specific deposit amounts or actions. Inform the user they need to fund their wallet first before any deposits can be executed. Focus on educational insights about the opportunities.'
    : '';

  return [
    'You are a DeFi yield optimization analyst for a Mantle Sepolia on-chain agent.',
    'The available opportunities are Uniswap V2 LP pools on our self-hosted Mantle DEX.',
    'To deposit into a pool: the system will add liquidity using addLiquidity() on the Uniswap V2 router.',
    'To exit a position: the system will call removeLiquidity() to redeem LP shares back to tokens.',
    walletWarning,
    '',
    '## Portfolio',
    `Total portfolio value: $${portfolioValueUsd.toFixed(2)}`,
    walletBalancesSection,
    '',
    '## Guardrails',
    `- Minimum APR: ${guardrails.minAprThreshold}%`,
    `- Max single vault allocation: ${guardrails.maxSingleVaultPct}%`,
    `- Min hold period: ${guardrails.minHoldPeriodDays} days`,
    `- Max vault count: ${guardrails.maxVaultCount}`,
    `- Min TVL: $${guardrails.minTvlUsd.toLocaleString()}`,
    '',
    '## Current Positions',
    positionList,
    '',
    '## Rules',
    '1. Prioritize higher APR pools but consider TVL (low TVL = higher slippage risk)',
    '2. Respect all guardrails — don\'t suggest allocations exceeding limits',
    '3. For existing LP positions: suggest withdraw if APR dropped significantly or position is aged',
    '4. Use APR-weighted allocation — higher APR gets proportionally more allocation',
    '5. Never suggest more pools than maxVaultCount',
    '6. Set confidence 0-100 based on data quality and risk assessment',
    '7. Only signals with confidence >= 60 will be acted upon',
    '8. **DEPOSIT ONLY if the wallet holds USDC or USDT** — all pools contain at least one stablecoin, so the system can always enter. Do not suggest deposit if wallet has zero balance.',
    '9. vaultAddress MUST be the exact pair contract address shown in the opportunity list — do not modify it.',
    '10. For USDC/WMNT or USDT/WMNT pools: the system will automatically swap half the input to WMNT before adding liquidity.',
    customPrompt ? `\nUser instructions: ${customPrompt}` : '',
  ].join('\n');
}

export function buildYieldAnalysisPrompt(input: YieldAnalysisInput): string {
  const { opportunities } = input;

  if (opportunities.length === 0) {
    return 'No vault opportunities available. Return empty signals array and a brief strategy summary.';
  }

  const vaultList = opportunities.slice(0, 20).map((o, i) => {
    const depositToken = (o as YieldOpportunityForAnalysis).depositTokenSymbol ?? 'USDC';
    return `${i + 1}. ${o.name} (${o.vaultAddress})\n   APR: ${o.apr.toFixed(1)}%, TVL: $${o.tvl.toLocaleString()}, Protocol: ${o.protocol}, Tokens: ${o.tokens.map(t => t.symbol).join('/')}\n   Entry: add liquidity with ${depositToken} (system handles swap to pair token automatically)`;
  }).join('\n');

  return `Analyze these ${Math.min(opportunities.length, 20)} Uniswap V2 LP pool opportunities on Mantle DEX and generate yield signals:\n\n${vaultList}`;
}
