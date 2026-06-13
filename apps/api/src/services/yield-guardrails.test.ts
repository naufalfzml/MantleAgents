import { checkYieldGuardrails } from './yield-guardrails.js';
import type { YieldSignal, YieldGuardrails } from '@mantleagents/shared';

// Helper: Create a yield signal with defaults
function makeSignal(overrides: Partial<YieldSignal> = {}): YieldSignal {
  return {
    vaultAddress: '0xVault1',
    vaultName: 'Test Vault',
    action: 'deposit',
    amountUsd: 100,
    allocationPct: 10,
    confidence: 85,
    reasoning: 'High APR with low risk',
    estimatedApr: 15,
    riskLevel: 'low',
    ...overrides,
  };
}

// Helper: Create guardrails with defaults
function makeGuardrails(overrides: Partial<YieldGuardrails> = {}): YieldGuardrails {
  return {
    minAprThreshold: 5,
    maxSingleVaultPct: 30,
    minHoldPeriodDays: 7,
    maxIlTolerancePct: 5,
    minTvlUsd: 100000,
    maxVaultCount: 5,
    rewardClaimFrequencyHrs: 168,
    autoCompound: true,
    ...overrides,
  };
}

// Helper: Create position data
function makePosition(overrides: Partial<{ vaultAddress: string; depositAmountUsd: number; depositedAt: string }> = {}) {
  return {
    vaultAddress: '0xVault1',
    depositAmountUsd: 500,
    depositedAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days ago
    ...overrides,
  };
}

