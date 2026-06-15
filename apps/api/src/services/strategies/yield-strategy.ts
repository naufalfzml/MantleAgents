import type { GuardrailCheck } from '@mantleagents/shared';
import type { YieldOpportunity, YieldSignal, YieldGuardrails } from '@mantleagents/shared';
import { fetchDexPoolOpportunities } from '../dex-pool-reader.js';
import { analyzeYieldOpportunities } from '../yield-analyzer.js';
import { executeYieldDeposit, executeYieldWithdraw } from '../trade-executor.js';
import { checkYieldGuardrails } from '../yield-guardrails.js';
import type { Address } from 'viem';
import type {
  AgentStrategy,
  AgentConfigRow,
  StrategyContext,
  StrategyAnalysisResult,
  ExecutionResult,
  WalletContext,
  GuardrailContext,
} from './types.js';

/** Enriched opportunity with swap-executability metadata for the analyzer */
export interface YieldOpportunityWithSwapMeta extends YieldOpportunity {
  depositTokenSymbol: string;
  routeFromUSDC: boolean;
}

interface YieldData {
  opportunities: YieldOpportunityWithSwapMeta[];
}

function getGuardrails(config: AgentConfigRow): YieldGuardrails {
  const params = ((config as any).strategy_params ?? {}) as Record<string, unknown>;
  return {
    minAprThreshold: (params.minAprThreshold as number) ?? 1,
    maxSingleVaultPct: (params.maxSingleVaultPct as number) ?? 80,
    minHoldPeriodDays: (params.minHoldPeriodDays as number) ?? 1,
    maxIlTolerancePct: (params.maxIlTolerancePct as number) ?? 10,
    minTvlUsd: (params.minTvlUsd as number) ?? 100,
    maxVaultCount: (params.maxVaultCount as number) ?? 5,
    rewardClaimFrequencyHrs: (params.rewardClaimFrequencyHrs as number) ?? 168,
    autoCompound: (params.autoCompound as boolean) ?? false,
  };
}

export class YieldStrategy implements AgentStrategy {
  type = 'yield' as const;

  async fetchData(_config: AgentConfigRow, _context: StrategyContext): Promise<YieldData> {
    const allOpportunities = await fetchDexPoolOpportunities();
    console.log(`[yield-strategy] DEX pool reader returned ${allOpportunities.length} pools`);

    // All DEX pool opportunities are valid — no Merkl/Aave filter needed.
    // Enrich with deposit metadata: all pairs contain USDC or USDT, so routeFromUSDC=true.
    const opportunities: YieldOpportunityWithSwapMeta[] = allOpportunities.map(opp => {
      const stableToken = opp.tokens.find(t => t.symbol === 'USDC' || t.symbol === 'USDT');
      return {
        ...opp,
        depositTokenSymbol: stableToken?.symbol ?? opp.tokens[0]?.symbol ?? 'USDC',
        routeFromUSDC: true,
      };
    });

    return { opportunities };
  }

  async analyze(
    data: unknown,
    config: AgentConfigRow,
    context: StrategyContext,
  ): Promise<StrategyAnalysisResult> {
    const { opportunities } = data as YieldData;
    const guardrails = getGuardrails(config);

    // Log wallet tokens for matching
    const walletSymbols = (context.walletBalances ?? [])
      .filter(b => b.valueUsd > 0)
      .map(b => b.symbol.toUpperCase());
    console.log(`[yield-strategy] Wallet tokens: ${walletSymbols.join(', ') || 'none'}`);
    console.log(`[yield-strategy] ${opportunities.length} DEX pools available for analysis`);

    // Filter by TVL floor before analysis
    const filtered = opportunities.filter(o => o.tvl >= guardrails.minTvlUsd);
    console.log(`[yield-strategy] ${filtered.length}/${opportunities.length} pools pass TVL floor ($${guardrails.minTvlUsd})`);

    const result = await analyzeYieldOpportunities({
      opportunities: filtered,
      currentPositions: context.positions.map((p: any) => ({
        vaultAddress: p.vault_address ?? p.vaultAddress ?? '',
        depositAmountUsd: Number(p.deposit_amount_usd ?? p.depositAmountUsd ?? 0),
        currentApr: p.current_apr ?? p.currentApr ?? null,
      })),
      portfolioValueUsd: context.portfolioValueUsd,
      guardrails,
      customPrompt: config.custom_prompt,
      walletAddress: config.wallet_address,
      walletBalances: context.walletBalances?.map((b) => ({
        symbol: b.symbol,
        formatted: b.formatted,
        valueUsd: b.valueUsd,
      })),
    });

    return {
      signals: result.signals,
      summary: result.strategySummary,
      sourcesUsed: result.sourcesUsed,
    };
  }

  async executeSignal(
    signal: unknown,
    wallet: WalletContext,
    _config: AgentConfigRow,
    context?: StrategyContext,
  ): Promise<ExecutionResult> {
    const s = signal as YieldSignal;

    if (s.action === 'deposit') {
      const result = await executeYieldDeposit({
        serverWalletId: wallet.serverWalletId,
        serverWalletAddress: wallet.serverWalletAddress,
        vaultAddress: s.vaultAddress as Address,
        amountUsd: s.amountUsd,
      });
      return {
        success: result.success,
        txHash: result.txHash,
        amountUsd: s.amountUsd,
        vaultAddress: result.vaultAddress,
        lpShares: result.lpShares?.toString(),
        error: result.error,
      };
    }

    if (s.action === 'withdraw') {
      // Read LP shares from positions context
      const position = context?.positions?.find(
        (p: any) => (p.vault_address ?? p.vaultAddress ?? '').toLowerCase() === s.vaultAddress.toLowerCase()
      );
      const lpShares = position?.lp_shares ?? position?.lpShares;

      const result = await executeYieldWithdraw({
        serverWalletId: wallet.serverWalletId,
        serverWalletAddress: wallet.serverWalletAddress,
        vaultAddress: s.vaultAddress as Address,
        lpShares: lpShares ? BigInt(lpShares) : undefined,
      });
      return {
        success: result.success,
        txHash: result.txHash,
        error: result.error,
      };
    }

    // hold — no action needed
    return { success: true };
  }

  checkGuardrails(
    signal: unknown,
    config: AgentConfigRow,
    context: GuardrailContext,
  ): GuardrailCheck {
    const s = signal as YieldSignal;
    const guardrails = getGuardrails(config);

    return checkYieldGuardrails({
      signal: s,
      guardrails,
      currentPositions: context.positions.map((p: any) => ({
        vaultAddress: p.vault_address ?? p.vaultAddress ?? '',
        depositAmountUsd: Number(p.deposit_amount_usd ?? p.depositAmountUsd ?? 0),
        depositedAt: p.deposited_at ?? p.depositedAt ?? new Date().toISOString(),
      })),
      portfolioValueUsd: context.portfolioValueUsd,
    });
  }

  getProgressSteps(): string[] {
    return ['scanning_vaults', 'analyzing_yields', 'checking_yield_guardrails', 'executing_yields'];
  }
}
