const {
  callRecordsRef,
  mockResultsRef,
  mockSupabaseClient,
  mockWriteContract,
} = vi.hoisted(() => {
  type CallRecord = {
    table: string;
    methods: Array<{ name: string; args: unknown[] }>;
    _result: { data: unknown; error: unknown; count?: number | null };
  };

  type MockResult = { data: unknown; error: unknown; count?: number | null };

  const callRecordsRef: { value: CallRecord[] } = { value: [] };
  const mockResultsRef: {
    value: Record<string, MockResult | MockResult[]>;
  } = { value: {} };
  const mockWriteContract = vi.fn();

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

    const chainMethods = [
      'select',
      'insert',
      'update',
      'eq',
      'order',
      'range',
      'single',
      'maybeSingle',
      'limit',
      'not',
    ];

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

  return { callRecordsRef, mockResultsRef, mockSupabaseClient, mockWriteContract };
});

vi.mock('@mantleagents/db', () => ({
  createSupabaseAdmin: () => mockSupabaseClient,
}));

vi.mock('viem', async (importOriginal) => {
  const actual = await importOriginal<typeof import('viem')>();
  return {
    ...actual,
    createWalletClient: vi.fn(() => ({
      writeContract: mockWriteContract,
    })),
    http: vi.fn(() => undefined),
  };
});

import {
  commitAttestationOnChain,
  computeDecisionHash,
  createAndAttachRunAttestation,
} from './attestation-service.js';

function makeDecisionInput(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    signal: {
      currency: 'EURm',
      direction: 'buy',
      confidence: 90,
      reasoning: 'Momentum is improving',
    },
    guardrailParams: {
      maxTradeSizePct: 25,
      maxAllocationPct: 20,
      dailyTradeCount: 0,
    },
    marketDataSnapshot: {
      portfolioValueUsd: 1_500,
      walletBalances: [{ symbol: 'USDC', valueUsd: 400 }],
    },
    ...overrides,
  };
}

function findInsertPayload(table: string) {
  const record = callRecordsRef.value.find(
    (entry) =>
      entry.table === table &&
      entry.methods.some((method) => method.name === 'insert'),
  );
  const insertMethod = record?.methods.find((method) => method.name === 'insert');
  return insertMethod?.args[0] as Record<string, unknown> | undefined;
}

beforeEach(() => {
  callRecordsRef.value = [];
  mockResultsRef.value = {};
  mockWriteContract.mockReset();

  process.env.EVM_SIGNER_PRIVATE_KEY =
    '0x0123456789012345678901234567890123456789012345678901234567890123';
  process.env.MANTLE_RPC_URL = 'http://127.0.0.1:8545';
  process.env.MANTLE_ATTESTATION_REGISTRY_ADDRESS =
    '0x1234567890123456789012345678901234567890';
});

describe('computeDecisionHash', () => {
  it('returns the same hash for the same input', () => {
    const input = makeDecisionInput();

    expect(computeDecisionHash(input as any)).toBe(computeDecisionHash(input as any));
  });

  it('ignores object key order', () => {
    const a = makeDecisionInput({
      guardrailParams: { a: 1, b: 2 },
      marketDataSnapshot: { z: 1, y: 2 },
    });
    const b = makeDecisionInput({
      guardrailParams: { b: 2, a: 1 },
      marketDataSnapshot: { y: 2, z: 1 },
    });

    expect(computeDecisionHash(a as any)).toBe(computeDecisionHash(b as any));
  });

  it('changes when the confidence changes', () => {
    const a = makeDecisionInput({
      signal: {
        currency: 'EURm',
        direction: 'buy',
        confidence: 70,
      },
    });
    const b = makeDecisionInput({
      signal: {
        currency: 'EURm',
        direction: 'buy',
        confidence: 80,
      },
    });

    expect(computeDecisionHash(a as any)).not.toBe(computeDecisionHash(b as any));
  });
});

describe('createAndAttachRunAttestation', () => {
  it('stores decisionHash when a decision_input event exists', async () => {
    const snapshot = makeDecisionInput();
    mockWriteContract.mockResolvedValue('0xabc');
    mockResultsRef.value.fx_agent_timeline = [
      {
        data: [
          {
            event_type: 'decision_input',
            summary: JSON.stringify(snapshot),
            tx_hash: null,
            created_at: '2026-06-12T10:00:00Z',
          },
          {
            event_type: 'trade',
            summary: 'buy EURm ($100.00)',
            tx_hash: '0xtrade',
            created_at: '2026-06-12T10:00:01Z',
          },
        ],
        error: null,
      },
      { data: null, error: null },
    ];
    mockResultsRef.value.agent_attestations = [
      {
        data: {
          id: 'att-1',
          signature: 'stale-signature',
          created_at: '2026-06-12T10:00:02Z',
        },
        error: null,
      },
      { data: null, error: null },
    ];

    await createAndAttachRunAttestation({
      walletAddress: '0xwallet',
      agentType: 'fx',
      runId: 'run-1',
      agentId: 42n,
    });

    const inserted = findInsertPayload('agent_attestations');
    const payload = inserted?.payload as Record<string, unknown>;

    expect(payload.decisionHash).toBe(computeDecisionHash(snapshot as any));
  });

  it('stores null decisionHash when decision_input is missing', async () => {
    mockWriteContract.mockResolvedValue('0xabc');
    mockResultsRef.value.fx_agent_timeline = [
      {
        data: [
          {
            event_type: 'trade',
            summary: 'buy EURm ($100.00)',
            tx_hash: '0xtrade',
            created_at: '2026-06-12T10:00:01Z',
          },
        ],
        error: null,
      },
      { data: null, error: null },
    ];
    mockResultsRef.value.agent_attestations = [
      {
        data: {
          id: 'att-2',
          signature: 'stale-signature',
          created_at: '2026-06-12T10:00:02Z',
        },
        error: null,
      },
      { data: null, error: null },
    ];

    await expect(
      createAndAttachRunAttestation({
        walletAddress: '0xwallet',
        agentType: 'fx',
        runId: 'run-2',
        agentId: 42n,
      }),
    ).resolves.toEqual({ attestationId: 'att-2', commitTxHash: '0xabc' });

    const inserted = findInsertPayload('agent_attestations');
    const payload = inserted?.payload as Record<string, unknown>;

    expect(payload.decisionHash).toBeNull();
  });
});

describe('commitAttestationOnChain', () => {
  it('returns null when the RPC write fails', async () => {
    mockWriteContract.mockRejectedValue(new Error('rpc failed'));

    await expect(
      commitAttestationOnChain({
        agentId: 42n,
        runId: 'run-rpc-failure',
        eventsHash: 'a'.repeat(64),
        decisionHash: 'b'.repeat(64),
        tradeCount: 1,
      }),
    ).resolves.toBeNull();
  });
});
