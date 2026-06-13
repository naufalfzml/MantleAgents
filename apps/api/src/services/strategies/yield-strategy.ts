import type { GuardrailCheck } from '@mantleagents/shared';
import type { YieldOpportunity, YieldSignal, YieldGuardrails, DEFAULT_YIELD_GUARDRAILS } from '@mantleagents/shared';
import { ALL_TOKEN_ADDRESSES } from '@mantleagents/shared';
import { fetchYieldOpportunities, fetchClaimableRewards } from '../merkl-client.js';
import { analyzeYieldOpportunities } from '../yield-analyzer.js';
import { executeYieldDeposit, executeYieldWithdraw } from '../yield-executor.js';
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

function getTokenSymbolByAddress(address: string): string {
  const addr = address.toLowerCase();
  for (const [symbol, a] of Object.entries(ALL_TOKEN_ADDRESSES)) {
    if (a?.toLowerCase() === addr) return symbol;
  }
  return 'Unknown';
}

/** Enriched opportunity with swap-executability metadata for the analyzer */
export interface YieldOpportunityWithSwapMeta extends YieldOpportunity {
  depositTokenSymbol: string;
  routeFromUSDC: boolean;
}

interface YieldData {
  opportunities: YieldOpportunityWithSwapMeta[];
  claimableRewards: Array<{ token: { symbol: string; address: string }; claimableAmount: string }>;
}

// Stablecoins that can be deposited directly or swapped from wallet stables
const STABLE_SYMBOLS = new Set(['USDT', 'USDC', 'USDm', 'BUSD', 'DAI', 'USD₮', 'USDD']);
const STABLE_ADDRESSES = new Set([
  '0x55d398326f99059ff775485246999027b3197955', // USDT BSC
  '0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d', // USDC BSC
  '0xe9e7cea3dedca5984780bafc599bd69add087d56', // BUSD BSC
  '0x42bbfa2e77757c645eeaad1655e0911a7553efbc', // USDm BSC
  '0xd17479997f34dd9156deef8d7a048c652c1426df', // USDD BSC
]);

/**
 * Enrich vault opportunities with deposit token info.
 * For Ichi vaults: single-sided — only one token is accepted.
 * If the vault contains a stablecoin, routeFromUSDC = true (wallet can deposit directly).
 */
async function filterVaultsByRouteAvailability(
  opportunities: YieldOpportunity[],
): Promise<YieldOpportunityWithSwapMeta[]> {
  return opportunities.map(opp => {
    // Find which token in the vault pair is a stablecoin
    const stableToken = opp.tokens?.find(
      t => STABLE_SYMBOLS.has(t.symbol) || STABLE_ADDRESSES.has(t.address?.toLowerCase() ?? '')
    );
    const depositTokenSymbol = stableToken?.symbol ?? opp.tokens?.[0]?.symbol ?? 'Unknown';
    // If vault has a stablecoin token, wallet can deposit directly from USDT/USDC
    const routeFromUSDC = !!stableToken;
    return { ...opp, depositTokenSymbol, routeFromUSDC };
  });
}

function getGuardrails(config: AgentConfigRow): YieldGuardrails {
  const params = ((config as any).strategy_params ?? {}) as Record<string, unknown>;
  return {
    minAprThreshold: (params.minAprThreshold as number) ?? 1,
    maxSingleVaultPct: (params.maxSingleVaultPct as number) ?? 80,
    minHoldPeriodDays: (params.minHoldPeriodDays as number) ?? 1,
    maxIlTolerancePct: (params.maxIlTolerancePct as number) ?? 10,
    minTvlUsd: (params.minTvlUsd as number) ?? 5_000,
    maxVaultCount: (params.maxVaultCount as number) ?? 5,
    rewardClaimFrequencyHrs: (params.rewardClaimFrequencyHrs as number) ?? 168,
    autoCompound: (params.autoCompound as boolean) ?? false,
  };
}

