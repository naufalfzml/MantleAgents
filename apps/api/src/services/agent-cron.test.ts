const {
  insertedRowsRef,
  fromCallsRef,
  tradeCountRef,
  mockReadContract,
  mockGetPositions,
  mockCalculatePortfolioValue,
  mockEmitProgress,
  mockSubmitTradeFeedback,
  mockCreateAndAttachRunAttestation,
  mockGetStrategy,
  mockCalculateTradeAmount,
  mockEvaluateAdaptedPlan,
  mockGetWatchlist,
} = vi.hoisted(() => ({
  insertedRowsRef: { value: [] as Array<{ table: string; row: any }> },
  fromCallsRef: { value: [] as string[] },
  tradeCountRef: { value: 0 },
  mockReadContract: vi.fn(),
  mockGetPositions: vi.fn(),
  mockCalculatePortfolioValue: vi.fn(),
  mockEmitProgress: vi.fn(),
  mockSubmitTradeFeedback: vi.fn(),
  mockCreateAndAttachRunAttestation: vi.fn(),
  mockGetStrategy: vi.fn(),
  mockCalculateTradeAmount: vi.fn(),
  mockEvaluateAdaptedPlan: vi.fn(),
  mockGetWatchlist: vi.fn(),
}));

function makeQuery(table: string) {
  const chain: any = {
    select: () => chain,
    eq: () => chain,
    order: () => chain,
    limit: () => chain,
    update: () => chain,
    lte: async () => ({ data: [], error: null }),
    gte: async () => ({ count: tradeCountRef.value, error: null }),
    maybeSingle: async () => ({ data: null, error: null }),
    insert: async (row: any) => {
      insertedRowsRef.value.push({ table, row });
      return { error: null };
    },
    not: async () => ({ data: [], error: null }),
    then: (resolve: (value: any) => void) => resolve({ data: [], error: null }),
  };

  return chain;
}

vi.mock('@mantleagents/db', () => ({
  createSupabaseAdmin: () => ({
    from: (table: string) => {
      fromCallsRef.value.push(table);
      return makeQuery(table);
    },
  }),
}));

vi.mock('viem', async (importOriginal) => {
  const actual = await importOriginal<typeof import('viem')>();
  return {
    ...actual,
    createPublicClient: vi.fn(() => ({
      readContract: mockReadContract,
    })),
    http: vi.fn(() => undefined),
  };
});

vi.mock('./position-tracker.js', () => ({
  getPositions: mockGetPositions,
  calculatePortfolioValue: mockCalculatePortfolioValue,
  updatePositionAfterTrade: vi.fn(),
}));

vi.mock('./yield-position-tracker.js', () => ({
  upsertYieldPositionAfterDeposit: vi.fn(),
  clearYieldPositionAfterWithdraw: vi.fn(),
  syncYieldPositionsFromChain: vi.fn(),
}));

vi.mock('./agent-events.js', () => ({
  emitProgress: mockEmitProgress,
}));

vi.mock('./agent-registry.js', () => ({
  submitTradeFeedback: mockSubmitTradeFeedback,
}));

vi.mock('./attestation-service.js', () => ({
  createAndAttachRunAttestation: mockCreateAndAttachRunAttestation,
}));

vi.mock('./strategies/index.js', () => ({
  getStrategy: mockGetStrategy,
}));

vi.mock('./rules-engine.js', () => ({
  calculateTradeAmount: mockCalculateTradeAmount,
  evaluateAdaptedPlan: mockEvaluateAdaptedPlan,
}));

vi.mock('./token-monitor.js', () => ({
  getWatchlist: mockGetWatchlist,
}));

import { MAX_ADAPTATIONS_PER_TICK } from '@mantleagents/shared';
import { getTradeCountToday, logTimeline, runAgentCycle } from './agent-cron.js';

function makeConfig(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'cfg-1',
    wallet_address: '0xAGENT',
    server_wallet_address: '0xSERVER',
    server_wallet_id: 'sw-1',
    active: true,
    frequency: 'daily',
    max_trade_size_pct: 25,
    max_allocation_pct: 20,
    stop_loss_pct: 10,
    daily_trade_limit: 3,
    allowed_currencies: ['EURm', 'GBPm', 'ALT'],
    blocked_currencies: [],
    custom_prompt: null,
    agent_type: 'fx',
    agent_8004_id: null,
    last_run_at: null,
    next_run_at: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  } as any;
}

