import Fastify from 'fastify';
import { agentRoutes } from './agent';

interface CallRecord {
  table: string;
  methods: Array<{ name: string; args: unknown[] }>;
  _result: { data: unknown; error: unknown; count?: number | null };
}

type MockResult = { data: unknown; error: unknown; count?: number | null };

const {
  callRecordsRef,
  mockResultsRef,
  mockSupabaseClient,
} = vi.hoisted(() => {
  const callRecordsRef: { value: CallRecord[] } = { value: [] };
  const mockResultsRef: {
    value: Record<string, MockResult | MockResult[]>;
  } = { value: {} };

  function getNextResult(table: string): MockResult {
    const entry = mockResultsRef.value[table];
    if (!entry) return { data: null, error: null, count: null };
    if (Array.isArray(entry)) {
      return entry.shift() ?? { data: null, error: null, count: null };
    }
    return entry;
  }

  function createChainableMock(table: string): Record<string, unknown> {
    const record: CallRecord = {
      table,
      methods: [],
      _result: { data: null, error: null, count: null },
    };
    callRecordsRef.value.push(record);

    const chainMethods = ['select', 'eq', 'order', 'single'];
    const proxy: Record<string, unknown> = {};

    for (const method of chainMethods) {
      proxy[method] = (...args: unknown[]) => {
        record.methods.push({ name: method, args });
        return proxy;
      };
    }

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

vi.mock('../middleware/auth.js', () => ({
  authMiddleware: async (request: any) => {
    request.user = { walletAddress: '0xTEST_WALLET' };
  },
}));

vi.mock('../services/agent-cron.js', () => ({
  runAgentCycle: vi.fn(),
}));

vi.mock('../services/agent-registry.js', () => ({
  getAgentReputation: vi.fn(),
  prepareAgentWalletLink: vi.fn(),
  registerAgentOnChain: vi.fn(),
}));

vi.mock('../services/dune-balances.js', () => ({
  getWalletBalances: vi.fn(),
}));

function makeAttestationRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'att-1',
    wallet_address: '0xTEST_WALLET',
    agent_type: 'fx',
    run_id: 'run-1',
    payload: {
      schema: 'mantleagents/attestation-v2',
      walletAddress: '0xTEST_WALLET',
      agentType: 'fx',
      runId: 'run-1',
      eventCount: 2,
      tradeCount: 1,
      txHashes: ['0xtrade'],
      eventsHash: 'a'.repeat(64),
      decisionHash: 'b'.repeat(64),
      generatedAt: '2026-06-12T10:00:00Z',
    },
    signature: 'sig',
    algorithm: 'HMAC-SHA256',
    commit_tx_hash: '0xcommit',
    is_development: true,
    created_at: '2026-06-12T10:00:00Z',
    ...overrides,
  };
}

let app: ReturnType<typeof Fastify>;

beforeEach(async () => {
  callRecordsRef.value = [];
  mockResultsRef.value = {};
  app = Fastify();
  await app.register(agentRoutes);
  await app.ready();
});

afterEach(async () => {
  await app.close();
});

describe('GET /api/agent/attestations/:id', () => {
  it('returns decision hashes, commit tx metadata, and decision trail details', async () => {
    mockResultsRef.value.agent_attestations = {
      data: makeAttestationRow(),
      error: null,
    };
    mockResultsRef.value.fx_agent_timeline = {
      data: [
        {
          event_type: 'decision_input',
          summary: JSON.stringify({
            signal: {
              currency: 'EURm',
              direction: 'buy',
              confidence: 88,
              reasoning: 'Momentum is improving',
            },
            guardrailParams: { maxTradeSizePct: 25 },
            marketDataSnapshot: { portfolioValueUsd: 1000 },
          }),
          detail: {},
          tx_hash: null,
          amount_usd: null,
          currency: null,
          direction: null,
          confidence_pct: null,
          created_at: '2026-06-12T10:00:00Z',
        },
        {
          event_type: 'trade',
          summary: 'buy EURm ($100.00)',
          detail: { simulated: false },
          tx_hash: '0xtrade',
          amount_usd: 100,
          currency: 'EURm',
          direction: 'buy',
          confidence_pct: 88,
          created_at: '2026-06-12T10:00:01Z',
        },
      ],
      error: null,
    };

    const res = await app.inject({
      method: 'GET',
      url: '/api/agent/attestations/att-1',
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual(
      expect.objectContaining({
        id: 'att-1',
        eventsHash: 'a'.repeat(64),
        decisionHash: 'b'.repeat(64),
        commitTxHash: '0xcommit',
        commitTxExplorerUrl: expect.stringContaining('/tx/0xcommit'),
        decisionTrail: expect.objectContaining({
          signal: expect.objectContaining({
            action: 'buy',
            label: 'EURm',
            confidence: 88,
          }),
          outcome: expect.objectContaining({
            status: 'executed',
            txHash: '0xtrade',
          }),
        }),
      }),
    );
  });

  it('returns null commit tx metadata without a 5xx when the column is null', async () => {
    mockResultsRef.value.agent_attestations = {
      data: makeAttestationRow({
        id: 'att-null',
        commit_tx_hash: null,
      }),
      error: null,
    };
    mockResultsRef.value.fx_agent_timeline = {
      data: [],
      error: null,
    };

    const res = await app.inject({
      method: 'GET',
      url: '/api/agent/attestations/att-null',
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual(
      expect.objectContaining({
        commitTxHash: null,
        commitTxExplorerUrl: null,
      }),
    );
  });
});
