import {
  buildYieldSystemPrompt,
  buildYieldAnalysisPrompt,
} from './yield-analyzer.js';
import type { YieldOpportunity } from '@mantleagents/shared';

function makeOpportunity(overrides: Partial<YieldOpportunity> = {}): YieldOpportunity {
  return {
    id: 'opp-1',
    name: 'Ichi USD₮-WETH vault',
    vaultAddress: '0x46689E56aF9b3c9f7D88F2A987264D07C0815e14',
    protocol: 'Ichi',
    status: 'active',
    apr: 30.9,
    tvl: 100_000,
    dailyRewards: 10,
    tokens: [
      { symbol: 'USDT', address: '0x123', decimals: 6 },
      { symbol: 'WETH', address: '0x456', decimals: 18 },
    ],
    ...overrides,
  };
}

describe('buildYieldSystemPrompt', () => {
  it('includes swap-then-deposit rule when building system prompt', () => {
    const prompt = buildYieldSystemPrompt({
      opportunities: [],
      currentPositions: [],
      portfolioValueUsd: 100,
      guardrails: {
        minAprThreshold: 5,
        maxSingleVaultPct: 40,
        minHoldPeriodDays: 3,
        maxIlTolerancePct: 10,
        minTvlUsd: 50_000,
        maxVaultCount: 5,
        rewardClaimFrequencyHrs: 168,
        autoCompound: false,
      },
      walletBalances: [{ symbol: 'USDC', formatted: '100', valueUsd: 100 }],
    });

    expect(prompt).toContain('Swap-then-deposit');
    expect(prompt).toContain('routeFromUSDC=true');
    expect(prompt).toContain('recommend DEPOSIT (not hold)');
    expect(prompt).toContain('USDC, USDT, or USDm');
  });

  it('includes rule to never suggest swapping from volatile assets', () => {
    const prompt = buildYieldSystemPrompt({
      opportunities: [],
      currentPositions: [],
      portfolioValueUsd: 100,
      guardrails: {
        minAprThreshold: 5,
        maxSingleVaultPct: 40,
        minHoldPeriodDays: 3,
        maxIlTolerancePct: 10,
        minTvlUsd: 50_000,
        maxVaultCount: 5,
        rewardClaimFrequencyHrs: 168,
        autoCompound: false,
      },
    });

    expect(prompt).toContain('Never suggest swapping from volatile assets');
    expect(prompt).toContain('WETH');
    expect(prompt).toContain('WBTC');
    expect(prompt).toContain('USDC, USDT, and USDm');
  });
});

describe('buildYieldAnalysisPrompt', () => {
  it('includes deposit token and swap-from-USDC when metadata present', () => {
    const opp = makeOpportunity();
    const oppWithMeta = {
      ...opp,
      depositTokenSymbol: 'USDT',
      routeFromUSDC: true,
    };

    const prompt = buildYieldAnalysisPrompt({
      opportunities: [oppWithMeta],
      currentPositions: [],
      portfolioValueUsd: 100,
      guardrails: {
        minAprThreshold: 5,
        maxSingleVaultPct: 40,
        minHoldPeriodDays: 3,
        maxIlTolerancePct: 10,
        minTvlUsd: 50_000,
        maxVaultCount: 5,
        rewardClaimFrequencyHrs: 168,
        autoCompound: false,
      },
    });

    expect(prompt).toContain('Deposit token: USDT');
    expect(prompt).toContain('swap-from-USDC: yes');
    expect(prompt).toContain('system can swap USDC/USDT/USDm to deposit token');
  });

  it('uses fallback when metadata absent', () => {
    const opp = makeOpportunity();

    const prompt = buildYieldAnalysisPrompt({
      opportunities: [opp],
      currentPositions: [],
      portfolioValueUsd: 100,
      guardrails: {
        minAprThreshold: 5,
        maxSingleVaultPct: 40,
        minHoldPeriodDays: 3,
        maxIlTolerancePct: 10,
        minTvlUsd: 50_000,
        maxVaultCount: 5,
        rewardClaimFrequencyHrs: 168,
        autoCompound: false,
      },
    });

    expect(prompt).toContain('Deposit token: see Tokens');
    expect(prompt).not.toContain('swap-from-USDC: yes');
  });
});
