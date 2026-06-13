import { streamText, Output } from 'ai';
import { createGeminiProvider } from 'ai-sdk-provider-gemini-cli';
import { z } from 'zod';
import type { YieldOpportunity, YieldSignal, YieldAnalysisResult, YieldGuardrails, ProgressReasoningData } from '@mantleagents/shared';
import { emitProgress } from './agent-events.js';

const gemini = createGeminiProvider({
  authType: (process.env.GEMINI_CLI_AUTH_TYPE as 'api-key' | 'oauth-personal') || 'oauth-personal',
  apiKey: process.env.GEMINI_API_KEY,
});

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
  try {
    const stream = streamText({
      model: gemini('gemini-2.5-flash'),
      output: Output.object({ schema: YieldAnalysisSchema }),
      system: buildYieldSystemPrompt(input),
      prompt: buildYieldAnalysisPrompt(input),
    });

    // Emit stage messages at intervals during analysis (no raw JSON)
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

    // Consume stream (do not emit raw JSON)
    if (input.walletAddress) {
      for await (const _chunk of stream.textStream) {
        // Stream consumed; stage timer provides user feedback
      }
    } else {
      for await (const _chunk of stream.textStream) {
        // Consume without emitting
      }
    }

    if (stageTimer) clearInterval(stageTimer);

    const final = await stream;
    const result = await final.output;

    if (!result) {
      console.error('[yield-analyzer] LLM returned no structured output');
      return { signals: [], strategySummary: 'Analysis failed: no structured output from LLM', sourcesUsed: 0 };
    }

    const signals: YieldSignal[] = result.signals.map((s: any) => ({
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
      const formatted = formatYieldResultForDisplay(result.strategySummary, signals);
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
      strategySummary: result.strategySummary,
      sourcesUsed: input.opportunities.length,
    };
  } catch (err) {
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
    'You are a DeFi yield optimization analyst. Analyze the available vault opportunities and current positions to recommend deposit, withdraw, or hold actions.',
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
    '1. Prioritize higher APR vaults but consider TVL (low TVL = higher risk)',
    '2. Respect all guardrails — don\'t suggest allocations exceeding limits',
    '3. For existing positions: suggest withdraw if APR dropped significantly (>50% from entry)',
    '4. Use APR-weighted allocation — higher APR gets proportionally more allocation',
    '5. Never suggest more vaults than maxVaultCount',
    '6. Set confidence 0-100 based on data quality and risk assessment',
    '7. Only signals with confidence >= 60 will be acted upon',
    '8. **Token matching is CRITICAL**: Only recommend DEPOSIT for a vault/pool if the wallet holds at least one of the pool\'s tokens. Check the Wallet Balances section — if the wallet has USDT, only recommend pools that contain USDT (or USDC/BUSD/USDm as close substitutes). Never recommend a pool where the wallet has ZERO balance of both pool tokens.',
    '9. Never suggest swapping from volatile assets (WETH, WBTC, native tokens, etc.) — only USDC, USDT, and USDm are used as swap sources. If a pool requires PUFFER, BNB, or any non-stable the wallet does not hold, mark it as hold.',
    '10. **Swap-then-deposit**: If a vault shows routeFromUSDC=true and the wallet has USDC, USDT, or USDm, you can recommend DEPOSIT (not hold) even if the wallet doesn\'t have the vault\'s native token, because the system will automatically swap for the user.',
    customPrompt ? `\nUser instructions: ${customPrompt}` : '',
  ].join('\n');
}

export function buildYieldAnalysisPrompt(input: YieldAnalysisInput): string {
  const { opportunities } = input;

  if (opportunities.length === 0) {
    return 'No vault opportunities available. Return empty signals array and a brief strategy summary.';
  }

  const vaultList = opportunities.slice(0, 20).map((o, i) => {
    const depositToken = (o as YieldOpportunityForAnalysis).depositTokenSymbol ?? 'see Tokens';
    const swapNote = (o as YieldOpportunityForAnalysis).routeFromUSDC === true
      ? ', swap-from-USDC: yes (system can swap USDC/USDT/USDm to deposit token)'
      : '';
    return `${i + 1}. ${o.name} (${o.vaultAddress})\n   APR: ${o.apr.toFixed(1)}%, TVL: $${o.tvl.toLocaleString()}, Protocol: ${o.protocol}, Tokens: ${o.tokens.map(t => t.symbol).join('/')}\n   Deposit token: ${depositToken}${swapNote}`;
  }).join('\n');

  return `Analyze these ${Math.min(opportunities.length, 20)} vault opportunities and generate yield signals:\n\n${vaultList}`;
}
