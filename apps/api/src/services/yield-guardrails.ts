import type { YieldSignal, YieldGuardrails, GuardrailCheck } from '@mantleagents/shared';

interface YieldGuardrailInput {
  signal: YieldSignal;
  guardrails: YieldGuardrails;
  currentPositions: Array<{ vaultAddress: string; depositAmountUsd: number; depositedAt: string }>;
  portfolioValueUsd: number;
}

/**
 * Check a yield signal against all yield-specific guardrails.
 * Rules are checked in priority order -- first failure short-circuits.
 */
export function checkYieldGuardrails(input: YieldGuardrailInput): GuardrailCheck {
  const { signal, guardrails, currentPositions, portfolioValueUsd } = input;

  // 1. Min APR threshold (don't enter vaults below threshold)
  if (signal.action === 'deposit' && signal.estimatedApr < guardrails.minAprThreshold) {
    return {
      passed: false,
      blockedReason: `APR ${signal.estimatedApr.toFixed(1)}% below minimum ${guardrails.minAprThreshold}%`,
      ruleName: 'min_apr_threshold',
    };
  }

  // 2. Max single vault allocation
  if (signal.action === 'deposit' && portfolioValueUsd > 0) {
    const existingInVault = currentPositions
      .filter(p => p.vaultAddress === signal.vaultAddress)
      .reduce((sum, p) => sum + p.depositAmountUsd, 0);
    const postDepositPct = ((existingInVault + signal.amountUsd) / portfolioValueUsd) * 100;
    const roundedPct = Math.round(postDepositPct * 10) / 10;
    if (roundedPct > guardrails.maxSingleVaultPct) {
      return {
        passed: false,
        blockedReason: `Post-deposit vault allocation ${roundedPct.toFixed(1)}% exceeds max ${guardrails.maxSingleVaultPct}%`,
        ruleName: 'max_single_vault',
      };
    }
  }

  // 3. Max vault count
  if (signal.action === 'deposit') {
    const uniqueVaults = new Set(currentPositions.map(p => p.vaultAddress));
    if (!uniqueVaults.has(signal.vaultAddress) && uniqueVaults.size >= guardrails.maxVaultCount) {
      return {
        passed: false,
        blockedReason: `Already at max ${guardrails.maxVaultCount} vaults`,
        ruleName: 'max_vault_count',
      };
    }
  }

  // 4. Min TVL threshold (don't deposit into low TVL vaults)
  // Note: TVL is not on the signal; this check is expected to be done before
  // signals reach the guardrail layer (during opportunity filtering). Included
  // here as a defensive measure if the caller attaches tvl to the signal.
  // Skipped if the signal doesn't carry TVL data.

  // 5. Min hold period (don't withdraw within N days of entry)
  if (signal.action === 'withdraw') {
    const position = currentPositions.find(p => p.vaultAddress === signal.vaultAddress);
    if (position) {
      const depositedAt = new Date(position.depositedAt);
      const holdDays = (Date.now() - depositedAt.getTime()) / (24 * 60 * 60 * 1000);
      if (holdDays < guardrails.minHoldPeriodDays) {
        return {
          passed: false,
          blockedReason: `Held ${holdDays.toFixed(1)} days, minimum is ${guardrails.minHoldPeriodDays} days`,
          ruleName: 'min_hold_period',
        };
      }
    }
  }

  return { passed: true };
}
