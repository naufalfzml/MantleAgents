import Fastify from 'fastify';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const mockCheckEligibility = vi.hoisted(() => vi.fn());
const mockCloneStrategy = vi.hoisted(() => vi.fn());

type DbResult = { data: unknown; error: unknown };
type DbChain = {
  select: () => DbChain;
  insert: (v?: unknown) => DbChain;
  update: (v?: unknown) => DbChain;
  eq: (...args: unknown[]) => DbChain;
  maybeSingle: () => Promise<DbResult>;
  single: () => Promise<DbResult>;
  order: (...args: unknown[]) => DbChain;
  limit: (n: number) => DbChain;
  then?: undefined;
};

// Allow per-table result overrides
const tableResults: Record<string, DbResult[]> = {};

function makeChain(table: string): DbChain {
  const chain: DbChain = {
    select: () => chain,
    insert: () => chain,
    update: () => chain,
    eq: () => chain,
    order: () => chain,
    limit: () => chain,
    maybeSingle: async () => {
      const queue = tableResults[table];
      const res = queue?.shift() ?? { data: null, error: null };
      return res;
    },
    single: async () => {
      const queue = tableResults[table];
      const res = queue?.shift() ?? { data: null, error: null };
      return res;
    },
  };
  // Allow awaiting chain directly (for cases without .single()/.maybeSingle())
  (chain as unknown as Promise<DbResult>).then = (
    resolve?: (v: DbResult) => unknown,
    reject?: (r: unknown) => unknown,
  ) => {
    const queue = tableResults[table];
    const res = queue?.shift() ?? { data: [], error: null };
    return Promise.resolve(res).then(resolve, reject);
  };
  return chain;
}

function setResult(table: string, ...results: DbResult[]) {
  tableResults[table] = [...results];
}

const mockSupabase = {
  from: (table: string) => makeChain(table),
};

vi.mock('@mantleagents/db', () => ({
  createSupabaseAdmin: () => mockSupabase,
}));

vi.mock('../services/strategy-eligibility.js', () => ({
  checkEligibility: mockCheckEligibility,
}));

vi.mock('../services/strategy-clone.js', () => ({
  cloneStrategyToCanvas: mockCloneStrategy,
}));

// Auth middleware — injects walletAddress
let currentWallet = '0xrenter';
vi.mock('../middleware/auth.js', () => ({
  authMiddleware: vi.fn(async (request: { user?: { walletAddress: string } }) => {
    request.user = { walletAddress: currentWallet };
  }),
}));

// ---------------------------------------------------------------------------
// Test setup
// ---------------------------------------------------------------------------

async function buildApp() {
  const { marketplaceRoutes } = await import('./marketplace.js');
  const app = Fastify({ logger: false });
  await app.register(marketplaceRoutes, { prefix: '/api' });
  return app;
}

beforeEach(() => {
  vi.resetModules();
  mockCheckEligibility.mockReset();
  mockCloneStrategy.mockReset();
  currentWallet = '0xrenter';
  for (const key of Object.keys(tableResults)) delete tableResults[key];
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('POST /api/marketplace/strategies', () => {
  it('returns 422 when ineligible — no strategy row created', async () => {
    mockCheckEligibility.mockResolvedValue({
      eligible: false,
      issues: ['insufficient track record: 2 runs, need 10'],
    });

    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/marketplace/strategies',
      payload: {
        title: 'My Strategy',
        workflow_json: { name: 'test', nodes: [] },
        agent_type: 'fx',
        rental_price: 5,
      },
    });

    expect(res.statusCode).toBe(422);
    const body = res.json();
    expect(body.issues).toContain('insufficient track record: 2 runs, need 10');
  });

  it('creates strategy + snapshot rows when eligible', async () => {
    mockCheckEligibility.mockResolvedValue({
      eligible: true,
      issues: [],
      attestationCount: 12,
      firstRunAt: '2026-01-01T00:00:00Z',
      lastRunAt: '2026-01-15T00:00:00Z',
      roiPct: 8,
    });

    const strategyRow = {
      id: 'strat-1',
      owner_wallet: '0xrenter',
      title: 'My Strategy',
      status: 'listed',
    };
    setResult('strategy_templates', { data: strategyRow, error: null });
    setResult('strategy_performance_snapshots', { data: {}, error: null });

    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/marketplace/strategies',
      payload: {
        title: 'My Strategy',
        workflow_json: { name: 'test', nodes: [] },
        agent_type: 'fx',
        rental_price: 5,
      },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.status).toBe('listed');
  });
});

describe('GET /api/marketplace/strategies', () => {
  it('returns only listed strategies from any user', async () => {
    const listed = [
      {
        id: 'strat-a',
        title: 'User A Strategy',
        owner_wallet: '0xuserA',
        status: 'listed',
        rental_price: 10,
        description: null,
        created_at: '2026-01-01T00:00:00Z',
        strategy_performance_snapshots: [
          { roi_pct: 5, run_count: 15, period_start: '2026-01-01', period_end: '2026-01-15', created_at: '2026-01-15T00:00:00Z' },
        ],
      },
    ];
    setResult('strategy_templates', { data: listed, error: null });

    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/marketplace/strategies' });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toHaveLength(1);
    expect(body[0].ownerWallet).toBe('0xuserA');
    expect(body[0].attestationCount).toBe(15);
  });
});

describe('POST /api/marketplace/strategies/:id/rent', () => {
  it('clones workflow and creates rental row on success', async () => {
    const strategy = {
      id: 'strat-1',
      owner_wallet: '0xowner',
      workflow_json: { name: 'test' },
      title: 'Bull Run',
      rental_price: 10,
      status: 'listed',
    };
    setResult('strategy_templates', { data: strategy, error: null });

    mockCloneStrategy.mockResolvedValue('n8n-wf-999');

    const rentalRow = { id: 'rental-1', n8n_workflow_id: 'n8n-wf-999' };
    setResult('strategy_rentals', { data: rentalRow, error: null });

    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/marketplace/strategies/strat-1/rent',
    });

    expect(res.statusCode).toBe(201);
    expect(mockCloneStrategy).toHaveBeenCalledWith(
      '0xrenter',
      strategy.workflow_json,
      'Bull Run',
    );
    const body = res.json();
    expect(body.n8nWorkflowId).toBe('n8n-wf-999');
  });

  it('returns 400 when renting own strategy', async () => {
    currentWallet = '0xowner';
    const strategy = {
      id: 'strat-1',
      owner_wallet: '0xowner',
      workflow_json: {},
      title: 'My Strategy',
      rental_price: 0,
      status: 'listed',
    };
    setResult('strategy_templates', { data: strategy, error: null });

    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/marketplace/strategies/strat-1/rent',
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatch(/own strategy/i);
  });

  it('returns 404 when strategy is delisted', async () => {
    setResult('strategy_templates', { data: null, error: null });

    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/marketplace/strategies/missing-id/rent',
    });

    expect(res.statusCode).toBe(404);
  });

  it('returns 500 and no rental row when cloneStrategyToCanvas throws', async () => {
    const strategy = {
      id: 'strat-1',
      owner_wallet: '0xowner',
      workflow_json: {},
      title: 'Bull Run',
      rental_price: 5,
      status: 'listed',
    };
    setResult('strategy_templates', { data: strategy, error: null });
    mockCloneStrategy.mockRejectedValue(new Error('n8n unreachable'));

    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/marketplace/strategies/strat-1/rent',
    });

    expect(res.statusCode).toBe(500);
  });
});
