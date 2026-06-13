import type {
  AdaptedPlan,
  FailureCategory,
  GuardrailCheck,
  TradeSignal,
  Signal,
} from '@mantleagents/shared';

const MIN_TRADE_AMOUNT_USD = 0.1;

export interface AgentConfigForRules {
  /** Max trade size as % of available buying power (1-100). Computed maxTradeUsd = availableBuyingPowerUsd * (pct/100). */
  maxTradeSizePct: number;
  maxAllocationPct: number;
  stopLossPct: number;
  dailyTradeLimit: number;
  allowedCurrencies: string[];
  blockedCurrencies: string[];
  /** For buys: max $ = availableBuyingPowerUsd * (maxTradeSizePct/100). For sells: use position-based cap. */
  availableBuyingPowerUsd?: number;
}

export interface PositionForRules {
  tokenSymbol: string;
  balance: number;
  avgEntryRate: number;
}

export interface WatchlistCandidate {
  token_symbol: string;
  token_address?: string;
  chain?: string;
  risk_score?: {
    risk_level?: string;
    honeypot?: boolean;
  } | null;
}

export interface AdaptedPlanEvaluationContext {
  positions?: PositionForRules[];
  portfolioValueUsd?: number;
  tradesToday?: number;
  positionPrices?: Record<string, number>;
  availableBuyingPowerUsd?: number;
}

/**
 * Check a trading signal against all user guardrails.
 * Rules are checked in priority order — first failure short-circuits.
 */
export function checkGuardrails(params: {
  signal: Signal;
  config: AgentConfigForRules;
  positions: PositionForRules[];
  portfolioValueUsd: number;
  tradesToday: number;
  tradeAmountUsd: number;
  positionPrices?: Record<string, number>;
  /** For buys: sum of USDC+USDT+USDm. For sells: used to derive position value. */
  availableBuyingPowerUsd?: number;
}): GuardrailCheck {
  const { signal, config, positions, portfolioValueUsd, tradesToday, tradeAmountUsd, positionPrices, availableBuyingPowerUsd } = params;

  // 1. Currency must be allowed and not blocked
  if (config.allowedCurrencies.length > 0 && !config.allowedCurrencies.includes(signal.currency)) {
    return {
      passed: false,
      blockedReason: `${signal.currency} is not in allowed currencies`,
      ruleName: 'allowed_currencies',
    };
  }

  if (config.blockedCurrencies.includes(signal.currency)) {
    return {
      passed: false,
      blockedReason: `${signal.currency} is blocked`,
      ruleName: 'blocked_currencies',
    };
  }

  // 2. Daily trade limit
  if (tradesToday >= config.dailyTradeLimit) {
    return {
      passed: false,
      blockedReason: `Daily trade limit reached (${config.dailyTradeLimit})`,
      ruleName: 'daily_trade_limit',
    };
  }

  // 3. Max trade size (% of available balance for buys, % of position for sells)
  const pct = config.maxTradeSizePct;
  let maxTradeUsd: number;
  if (signal.direction === 'buy') {
    const base = config.availableBuyingPowerUsd ?? availableBuyingPowerUsd ?? 0;
    maxTradeUsd = base * (pct / 100);
  } else {
    const position = positions.find((p) => p.tokenSymbol === signal.currency);
    const priceUsd = positionPrices?.[signal.currency] ?? 1;
    const positionValueUsd = (position?.balance ?? 0) * priceUsd;
    if (positionValueUsd <= 0) {
      // No position to sell — block (execution would fail anyway)
      if (tradeAmountUsd > 0) {
        return {
          passed: false,
          blockedReason: `No position in ${signal.currency} to sell`,
          ruleName: 'max_trade_size',
        };
      }
    }
    maxTradeUsd = positionValueUsd * (pct / 100);
  }
  if (maxTradeUsd > 0 && tradeAmountUsd > maxTradeUsd) {
    return {
      passed: false,
      blockedReason: `Trade size $${tradeAmountUsd.toFixed(2)} exceeds max ${pct}% ($${maxTradeUsd.toFixed(2)})`,
      ruleName: 'max_trade_size',
    };
  }

  // 4. Max allocation per currency (only applies to buys)
  if (signal.direction === 'buy' && portfolioValueUsd > 0) {
    const currentPosition = positions.find((p) => p.tokenSymbol === signal.currency);
    const priceUsd = positionPrices?.[signal.currency] ?? 1;
    const currentValueUsd = (currentPosition?.balance ?? 0) * priceUsd;
    const postTradeValueUsd = currentValueUsd + tradeAmountUsd;
    const postTradeAllocationPct = (postTradeValueUsd / (portfolioValueUsd + tradeAmountUsd)) * 100;

    if (postTradeAllocationPct > config.maxAllocationPct) {
      return {
        passed: false,
        blockedReason: `Post-trade allocation ${postTradeAllocationPct.toFixed(1)}% exceeds max ${config.maxAllocationPct}%`,
        ruleName: 'max_allocation',
      };
    }
  }

  // 5. Stop-loss check (only applies to sells)
  if (signal.direction === 'sell') {
    const position = positions.find((p) => p.tokenSymbol === signal.currency);
    if (position && position.balance > 0 && position.avgEntryRate > 0) {
      const currentPriceUsd = positionPrices?.[signal.currency] ?? 1;
      const lossPct = ((currentPriceUsd - position.avgEntryRate) / position.avgEntryRate) * 100;
      if (lossPct < -config.stopLossPct) {
        return {
          passed: false,
          blockedReason: `Loss ${lossPct.toFixed(1)}% exceeds stop-loss threshold ${config.stopLossPct}%`,
          ruleName: 'stop_loss',
        };
      }
    }
  }

  return { passed: true };
}

