import Fastify from 'fastify';
import { agentRoutes } from './agent';

// ---------------------------------------------------------------------------
// Mock Supabase – chainable query builder
// ---------------------------------------------------------------------------

/** Each call record tracks a table + chained method calls for assertions. */
interface CallRecord {
  table: string;
  methods: Array<{ name: string; args: unknown[] }>;
  /** The value the terminal `.then()` will resolve to. */
  _result: { data: unknown; error: unknown; count?: number | null };
}

type MockResult = { data: unknown; error: unknown; count?: number | null };

/**
 * State shared between the hoisted mock and the test body.
 * `vi.hoisted` runs before `vi.mock` factories execute, so these
 * references are available when the mock factory is called.
 */
const {
  callRecordsRef,
  mockResultsRef,
  mockSupabaseClient,
} = vi.hoisted(() => {
  /** Mutable container so tests can reset/read the array by reference. */
  const callRecordsRef: { value: CallRecord[] } = { value: [] };
  const mockResultsRef: { value: Record<string, MockResult | MockResult[]> } = { value: {} };

  function getNextResult(table: string): MockResult {
    const entry = mockResultsRef.value[table];
    if (!entry) return { data: null, error: null, count: null };
    if (Array.isArray(entry)) {
      return entry.shift() ?? { data: null, error: null, count: null };
    }
    return entry;
  }

  function createChainableMock(table: string): Record<string, unknown> {
    const record: CallRecord = { table, methods: [], _result: { data: null, error: null, count: null } };
    callRecordsRef.value.push(record);

    const chainMethods = [
      'select', 'insert', 'update', 'upsert', 'delete',
      'eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'like', 'ilike', 'in',
      'is', 'not', 'or', 'filter', 'match', 'contains', 'containedBy',
      'order', 'limit', 'range', 'single', 'maybeSingle',
      'textSearch', 'csv', 'geojson', 'explain',
    ];

    const proxy: Record<string, unknown> = {};

    for (const method of chainMethods) {
      proxy[method] = (...args: unknown[]) => {
        record.methods.push({ name: method, args });
        return proxy;
      };
    }

    // Make the chain thenable so `await` resolves it.
    proxy.then = (
      onFulfilled?: (value: unknown) => unknown,
      onRejected?: (reason: unknown) => unknown,
    ) => {
      const result = getNextResult(table);
      record._result = result;
      return Promise.resolve(result).then(onFulfilled, onRejected);
    };

    return proxy;
  }

  const mockSupabaseClient = {
    from: (table: string) => createChainableMock(table),
  };

  return { callRecordsRef, mockResultsRef, mockSupabaseClient };
});

vi.mock('@mantleagents/db', () => ({
  createSupabaseAdmin: () => mockSupabaseClient,
}));

vi.mock('../middleware/auth', () => ({
  authMiddleware: async (request: any) => {
    request.user = { walletAddress: '0xTEST_WALLET' };
  },
}));

const mockRunAgentCycle = vi.fn().mockResolvedValue(undefined);
vi.mock('../services/agent-cron', () => ({
  runAgentCycle: (...args: unknown[]) => mockRunAgentCycle(...args),
}));

