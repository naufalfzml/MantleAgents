import type { Database } from '@mantleagents/db';
import type { FailureCategory, GuardrailCheck } from '@mantleagents/shared';

export type AgentConfigRow = Database['public']['Tables']['agent_configs']['Row'];

export interface StrategyContext {
  positions: any[];
  portfolioValueUsd: number;
  walletBalances: WalletBalance[];
  runId: string;
}

export interface WalletBalance {
  symbol: string;
  balance: bigint;
  formatted: string;
  valueUsd: number;
}

export interface StrategyAnalysisResult {
  signals: unknown[];
  summary: string;
  sourcesUsed: number;
}

export interface ExecutionResult {
  success: boolean;
  txHash?: string;
  amountUsd?: number;
  vaultAddress?: string;
  error?: string;
  failureCategory?: FailureCategory;
  simulated?: boolean;
}

export interface WalletContext {
  serverWalletId: string;
  serverWalletAddress: string;
}

export interface GuardrailContext {
  positions: any[];
  portfolioValueUsd: number;
  dailyTradeCount: number;
  positionPrices?: Record<string, number>;
  /** Sum of USDC + USDT + USDm balances (for buy-cap and max trade % base) */
  availableBuyingPowerUsd?: number;
}

/**
 * Strategy interface — each agent type (fx, yield) implements this.
 * The cron loop dispatches to the correct strategy via getStrategy().
 */
export interface AgentStrategy {
  type: string;

  /** Fetch external data (news for FX, vault opportunities for yield) */
  fetchData(config: AgentConfigRow, context: StrategyContext): Promise<unknown>;

  /** Run LLM analysis, return signals */
  analyze(
    data: unknown,
    config: AgentConfigRow,
    context: StrategyContext,
  ): Promise<StrategyAnalysisResult>;

  /** Execute a single signal (trade for FX, deposit/withdraw for yield) */
  executeSignal(
    signal: unknown,
    wallet: WalletContext,
    config: AgentConfigRow,
  ): Promise<ExecutionResult>;

  /** Get strategy-specific guardrail checks */
  checkGuardrails(
    signal: unknown,
    config: AgentConfigRow,
    context: GuardrailContext,
  ): GuardrailCheck;

  /** Progress step names for WebSocket streaming */
  getProgressSteps(): string[];
}