function passesWatchlistRiskChecks(candidate: WatchlistCandidate): boolean {
  const riskLevel = candidate.risk_score?.risk_level?.toUpperCase();
  if (candidate.risk_score?.honeypot) return false;
  return riskLevel !== 'HIGH' && riskLevel !== 'CRITICAL';
}

function validateAdaptedSignal(
  signal: TradeSignal,
  config: AgentConfigForRules,
  context: AdaptedPlanEvaluationContext,
): GuardrailCheck {
  return checkGuardrails({
    signal,
    config,
    positions: context.positions ?? [],
    portfolioValueUsd: context.portfolioValueUsd ?? 0,
    tradesToday: context.tradesToday ?? 0,
    tradeAmountUsd: signal.amountUsd,
    positionPrices: context.positionPrices,
    availableBuyingPowerUsd: context.availableBuyingPowerUsd ?? config.availableBuyingPowerUsd,
  });
}

export function evaluateAdaptedPlan(
  originalSignal: TradeSignal,
  failureCategory: FailureCategory,
  config: AgentConfigForRules,
  watchlistCandidates: WatchlistCandidate[],
  context: AdaptedPlanEvaluationContext = {},
): AdaptedPlan | null {
  if (failureCategory === 'other' || failureCategory === 'insufficient_funds') {
    return null;
  }

  if (failureCategory === 'slippage_exceeded') {
    const reducedAmountUsd = Number((originalSignal.amountUsd * 0.5).toFixed(8));
    if (reducedAmountUsd < MIN_TRADE_AMOUNT_USD) {
      return null;
    }

    const adaptedSignal: TradeSignal = {
      ...originalSignal,
      amountUsd: reducedAmountUsd,
    };
    const guardrailCheck = validateAdaptedSignal(adaptedSignal, config, context);
    if (!guardrailCheck.passed) {
      return null;
    }

    return {
      originalSignal,
      adaptedSignal,
      reason: 'Reduced trade size after slippage exceeded the configured limit',
      strategy: 'reduce_amount',
    };
  }

  for (const candidate of watchlistCandidates) {
    if (!passesWatchlistRiskChecks(candidate)) {
      continue;
    }

    const adaptedSignal: TradeSignal = {
      ...originalSignal,
      currency: candidate.token_symbol,
    };
    const guardrailCheck = validateAdaptedSignal(adaptedSignal, config, context);
    if (!guardrailCheck.passed) {
      continue;
    }

    return {
      originalSignal,
      adaptedSignal,
      reason: `Switched to watchlist alternative ${candidate.token_symbol} after risk flag`,
      strategy: 'alternative_token',
    };
  }

  return null;
}

/**
 * Calculate trade amount based on confidence score and max trade size.
 * Higher confidence = larger trade.
 */
export function calculateTradeAmount(confidence: number, maxTradeSizeUsd: number): number {
  if (confidence >= 90) return maxTradeSizeUsd;
  if (confidence >= 80) return maxTradeSizeUsd * 0.75;
  if (confidence >= 70) return maxTradeSizeUsd * 0.5;
  if (confidence >= 60) return maxTradeSizeUsd * 0.25;
  return 0;
}