const mockGetWalletBalances = vi.fn();
vi.mock('../services/dune-balances', () => ({
  getWalletBalances: (...args: unknown[]) => mockGetWalletBalances(...args),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let app: ReturnType<typeof Fastify>;

beforeEach(async () => {
  callRecordsRef.value = [];
  mockResultsRef.value = {};
  mockRunAgentCycle.mockClear();
  mockGetWalletBalances.mockReset();
  app = Fastify();
  await app.register(agentRoutes);
  await app.ready();
});

afterEach(async () => {
  await app.close();
});

/** Shorthand for Fastify inject. */
function inject(opts: { method: 'GET' | 'POST' | 'PUT' | 'DELETE'; url: string; payload?: unknown }) {
  return app.inject(opts);
}

/** Sample agent_configs row from the DB. */
function makeConfigRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'cfg-1',
    wallet_address: '0xTEST_WALLET',
    active: true,
    frequency: 'daily',
    max_trade_size_pct: 25,
    max_allocation_pct: 25,
    stop_loss_pct: 10,
    daily_trade_limit: 5,
    allowed_currencies: ['BNB', 'cUSD'],
    blocked_currencies: [],
    custom_prompt: null,
    server_wallet_address: '0xSERVER',
    last_run_at: '2026-01-01T00:00:00Z',
    next_run_at: '2026-01-02T00:00:00Z',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

/** Sample agent_timeline row. */
function makeTimelineRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'tl-1',
    wallet_address: '0xTEST_WALLET',
    event_type: 'trade',
    summary: 'Bought BNB',
    detail: 'Purchased 100 BNB at $0.50',
    citations: ['https://example.com'],
    confidence_pct: 85,
    currency: 'BNB',
    amount_usd: 50,
    direction: 'buy',
    tx_hash: '0xabc123',
    run_id: null,
    created_at: '2026-01-01T12:00:00Z',
    ...overrides,
  };
}

/** Sample agent_positions row. */
function makePositionRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'pos-1',
    wallet_address: '0xTEST_WALLET',
    token_symbol: 'BNB',
    token_address: '0xBNB',
    balance: 1000,
    avg_entry_rate: 0.5,
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}


// ---------------------------------------------------------------------------
// GET /api/agent/status
// ---------------------------------------------------------------------------