describe('checkYieldGuardrails', () => {
  describe('deposit signals', () => {
    it('should pass when all guardrails satisfied', () => {
      const signal = makeSignal({ action: 'deposit', amountUsd: 100, estimatedApr: 15 });
      const guardrails = makeGuardrails({ minAprThreshold: 5, maxSingleVaultPct: 30 });
      const currentPositions = [makePosition({ vaultAddress: '0xVault1', depositAmountUsd: 200 })];
      const portfolioValueUsd = 1000;

      const result = checkYieldGuardrails({ signal, guardrails, currentPositions, portfolioValueUsd });

      expect(result.passed).toBe(true);
    });

    it('should block when APR below threshold', () => {
      const signal = makeSignal({ action: 'deposit', estimatedApr: 3 });
      const guardrails = makeGuardrails({ minAprThreshold: 5 });
      const currentPositions = [];
      const portfolioValueUsd = 1000;

      const result = checkYieldGuardrails({ signal, guardrails, currentPositions, portfolioValueUsd });

      expect(result.passed).toBe(false);
      expect(result.ruleName).toBe('min_apr_threshold');
      expect(result.blockedReason).toContain('APR 3.0%');
      expect(result.blockedReason).toContain('minimum 5%');
    });

    it('should block when allocation exceeds max single vault %', () => {
      const signal = makeSignal({ action: 'deposit', vaultAddress: '0xVault1', amountUsd: 400 });
      const guardrails = makeGuardrails({ maxSingleVaultPct: 30 });
      const currentPositions = [makePosition({ vaultAddress: '0xVault1', depositAmountUsd: 200 })];
      const portfolioValueUsd = 1000; // 200 + 400 = 600, which is 60%

      const result = checkYieldGuardrails({ signal, guardrails, currentPositions, portfolioValueUsd });

      expect(result.passed).toBe(false);
      expect(result.ruleName).toBe('max_single_vault');
      expect(result.blockedReason).toContain('60.0%');
      expect(result.blockedReason).toContain('exceeds max 30%');
    });

    it('should block when at max vault count and depositing to new vault', () => {
      const signal = makeSignal({ action: 'deposit', vaultAddress: '0xVault6' });
      const guardrails = makeGuardrails({ maxVaultCount: 5 });
      const currentPositions = [
        makePosition({ vaultAddress: '0xVault1', depositAmountUsd: 100 }),
        makePosition({ vaultAddress: '0xVault2', depositAmountUsd: 100 }),
        makePosition({ vaultAddress: '0xVault3', depositAmountUsd: 100 }),
        makePosition({ vaultAddress: '0xVault4', depositAmountUsd: 100 }),
        makePosition({ vaultAddress: '0xVault5', depositAmountUsd: 100 }),
      ];
      const portfolioValueUsd = 1000;

      const result = checkYieldGuardrails({ signal, guardrails, currentPositions, portfolioValueUsd });

      expect(result.passed).toBe(false);
      expect(result.ruleName).toBe('max_vault_count');
      expect(result.blockedReason).toContain('Already at max 5 vaults');
    });

    it('should allow when at max vault count but depositing to existing vault', () => {
      const signal = makeSignal({ action: 'deposit', vaultAddress: '0xVault1', amountUsd: 50 });
      const guardrails = makeGuardrails({ maxVaultCount: 5, maxSingleVaultPct: 30 });
      const currentPositions = [
        makePosition({ vaultAddress: '0xVault1', depositAmountUsd: 100 }),
        makePosition({ vaultAddress: '0xVault2', depositAmountUsd: 100 }),
        makePosition({ vaultAddress: '0xVault3', depositAmountUsd: 100 }),
        makePosition({ vaultAddress: '0xVault4', depositAmountUsd: 100 }),
        makePosition({ vaultAddress: '0xVault5', depositAmountUsd: 100 }),
      ];
      const portfolioValueUsd = 1000;

      const result = checkYieldGuardrails({ signal, guardrails, currentPositions, portfolioValueUsd });

      expect(result.passed).toBe(true);
    });

    it('should skip allocation check when portfolio value is zero', () => {
      const signal = makeSignal({ action: 'deposit', amountUsd: 100 });
      const guardrails = makeGuardrails({ maxSingleVaultPct: 30 });
      const currentPositions = [];
      const portfolioValueUsd = 0;

      const result = checkYieldGuardrails({ signal, guardrails, currentPositions, portfolioValueUsd });

      expect(result.passed).toBe(true);
    });
  });

  describe('withdraw signals', () => {
    it('should block when hold period not met', () => {
      const signal = makeSignal({ action: 'withdraw', vaultAddress: '0xVault1', amountUsd: 100 });
      const guardrails = makeGuardrails({ minHoldPeriodDays: 7 });
      const depositedAt = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(); // 3 days ago
      const currentPositions = [makePosition({ vaultAddress: '0xVault1', depositAmountUsd: 500, depositedAt })];
      const portfolioValueUsd = 1000;

      const result = checkYieldGuardrails({ signal, guardrails, currentPositions, portfolioValueUsd });

      expect(result.passed).toBe(false);
      expect(result.ruleName).toBe('min_hold_period');
      expect(result.blockedReason).toContain('Held 3.0 days');
      expect(result.blockedReason).toContain('minimum is 7 days');
    });

    it('should pass when hold period exceeded', () => {
      const signal = makeSignal({ action: 'withdraw', vaultAddress: '0xVault1', amountUsd: 100 });
      const guardrails = makeGuardrails({ minHoldPeriodDays: 7 });
      const depositedAt = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(); // 10 days ago
      const currentPositions = [makePosition({ vaultAddress: '0xVault1', depositAmountUsd: 500, depositedAt })];
      const portfolioValueUsd = 1000;

      const result = checkYieldGuardrails({ signal, guardrails, currentPositions, portfolioValueUsd });

      expect(result.passed).toBe(true);
    });

    it('should pass when withdrawing from vault with no position record', () => {
      const signal = makeSignal({ action: 'withdraw', vaultAddress: '0xVault2', amountUsd: 100 });
      const guardrails = makeGuardrails({ minHoldPeriodDays: 7 });
      const currentPositions = [makePosition({ vaultAddress: '0xVault1', depositAmountUsd: 500 })];
      const portfolioValueUsd = 1000;

      const result = checkYieldGuardrails({ signal, guardrails, currentPositions, portfolioValueUsd });

      expect(result.passed).toBe(true);
    });
  });

  describe('hold signals', () => {
    it('should always pass for hold signals', () => {
      const signal = makeSignal({ action: 'hold' });
      const guardrails = makeGuardrails();
      const currentPositions = [];
      const portfolioValueUsd = 1000;

      const result = checkYieldGuardrails({ signal, guardrails, currentPositions, portfolioValueUsd });

      expect(result.passed).toBe(true);
    });

    it('should pass hold signals even with strict guardrails', () => {
      const signal = makeSignal({ action: 'hold', estimatedApr: 1 }); // Low APR
      const guardrails = makeGuardrails({ minAprThreshold: 10, maxVaultCount: 1 });
      const currentPositions = [
        makePosition({ vaultAddress: '0xVault1' }),
        makePosition({ vaultAddress: '0xVault2' }),
        makePosition({ vaultAddress: '0xVault3' }),
      ];
      const portfolioValueUsd = 1000;

      const result = checkYieldGuardrails({ signal, guardrails, currentPositions, portfolioValueUsd });

      expect(result.passed).toBe(true);
    });
  });

  describe('edge cases', () => {
    it('should handle multiple positions in same vault when checking allocation', () => {
      const signal = makeSignal({ action: 'deposit', vaultAddress: '0xVault1', amountUsd: 100 });
      const guardrails = makeGuardrails({ maxSingleVaultPct: 30 });
      const currentPositions = [
        makePosition({ vaultAddress: '0xVault1', depositAmountUsd: 100 }),
        makePosition({ vaultAddress: '0xVault1', depositAmountUsd: 100 }),
        makePosition({ vaultAddress: '0xVault2', depositAmountUsd: 200 }),
      ];
      const portfolioValueUsd = 1000; // 200 + 100 = 300, which is 30%

      const result = checkYieldGuardrails({ signal, guardrails, currentPositions, portfolioValueUsd });

      expect(result.passed).toBe(true);
    });

    it('should handle empty positions array', () => {
      const signal = makeSignal({ action: 'deposit', amountUsd: 100 });
      const guardrails = makeGuardrails();
      const currentPositions = [];
      const portfolioValueUsd = 1000;

      const result = checkYieldGuardrails({ signal, guardrails, currentPositions, portfolioValueUsd });

      expect(result.passed).toBe(true);
    });

    it('should calculate hold period precisely at boundary', () => {
      const signal = makeSignal({ action: 'withdraw', vaultAddress: '0xVault1' });
      const guardrails = makeGuardrails({ minHoldPeriodDays: 7 });
      const depositedAt = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(); // exactly 7 days
      const currentPositions = [makePosition({ vaultAddress: '0xVault1', depositedAt })];
      const portfolioValueUsd = 1000;

      const result = checkYieldGuardrails({ signal, guardrails, currentPositions, portfolioValueUsd });

      expect(result.passed).toBe(true);
    });
  });
});