function makeSignal(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    currency: 'EURm',
    direction: 'buy',
    confidence: 90,
    reasoning: 'Momentum is improving',
    amountUsd: 100,
    ...overrides,
  };
}

function makeStrategy() {
  return {
    getProgressSteps: vi.fn(() => ['fetching_news', 'analyzing', 'checking_signals', 'executing_trades']),
    fetchData: vi.fn().mockResolvedValue({}),
    analyze: vi.fn().mockResolvedValue({
      signals: [makeSignal()],
      summary: 'One actionable signal',
      sourcesUsed: 1,
    }),
    checkGuardrails: vi.fn().mockReturnValue({ passed: true }),
    executeSignal: vi.fn(),
  };
}

function timelineRows() {
  return insertedRowsRef.value
    .filter((entry) => entry.table === 'fx_agent_timeline')
    .map((entry) => entry.row);
}

beforeEach(() => {
  insertedRowsRef.value = [];
  fromCallsRef.value = [];
  tradeCountRef.value = 0;

  vi.clearAllMocks();

  mockReadContract.mockResolvedValue(100000000000000000000n);
  mockGetPositions.mockResolvedValue([]);
  mockCalculatePortfolioValue.mockResolvedValue(0);
  mockCreateAndAttachRunAttestation.mockResolvedValue(undefined);
  mockGetWatchlist.mockResolvedValue([]);
  mockCalculateTradeAmount.mockReturnValue(100);
  mockEvaluateAdaptedPlan.mockReset();
  mockSubmitTradeFeedback.mockResolvedValue(undefined);
});

describe('logTimeline', () => {
  it('writes to the agent-type specific timeline table', async () => {
    await logTimeline(
      '0xABC',
      'decision_adapted',
      {
        summary: 'adapted',
        detail: { strategy: 'reduce_amount' },
      },
      'run-1',
      'yield',
    );

    expect(insertedRowsRef.value).toHaveLength(1);
    expect(insertedRowsRef.value[0]).toEqual({
      table: 'yield_agent_timeline',
      row: expect.objectContaining({
        wallet_address: '0xABC',
        event_type: 'decision_adapted',
        summary: 'adapted',
        run_id: 'run-1',
      }),
    });
  });
});

describe('getTradeCountToday', () => {
  it('queries the correct timeline table and returns the count', async () => {
    tradeCountRef.value = 4;

    const count = await getTradeCountToday('0xAGENT', 'fx');

    expect(count).toBe(4);
    expect(fromCallsRef.value).toContain('fx_agent_timeline');
  });
});