describe('GET /api/agent/status', () => {
  it('returns 404 when no agent config exists', async () => {
    mockResultsRef.value['agent_configs'] = { data: null, error: { message: 'not found' } };
    // The timeline and positions queries may or may not be reached, but set them
    mockResultsRef.value['agent_timeline'] = { data: null, error: null, count: 0 };
    mockResultsRef.value['agent_positions'] = { data: null, error: null, count: 0 };

    const res = await inject({ method: 'GET', url: '/api/agent/status' });

    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: 'Agent not configured' });
  });

  it('returns agent config with camelCase fields', async () => {
    const row = makeConfigRow();
    mockResultsRef.value['agent_configs'] = { data: row, error: null };
    mockResultsRef.value['agent_timeline'] = { data: null, error: null, count: 3 };
    mockResultsRef.value['agent_positions'] = { data: null, error: null, count: 2 };

    const res = await inject({ method: 'GET', url: '/api/agent/status' });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.config).toEqual({
      id: 'cfg-1',
      active: true,
      frequency: 'daily',
      maxTradeSizePct: 25,
      maxAllocationPct: 25,
      stopLossPct: 10,
      dailyTradeLimit: 5,
      allowedCurrencies: ['BNB', 'cUSD'],
      blockedCurrencies: [],
      customPrompt: null,
      serverWalletAddress: '0xSERVER',
      lastRunAt: '2026-01-01T00:00:00Z',
      nextRunAt: '2026-01-02T00:00:00Z',
    });
  });

  it('includes tradesToday count from timeline query', async () => {
    mockResultsRef.value['agent_configs'] = { data: makeConfigRow(), error: null };
    mockResultsRef.value['agent_timeline'] = { data: null, error: null, count: 7 };
    mockResultsRef.value['agent_positions'] = { data: null, error: null, count: 0 };

    const res = await inject({ method: 'GET', url: '/api/agent/status' });

    expect(res.statusCode).toBe(200);
    expect(res.json().tradesToday).toBe(7);
  });

  it('includes positionCount from positions query', async () => {
    mockResultsRef.value['agent_configs'] = { data: makeConfigRow(), error: null };
    mockResultsRef.value['agent_timeline'] = { data: null, error: null, count: 0 };
    mockResultsRef.value['agent_positions'] = { data: null, error: null, count: 4 };

    const res = await inject({ method: 'GET', url: '/api/agent/status' });

    expect(res.statusCode).toBe(200);
    expect(res.json().positionCount).toBe(4);
  });

  it('defaults tradesToday and positionCount to 0 when count is null', async () => {
    mockResultsRef.value['agent_configs'] = { data: makeConfigRow(), error: null };
    mockResultsRef.value['agent_timeline'] = { data: null, error: null, count: null };
    mockResultsRef.value['agent_positions'] = { data: null, error: null, count: null };

    const res = await inject({ method: 'GET', url: '/api/agent/status' });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.tradesToday).toBe(0);
    expect(body.positionCount).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// POST /api/agent/toggle
// ---------------------------------------------------------------------------

describe('POST /api/agent/toggle', () => {
  it('returns 404 when no config exists', async () => {
    mockResultsRef.value['agent_configs'] = { data: null, error: { message: 'not found' } };

    const res = await inject({ method: 'POST', url: '/api/agent/toggle' });

    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: 'Agent not configured' });
  });

  it('toggles active false -> true and returns { active: true }', async () => {
    // First call: fetch config (active=false, with agent_8004_id so gating passes)
    // Second call: update
    mockResultsRef.value['agent_configs'] = [
      { data: { id: 'cfg-1', active: false, frequency: 'daily', agent_8004_id: 29 }, error: null },
      { data: null, error: null },
    ];

    const res = await inject({ method: 'POST', url: '/api/agent/toggle' });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ active: true });
  });

  it('toggles active true -> false and returns { active: false }', async () => {
    mockResultsRef.value['agent_configs'] = [
      { data: { id: 'cfg-1', active: true, frequency: 'daily' }, error: null },
      { data: null, error: null },
    ];

    const res = await inject({ method: 'POST', url: '/api/agent/toggle' });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ active: false });
  });

  it('returns 500 when update fails', async () => {
    mockResultsRef.value['agent_configs'] = [
      { data: { id: 'cfg-1', active: true, frequency: 'daily' }, error: null },
      { data: null, error: { message: 'update failed' } },
    ];

    const res = await inject({ method: 'POST', url: '/api/agent/toggle' });

    expect(res.statusCode).toBe(500);
    expect(res.json()).toEqual({ error: 'Failed to toggle agent' });
  });

  it('sets next_run_at when activating', async () => {
    mockResultsRef.value['agent_configs'] = [
      { data: { id: 'cfg-1', active: false, frequency: 'hourly', agent_8004_id: 29 }, error: null },
      { data: null, error: null },
    ];

    const res = await inject({ method: 'POST', url: '/api/agent/toggle' });

    expect(res.statusCode).toBe(200);
    expect(res.json().active).toBe(true);

    // Verify the update call was made with next_run_at by checking callRecords
    const updateRecord = callRecordsRef.value.find(
      (r) => r.table === 'agent_configs' && r.methods.some((m) => m.name === 'update'),
    );
    expect(updateRecord).toBeDefined();
    const updateCall = updateRecord!.methods.find((m) => m.name === 'update');
    const updatePayload = updateCall!.args[0] as Record<string, unknown>;
    expect(updatePayload.active).toBe(true);
    expect(updatePayload.next_run_at).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// GET /api/agent/timeline
// ---------------------------------------------------------------------------

describe('GET /api/agent/timeline', () => {
  it('returns paginated entries with entries, total, hasMore', async () => {
    const rows = [makeTimelineRow({ id: 'tl-1' }), makeTimelineRow({ id: 'tl-2' })];
    mockResultsRef.value['agent_timeline'] = { data: rows, error: null, count: 5 };

    // Use limit=2 so hasMore = (0 + 2) < 5 = true
    const res = await inject({ method: 'GET', url: '/api/agent/timeline?limit=2' });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.entries).toHaveLength(2);
    expect(body.total).toBe(5);
    expect(body.hasMore).toBe(true);
  });

  it('accepts limit and offset query params', async () => {
    mockResultsRef.value['agent_timeline'] = { data: [], error: null, count: 0 };

    const res = await inject({ method: 'GET', url: '/api/agent/timeline?limit=5&offset=10' });

    expect(res.statusCode).toBe(200);

    // Verify range call was made with correct offset/limit
    const record = callRecordsRef.value.find((r) => r.table === 'agent_timeline');
    const rangeCall = record!.methods.find((m) => m.name === 'range');
    expect(rangeCall).toBeDefined();
    expect(rangeCall!.args).toEqual([10, 14]); // offset=10, offset+limit-1=14
  });

  it('clamps limit to max 100', async () => {
    mockResultsRef.value['agent_timeline'] = { data: [], error: null, count: 0 };

    await inject({ method: 'GET', url: '/api/agent/timeline?limit=500' });

    const record = callRecordsRef.value.find((r) => r.table === 'agent_timeline');
    const rangeCall = record!.methods.find((m) => m.name === 'range');
    expect(rangeCall!.args).toEqual([0, 99]); // limit clamped to 100
  });

  it('filters by type query param', async () => {
    mockResultsRef.value['agent_timeline'] = { data: [], error: null, count: 0 };

    await inject({ method: 'GET', url: '/api/agent/timeline?type=trade' });

    const record = callRecordsRef.value.find((r) => r.table === 'agent_timeline');
    const eqCalls = record!.methods.filter((m) => m.name === 'eq');
    // Should have eq for wallet_address AND eq for event_type
    const typeEq = eqCalls.find((c) => c.args[0] === 'event_type');
    expect(typeEq).toBeDefined();
    expect(typeEq!.args[1]).toBe('trade');
  });

  it('returns entries mapped to camelCase', async () => {
    const row = makeTimelineRow();
    mockResultsRef.value['agent_timeline'] = { data: [row], error: null, count: 1 };

    const res = await inject({ method: 'GET', url: '/api/agent/timeline' });

    const entry = res.json().entries[0];
    expect(entry).toEqual({
      id: 'tl-1',
      eventType: 'trade',
      summary: 'Bought BNB',
      detail: 'Purchased 100 BNB at $0.50',
      citations: ['https://example.com'],
      confidencePct: 85,
      currency: 'BNB',
      amountUsd: 50,
      direction: 'buy',
      txHash: '0xabc123',
      runId: null,
      createdAt: '2026-01-01T12:00:00Z',
    });
  });

  it('returns hasMore false when no more entries', async () => {
    mockResultsRef.value['agent_timeline'] = { data: [makeTimelineRow()], error: null, count: 1 };

    const res = await inject({ method: 'GET', url: '/api/agent/timeline?limit=20&offset=0' });

    expect(res.json().hasMore).toBe(false);
  });

  it('returns 500 on DB error', async () => {
    mockResultsRef.value['agent_timeline'] = { data: null, error: { message: 'db error' }, count: null };

    const res = await inject({ method: 'GET', url: '/api/agent/timeline' });

    expect(res.statusCode).toBe(500);
    expect(res.json()).toEqual({ error: 'Failed to fetch timeline' });
  });

  it('returns empty entries when data is null', async () => {
    mockResultsRef.value['agent_timeline'] = { data: null, error: null, count: 0 };

    const res = await inject({ method: 'GET', url: '/api/agent/timeline' });

    expect(res.statusCode).toBe(200);
    expect(res.json().entries).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// GET /api/agent/timeline/:id
// ---------------------------------------------------------------------------

describe('GET /api/agent/timeline/:id', () => {
  it('returns 404 when entry not found', async () => {
    mockResultsRef.value['agent_timeline'] = { data: null, error: { message: 'not found' } };

    const res = await inject({ method: 'GET', url: '/api/agent/timeline/nonexistent' });

    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: 'Timeline entry not found' });
  });

  it('returns single entry mapped to camelCase', async () => {
    const row = makeTimelineRow({ id: 'tl-42' });
    mockResultsRef.value['agent_timeline'] = { data: row, error: null };

    const res = await inject({ method: 'GET', url: '/api/agent/timeline/tl-42' });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.id).toBe('tl-42');
    expect(body.eventType).toBe('trade');
    expect(body.confidencePct).toBe(85);
    expect(body.amountUsd).toBe(50);
    expect(body.txHash).toBe('0xabc123');
    expect(body.createdAt).toBe('2026-01-01T12:00:00Z');
  });

  it('queries with both id and wallet_address for security', async () => {
    mockResultsRef.value['agent_timeline'] = { data: makeTimelineRow(), error: null };

    await inject({ method: 'GET', url: '/api/agent/timeline/tl-1' });

    const record = callRecordsRef.value.find((r) => r.table === 'agent_timeline');
    const eqCalls = record!.methods.filter((m) => m.name === 'eq');
    const idEq = eqCalls.find((c) => c.args[0] === 'id');
    const walletEq = eqCalls.find((c) => c.args[0] === 'wallet_address');
    expect(idEq).toBeDefined();
    expect(walletEq).toBeDefined();
    expect(walletEq!.args[1]).toBe('0xTEST_WALLET');
  });
});

// ---------------------------------------------------------------------------
// PUT /api/agent/settings
// ---------------------------------------------------------------------------

describe('PUT /api/agent/settings', () => {
  it('updates settings and returns { success: true }', async () => {
    mockResultsRef.value['agent_configs'] = { data: makeConfigRow(), error: null };

    const res = await inject({
      method: 'PUT',
      url: '/api/agent/settings',
      payload: {
        frequency: 1,
        maxTradeSizePct: 50,
        maxAllocationPct: 30,
        stopLossPct: 15,
        dailyTradeLimit: 10,
      },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ success: true });
  });

  it('accepts frequency as number or string', async () => {
    mockResultsRef.value['agent_configs'] = { data: makeConfigRow(), error: null };

    const res = await inject({
      method: 'PUT',
      url: '/api/agent/settings',
      payload: { frequency: '4' },
    });
    expect(res.statusCode).toBe(200);

    const res2 = await inject({
      method: 'PUT',
      url: '/api/agent/settings',
      payload: { frequency: 12 },
    });
    expect(res2.statusCode).toBe(200);
  });

  it('returns 404 when FX config does not exist', async () => {
    mockResultsRef.value['agent_configs'] = { data: null, error: null };

    const res = await inject({
      method: 'PUT',
      url: '/api/agent/settings',
      payload: { frequency: 4 },
    });

    expect(res.statusCode).toBe(404);
    expect((res.json() as { error: string }).error).toContain('FX agent not configured');
  });

  it('returns 500 on DB error', async () => {
    mockResultsRef.value['agent_configs'] = { data: null, error: { message: 'update failed' } };

    const res = await inject({
      method: 'PUT',
      url: '/api/agent/settings',
      payload: { frequency: 4 },
    });

    expect(res.statusCode).toBe(500);
    const body = res.json() as { error: string; details?: string };
    expect(body.error).toBe('Failed to update settings');
  });

  it('maps camelCase body fields to snake_case for DB update', async () => {
    mockResultsRef.value['agent_configs'] = { data: makeConfigRow(), error: null };

    await inject({
      method: 'PUT',
      url: '/api/agent/settings',
      payload: {
        maxTradeSizePct: 75,
        stopLossPct: 5,
        customPrompt: 'Be conservative',
      },
    });

    const record = callRecordsRef.value.find(
      (r) => r.table === 'agent_configs' && r.methods.some((m) => m.name === 'update'),
    );
    expect(record).toBeDefined();
    const updateCall = record!.methods.find((m) => m.name === 'update');
    const payload = updateCall!.args[0] as Record<string, unknown>;
    expect(payload.max_trade_size_pct).toBe(75);
    expect(payload.stop_loss_pct).toBe(5);
    expect(payload.custom_prompt).toBe('Be conservative');
    expect(payload.updated_at).toBeDefined();
  });

  it('updates allowed and blocked currencies', async () => {
    mockResultsRef.value['agent_configs'] = { data: makeConfigRow(), error: null };

    await inject({
      method: 'PUT',
      url: '/api/agent/settings',
      payload: {
        allowedCurrencies: ['EURm', 'GBPm', 'JPYm'],
        blockedCurrencies: ['XAUT'],
      },
    });

    const record = callRecordsRef.value.find(
      (r) => r.table === 'agent_configs' && r.methods.some((m) => m.name === 'update'),
    );
    const updateCall = record!.methods.find((m) => m.name === 'update');
    const payload = updateCall!.args[0] as Record<string, unknown>;
    expect(payload.allowed_currencies).toEqual(['EURm', 'GBPm', 'JPYm']);
    expect(payload.blocked_currencies).toEqual(['XAUT']);
  });
});

// ---------------------------------------------------------------------------
// GET /api/agent/positions
// ---------------------------------------------------------------------------

describe('GET /api/agent/positions', () => {
  it('returns positions array with camelCase fields', async () => {
    const rows = [
      makePositionRow({ id: 'pos-1', token_symbol: 'BNB', balance: 1000 }),
      makePositionRow({ id: 'pos-2', token_symbol: 'cUSD', token_address: '0xcUSD', balance: 500, avg_entry_rate: 1.0 }),
    ];
    mockResultsRef.value['agent_positions'] = { data: rows, error: null };

    const res = await inject({ method: 'GET', url: '/api/agent/positions' });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.positions).toHaveLength(2);
    expect(body.positions[0]).toEqual({
      id: 'pos-1',
      tokenSymbol: 'BNB',
      tokenAddress: '0xBNB',
      balance: 1000,
      avgEntryRate: 0.5,
      updatedAt: '2026-01-01T00:00:00Z',
    });
    expect(body.positions[1].tokenSymbol).toBe('cUSD');
  });

  it('returns empty array when no positions exist', async () => {
    mockResultsRef.value['agent_positions'] = { data: [], error: null };

    const res = await inject({ method: 'GET', url: '/api/agent/positions' });

    expect(res.statusCode).toBe(200);
    expect(res.json().positions).toEqual([]);
  });

  it('returns empty array when data is null', async () => {
    mockResultsRef.value['agent_positions'] = { data: null, error: null };

    const res = await inject({ method: 'GET', url: '/api/agent/positions' });

    expect(res.statusCode).toBe(200);
    expect(res.json().positions).toEqual([]);
  });

  it('returns 500 on DB error', async () => {
    mockResultsRef.value['agent_positions'] = { data: null, error: { message: 'db error' } };

    const res = await inject({ method: 'GET', url: '/api/agent/positions' });

    expect(res.statusCode).toBe(500);
    expect(res.json()).toEqual({ error: 'Failed to fetch positions' });
  });

  it('only fetches positions with balance > 0', async () => {
    mockResultsRef.value['agent_positions'] = { data: [], error: null };

    await inject({ method: 'GET', url: '/api/agent/positions' });

    const record = callRecordsRef.value.find((r) => r.table === 'agent_positions');
    const gtCall = record!.methods.find((m) => m.name === 'gt');
    expect(gtCall).toBeDefined();
    expect(gtCall!.args).toEqual(['balance', 0]);
  });
});

// ---------------------------------------------------------------------------
// GET /api/agent/portfolio
// ---------------------------------------------------------------------------

describe('GET /api/agent/portfolio', () => {
  it('returns totalValueUsd and holdings from Dune balances', async () => {
    mockResultsRef.value['agent_configs'] = {
      data: { server_wallet_address: '0xSERVER' },
      error: null,
    };
    mockGetWalletBalances.mockResolvedValue([
      { chain_id: 42220, address: '0xUSDC', amount: '10000000', symbol: 'USDC', name: 'USD Coin', decimals: 6, price_usd: 1.0, value_usd: 10 },
    ]);

    const res = await inject({ method: 'GET', url: '/api/agent/portfolio' });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.totalValueUsd).toBe(10);
    expect(body.holdings).toHaveLength(1);
    expect(body.holdings[0]).toMatchObject({
      tokenSymbol: 'USDC',
      tokenAddress: '0xUSDC',
      balance: 10, // 10000000 / 10^6
      priceUsd: 1.0,
      valueUsd: 10,
      avgEntryRate: null,
      costBasis: null,
      pnl: 0,
    });
    expect(mockGetWalletBalances).toHaveBeenCalledWith('0xSERVER');
  });

  it('aggregates multiple token holdings', async () => {
    mockResultsRef.value['agent_configs'] = {
      data: { server_wallet_address: '0xSERVER' },
      error: null,
    };
    mockGetWalletBalances.mockResolvedValue([
      { chain_id: 42220, address: '0xUSDC', amount: '5000000', symbol: 'USDC', name: 'USD Coin', decimals: 6, price_usd: 1.0, value_usd: 5 },
      { chain_id: 42220, address: '0xBNB', amount: '2000000000000000000', symbol: 'BNB', name: 'BNB Token', decimals: 18, price_usd: 0.5, value_usd: 1 },
    ]);

    const res = await inject({ method: 'GET', url: '/api/agent/portfolio' });

    const body = res.json();
    expect(body.holdings).toHaveLength(2);
    expect(body.holdings[0].tokenSymbol).toBe('USDC');
    expect(body.holdings[0].balance).toBe(5);
    expect(body.holdings[1].tokenSymbol).toBe('BNB');
    expect(body.holdings[1].balance).toBe(2);
    expect(body.totalValueUsd).toBe(6); // 5 + 1
  });

  it('returns empty holdings when Dune returns no balances', async () => {
    mockResultsRef.value['agent_configs'] = {
      data: { server_wallet_address: '0xSERVER' },
      error: null,
    };
    mockGetWalletBalances.mockResolvedValue([]);

    const res = await inject({ method: 'GET', url: '/api/agent/portfolio' });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.totalValueUsd).toBe(0);
    expect(body.holdings).toEqual([]);
  });

  it('returns 404 when agent wallet not configured', async () => {
    mockResultsRef.value['agent_configs'] = {
      data: null,
      error: { message: 'not found' },
    };

    const res = await inject({ method: 'GET', url: '/api/agent/portfolio' });

    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: 'Agent wallet not configured' });
  });

  it('returns 404 when server_wallet_address is null', async () => {
    mockResultsRef.value['agent_configs'] = {
      data: { server_wallet_address: null },
      error: null,
    };

    const res = await inject({ method: 'GET', url: '/api/agent/portfolio' });

    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: 'Agent wallet not configured' });
  });

  it('returns 500 when Dune API fails', async () => {
    mockResultsRef.value['agent_configs'] = {
      data: { server_wallet_address: '0xSERVER' },
      error: null,
    };
    mockGetWalletBalances.mockRejectedValue(new Error('Dune SIM API error: 500'));

    const res = await inject({ method: 'GET', url: '/api/agent/portfolio' });

    expect(res.statusCode).toBe(500);
    expect(res.json()).toEqual({ error: 'Failed to fetch portfolio' });
  });
});

