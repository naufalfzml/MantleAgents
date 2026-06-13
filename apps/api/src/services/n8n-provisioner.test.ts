const { mockSupabaseClient, mockFetch, setMockResult } = vi.hoisted(() => {
  type MockResult = { data: unknown; error: unknown };
  const results: Record<string, MockResult | MockResult[]> = {};

  function getNext(table: string): MockResult {
    const entry = results[table];
    if (!entry) return { data: null, error: null };
    if (Array.isArray(entry)) return entry.shift() ?? { data: null, error: null };
    return entry;
  }

  function chain(table: string) {
    const proxy: Record<string, unknown> = {};
    for (const m of ['select', 'update', 'eq', 'maybeSingle']) {
      proxy[m] = () => proxy;
    }
    proxy.then = (onFulfilled?: (v: unknown) => unknown) =>
      Promise.resolve(getNext(table)).then(onFulfilled);
    return proxy;
  }

  const mockSupabaseClient = { from: (t: string) => chain(t) };
  const mockFetch = vi.fn();
  const setMockResult = (table: string, value: MockResult | MockResult[]) => {
    results[table] = value;
  };

  return { mockSupabaseClient, mockFetch, setMockResult };
});

vi.mock('@mantleagents/db', () => ({ createSupabaseAdmin: () => mockSupabaseClient }));
vi.stubGlobal('fetch', mockFetch);

import { provisionUserWorkflow, generateN8nToken } from './n8n-provisioner.js';

beforeEach(() => {
  vi.clearAllMocks();
  setMockResult('user_profiles', { data: null, error: null });
  process.env.N8N_BASE_URL = 'http://localhost:5678';
  process.env.N8N_API_KEY = 'test-n8n-api-key';
  process.env.N8N_BRIDGE_API_KEY_SECRET = 'test-secret';
});

describe('provisionUserWorkflow', () => {
  it('returns existing workflowId without calling n8n when already provisioned', async () => {
    setMockResult('user_profiles', {
      data: { n8n_workflow_id: 'existing-wf-123' },
      error: null,
    });

    const result = await provisionUserWorkflow('0xabc');

    expect(result.workflowId).toBe('existing-wf-123');
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('returns configured: false when N8N_API_KEY is not set', async () => {
    delete process.env.N8N_API_KEY;

    const result = await provisionUserWorkflow('0xabc');

    expect(result.configured).toBe(false);
    expect(result.workflowId).toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('idempotency: calling twice returns same workflowId without re-provisioning', async () => {
    setMockResult('user_profiles', [
      { data: { n8n_workflow_id: 'wf-456' }, error: null },
      { data: { n8n_workflow_id: 'wf-456' }, error: null },
    ]);

    const first = await provisionUserWorkflow('0xdef');
    const second = await provisionUserWorkflow('0xdef');

    expect(first.workflowId).toBe('wf-456');
    expect(second.workflowId).toBe('wf-456');
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

describe('generateN8nToken', () => {
  it('produces a dot-separated base64url token', () => {
    const token = generateN8nToken('0xwallet');
    expect(token).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
  });

  it('embeds the wallet address in the payload', () => {
    const token = generateN8nToken('0xmywallet');
    const [payloadB64] = token.split('.');
    const payload = JSON.parse(Buffer.from(payloadB64!, 'base64url').toString());
    expect(payload.sub).toBe('0xmywallet');
  });

  it('sets exp ~5 minutes in the future', () => {
    const before = Math.floor(Date.now() / 1000);
    const token = generateN8nToken('0xwallet');
    const [payloadB64] = token.split('.');
    const payload = JSON.parse(Buffer.from(payloadB64!, 'base64url').toString());
    expect(payload.exp).toBeGreaterThanOrEqual(before + 290);
    expect(payload.exp).toBeLessThanOrEqual(before + 310);
  });
});