describe('runAgentCycle adaptive execution', () => {
  it('logs decision_input before trade execution and passes agentId into attestation creation', async () => {
    const strategy = makeStrategy();
    strategy.executeSignal.mockResolvedValue({
      success: true,
      txHash: '0xabc',
      amountUsd: 100,
    });
    mockGetStrategy.mockReturnValue(strategy);

    await runAgentCycle(makeConfig({ agent_8004_id: 42 }));

    const rows = timelineRows();
    const decisionRow = rows.find((row) => row.event_type === 'decision_input');
    const tradeRow = rows.find((row) => row.event_type === 'trade');

    expect(decisionRow).toBeDefined();
    expect(tradeRow).toBeDefined();
    expect(rows.findIndex((row) => row.event_type === 'decision_input')).toBeLessThan(
      rows.findIndex((row) => row.event_type === 'trade'),
    );
    expect(() => JSON.parse(decisionRow.summary)).not.toThrow();
    expect(JSON.parse(decisionRow.summary)).toEqual(
      expect.objectContaining({
        signal: expect.any(Object),
        guardrailParams: expect.any(Object),
        marketDataSnapshot: expect.any(Object),
      }),
    );
    expect(mockCreateAndAttachRunAttestation).toHaveBeenCalledWith(
      expect.objectContaining({
        agentId: 42n,
      }),
    );
  });

  it('emits decision_adapted and retries exactly once after a slippage failure', async () => {
    const strategy = makeStrategy();
    strategy.executeSignal
      .mockResolvedValueOnce({
        success: false,
        amountUsd: 100,
        error: 'slippage too high',
        failureCategory: 'slippage_exceeded',
      })
      .mockResolvedValueOnce({
        success: true,
        txHash: '0x123',
        amountUsd: 50,
      });
    mockGetStrategy.mockReturnValue(strategy);
    mockEvaluateAdaptedPlan.mockReturnValue({
      originalSignal: makeSignal({ amountUsd: 100 }),
      adaptedSignal: makeSignal({ amountUsd: 50 }),
      reason: 'Reduced after slippage',
      strategy: 'reduce_amount',
    });

    await runAgentCycle(makeConfig());

    const rows = timelineRows();
    const eventTypes = rows.map((row) => row.event_type);
    const decisionIndex = eventTypes.indexOf('decision_adapted');
    const tradeIndex = eventTypes.lastIndexOf('trade');

    expect(strategy.executeSignal).toHaveBeenCalledTimes(2);
    expect(mockEvaluateAdaptedPlan).toHaveBeenCalledTimes(1);
    expect(decisionIndex).toBeGreaterThan(-1);
    expect(tradeIndex).toBeGreaterThan(decisionIndex);
    expect(eventTypes.filter((type) => type === 'decision_adapted')).toHaveLength(1);
  });

  it('stops after one adapted retry when execution keeps failing', async () => {
    const strategy = makeStrategy();
    strategy.executeSignal.mockResolvedValue({
      success: false,
      amountUsd: 100,
      error: 'slippage too high',
      failureCategory: 'slippage_exceeded',
    });
    mockGetStrategy.mockReturnValue(strategy);
    mockEvaluateAdaptedPlan.mockReturnValue({
      originalSignal: makeSignal({ amountUsd: 100 }),
      adaptedSignal: makeSignal({ amountUsd: 50 }),
      reason: 'Reduced after slippage',
      strategy: 'reduce_amount',
    });

    await runAgentCycle(makeConfig());

    const rows = timelineRows();
    const tradeFailedRows = rows.filter((row) => row.event_type === 'trade_failed');
    const decisionRows = rows.filter((row) => row.event_type === 'decision_adapted');

    expect(strategy.executeSignal).toHaveBeenCalledTimes(MAX_ADAPTATIONS_PER_TICK + 1);
    expect(tradeFailedRows).toHaveLength(2);
    expect(decisionRows).toHaveLength(1);
  });

  it('emits decision_adapted with adaptedPlan null and does not retry when risk flagged has no alternative', async () => {
    const strategy = makeStrategy();
    strategy.executeSignal.mockResolvedValueOnce({
      success: false,
      amountUsd: 100,
      error: 'risk check flagged token',
      failureCategory: 'risk_flagged',
    });
    mockGetStrategy.mockReturnValue(strategy);
    mockGetWatchlist.mockResolvedValue([]);
    mockEvaluateAdaptedPlan.mockReturnValue(null);

    await runAgentCycle(makeConfig());

    const decisionRow = timelineRows().find((row) => row.event_type === 'decision_adapted');

    expect(strategy.executeSignal).toHaveBeenCalledTimes(1);
    expect(decisionRow).toBeDefined();
    expect(JSON.parse(decisionRow!.summary)).toMatchObject({
      reason: 'risk_flagged',
      adaptedPlan: null,
    });
  });

  it('does not adapt when the first execution succeeds', async () => {
    const strategy = makeStrategy();
    strategy.executeSignal.mockResolvedValueOnce({
      success: true,
      txHash: '0xabc',
      amountUsd: 100,
    });
    mockGetStrategy.mockReturnValue(strategy);

    await runAgentCycle(makeConfig());

    const rows = timelineRows();

    expect(mockEvaluateAdaptedPlan).not.toHaveBeenCalled();
    expect(rows.some((row) => row.event_type === 'decision_adapted')).toBe(false);
    expect(strategy.executeSignal).toHaveBeenCalledTimes(1);
  });
});