export class YieldStrategy implements AgentStrategy {
  type = 'yield' as const;

  async fetchData(config: AgentConfigRow, _context: StrategyContext): Promise<YieldData> {
    // Fetch all opportunities from Merkl API (doesn't support protocol filter)
    const allOpportunities = await fetchYieldOpportunities();
    console.log(`[yield-strategy] Merkl returned ${allOpportunities.length} total opportunities on BSC`);

    // Log a sample of protocol/type names to aid debugging
    const sample = allOpportunities.slice(0, 10).map(o => `${o.protocol}(type=${o.type})`).join(', ');
    console.log(`[yield-strategy] Sample protocols: ${sample}`);

    // Accept Ichi vaults (type=ICHI) AND PancakeSwap V3 CLAMM pools (type=CLAMM).
    // The executor auto-detects type via slot0() and routes to the correct logic.
    const ichiOpportunities = allOpportunities.filter(opp => {
      const type = opp.type?.toLowerCase() ?? '';
      const proto = opp.protocol?.toLowerCase() ?? '';
      return type === 'ichi' || proto.includes('ichi') || type === 'clamm';
    });
    console.log(`[yield-strategy] ${ichiOpportunities.length} Ichi/CLAMM opportunities after type/protocol filter`);

    // Filter to only vaults where a stablecoin is in the pair (wallet can deposit directly)
    const allEnriched = await filterVaultsByRouteAvailability(ichiOpportunities);
    const opportunities = allEnriched.filter(o => o.routeFromUSDC);
    console.log(`[yield-strategy] ${opportunities.length} stablecoin-compatible Ichi opportunities`);

    if (opportunities.length === 0) {
      console.warn('[yield-strategy] No Ichi stablecoin vaults found on BSC. Check Merkl API or switch chain.');
    }

    // Fetch claimable rewards for this wallet
    const claimableRewards = config.server_wallet_address
      ? await fetchClaimableRewards(config.server_wallet_address)
      : [];

    return { opportunities, claimableRewards };
  }

  async analyze(
    data: unknown,
    config: AgentConfigRow,
    context: StrategyContext,
  ): Promise<StrategyAnalysisResult> {
    const { opportunities } = data as YieldData;
    const guardrails = getGuardrails(config);

    // Build set of wallet stable symbols for matching
    const walletStableSymbols = new Set(
      (context.walletBalances ?? [])
        .filter(b => b.valueUsd > 0)
        .map(b => b.symbol.toUpperCase())
    );
    console.log(`[yield-strategy] Wallet stable tokens: ${[...walletStableSymbols].join(', ') || 'none'}`);

    // Only show pools where at least one token matches a stablecoin the user holds
    // This prevents the LLM from choosing PUFFER-USDC when user only has USDT
    const matchingOpps = walletStableSymbols.size > 0
      ? opportunities.filter(o =>
          o.tokens?.some(t => walletStableSymbols.has(t.symbol.toUpperCase()))
        )
      : opportunities;
    console.log(`[yield-strategy] ${matchingOpps.length}/${opportunities.length} pools match wallet tokens`);

    // Filter by TVL floor before analysis
    const filtered = matchingOpps.filter(o => o.tvl >= guardrails.minTvlUsd);
    console.log(`[yield-strategy] ${filtered.length}/${matchingOpps.length} opportunities pass TVL floor ($${guardrails.minTvlUsd.toLocaleString()})`);

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
        error: result.error,
      };
    }

    if (s.action === 'withdraw') {
      const result = await executeYieldWithdraw({
        serverWalletId: wallet.serverWalletId,
        serverWalletAddress: wallet.serverWalletAddress,
        vaultAddress: s.vaultAddress as Address,
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
    return ['scanning_vaults', 'analyzing_yields', 'checking_yield_guardrails', 'executing_yields', 'claiming_rewards'];
  }
}