// ---------------------------------------------------------------------------
// POST /api/agent/run-now
// ---------------------------------------------------------------------------

describe('POST /api/agent/run-now', () => {
  it('returns 404 when no agent config exists', async () => {
    mockResultsRef.value['agent_configs'] = { data: null, error: { message: 'not found' } };

    const res = await inject({ method: 'POST', url: '/api/agent/run-now' });

    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: 'Agent not configured' });
  });

  it('returns 400 when server wallet not set up', async () => {
    mockResultsRef.value['agent_configs'] = [
      { data: makeConfigRow({ server_wallet_address: null, server_wallet_id: null }), error: null },
    ];

    const res = await inject({ method: 'POST', url: '/api/agent/run-now' });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: 'Agent wallet not set up' });
  });

  it('triggers runAgentCycle and returns { triggered: true }', async () => {
    const config = makeConfigRow({ server_wallet_id: 'sw-1' });
    mockResultsRef.value['agent_configs'] = [
      { data: config, error: null },
      { data: null, error: null }, // for the update call
    ];

    const res = await inject({ method: 'POST', url: '/api/agent/run-now' });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ triggered: true });
    expect(mockRunAgentCycle).toHaveBeenCalledWith(config);
  });

  it('updates last_run_at and next_run_at', async () => {
    const config = makeConfigRow({ server_wallet_id: 'sw-1', frequency: 'hourly' });
    mockResultsRef.value['agent_configs'] = [
      { data: config, error: null },
      { data: null, error: null },
    ];

    await inject({ method: 'POST', url: '/api/agent/run-now' });

    const updateRecord = callRecordsRef.value.find(
      (r) => r.table === 'agent_configs' && r.methods.some((m) => m.name === 'update'),
    );
    expect(updateRecord).toBeDefined();
    const updateCall = updateRecord!.methods.find((m) => m.name === 'update');
    const payload = updateCall!.args[0] as Record<string, unknown>;
    expect(payload.last_run_at).toBeDefined();
    expect(payload.next_run_at).toBeDefined();
  });
});
