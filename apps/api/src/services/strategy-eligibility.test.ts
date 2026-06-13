import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockSelect = vi.hoisted(() => vi.fn());
const mockEq = vi.hoisted(() => vi.fn());
const mockOrder = vi.hoisted(() => vi.fn());

vi.mock('@mantleagents/db', () => ({
  createSupabaseAdmin: () => ({
    from: () => ({
      select: mockSelect,
    }),
  }),
}));

beforeEach(() => {
  vi.resetModules();
  mockSelect.mockReset();
  mockEq.mockReset();
  mockOrder.mockReset();
  delete process.env.MIN_ATTESTATIONS_REQUIRED;
  delete process.env.MIN_TRACK_RECORD_DAYS;
});

function makeAttestation(daysOffset: number, tradeCount = 2) {
  const d = new Date('2026-01-01T00:00:00Z');
  d.setDate(d.getDate() + daysOffset);
  return {
    id: `att-${daysOffset}`,
    created_at: d.toISOString(),
    payload: { tradeCount },
  };
}

function setupMock(rows: ReturnType<typeof makeAttestation>[]) {
  const chain = {
    eq: mockEq,
  };
  const orderChain = {
    order: mockOrder,
  };
  mockOrder.mockResolvedValue({ data: rows, error: null });
  mockEq.mockReturnValueOnce(chain).mockReturnValueOnce(orderChain);
  mockSelect.mockReturnValue(chain);
}

describe('checkEligibility', () => {
  it('returns ineligible when attestation count below minimum', async () => {
    setupMock([makeAttestation(0), makeAttestation(5)]);
    const { checkEligibility } = await import('./strategy-eligibility.js');
    const result = await checkEligibility('0xabc', 'fx');
    expect(result.eligible).toBe(false);
    expect(result.issues.some((i) => i.includes('insufficient track record'))).toBe(true);
    expect(result.issues[0]).toMatch(/2 runs, need 10/);
  });

  it('returns ineligible when count passes but all within 1 day', async () => {
    process.env.MIN_ATTESTATIONS_REQUIRED = '3';
    const rows = [
      makeAttestation(0),
      makeAttestation(0),
      makeAttestation(0),
    ];
    setupMock(rows);
    const { checkEligibility } = await import('./strategy-eligibility.js');
    const result = await checkEligibility('0xabc', 'fx');
    expect(result.eligible).toBe(false);
    expect(result.issues.some((i) => i.includes('track record period too short'))).toBe(true);
  });

  it('returns eligible with correct stats when count + period pass', async () => {
    process.env.MIN_ATTESTATIONS_REQUIRED = '3';
    process.env.MIN_TRACK_RECORD_DAYS = '7';
    const rows = Array.from({ length: 12 }, (_, i) =>
      makeAttestation(i, 1),
    );
    setupMock(rows);
    const { checkEligibility } = await import('./strategy-eligibility.js');
    const result = await checkEligibility('0xabc', 'fx');
    expect(result.eligible).toBe(true);
    expect(result.attestationCount).toBe(12);
    expect(result.firstRunAt).toBe(rows[0].created_at);
    expect(result.lastRunAt).toBe(rows[11].created_at);
    expect(result.issues).toHaveLength(0);
  });

  it('roiPct is a finite number regardless of data shape', async () => {
    process.env.MIN_ATTESTATIONS_REQUIRED = '2';
    process.env.MIN_TRACK_RECORD_DAYS = '1';
    const rows = [
      { id: 'a', created_at: '2026-01-01T00:00:00Z', payload: null },
      { id: 'b', created_at: '2026-01-02T00:00:00Z', payload: { tradeCount: NaN } },
    ];
    setupMock(rows as ReturnType<typeof makeAttestation>[]);
    const { checkEligibility } = await import('./strategy-eligibility.js');
    const result = await checkEligibility('0xabc', 'fx');
    expect(result.eligible).toBe(true);
    expect(typeof result.roiPct).toBe('number');
    expect(Number.isFinite(result.roiPct)).toBe(true);
  });

  it('respects MIN_ATTESTATIONS_REQUIRED env override', async () => {
    process.env.MIN_ATTESTATIONS_REQUIRED = '3';
    process.env.MIN_TRACK_RECORD_DAYS = '1';
    const rows = Array.from({ length: 3 }, (_, i) => makeAttestation(i));
    setupMock(rows);
    const { checkEligibility } = await import('./strategy-eligibility.js');
    const result = await checkEligibility('0xabc', 'fx');
    expect(result.eligible).toBe(true);
    expect(result.attestationCount).toBe(3);
  });
});
