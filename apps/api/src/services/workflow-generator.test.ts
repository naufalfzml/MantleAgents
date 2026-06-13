const { mockGenerateText, mockSupabaseInsert } = vi.hoisted(() => {
  const mockGenerateText = vi.fn();
  const mockInsert = vi.fn().mockResolvedValue({ data: null, error: null });
  const mockFrom = vi.fn(() => ({ insert: mockInsert }));
  const mockSupabaseInsert = { mockInsert, mockFrom };
  return { mockGenerateText, mockSupabaseInsert };
});

vi.mock('ai', () => ({
  generateText: mockGenerateText,
  Output: { object: vi.fn(() => ({ type: 'object' })) },
}));
vi.mock('@ai-sdk/google', () => ({
  createGoogleGenerativeAI: () => () => 'mock-model',
}));
vi.mock('ai-sdk-provider-gemini-cli', () => ({
  createGeminiProvider: () => () => 'mock-model',
}));
vi.mock('@mantleagents/db', () => ({
  createSupabaseAdmin: () => ({ from: mockSupabaseInsert.mockFrom }),
}));

import { generateWorkflow } from './workflow-generator.js';

const USER_CONFIG = { max_trade_size_pct: 25, stop_loss_pct: 10 };

const VALID_WORKFLOW = {
  name: 'Test Strategy',
  nodes: [
    { type: 'n8n-nodes-base.httpRequest', name: 'Get Market Data', parameters: {} },
    { type: 'n8n-nodes-base.httpRequest', name: 'AI Signal Analysis', parameters: {} },
    { type: 'n8n-nodes-base.httpRequest', name: 'Risk Check', parameters: {} },
    { type: 'n8n-nodes-base.httpRequest', name: 'Guardrail Check', parameters: { maxValuePerTx: 20, stopLossPct: 5 } },
    { type: 'n8n-nodes-base.httpRequest', name: 'Execute Trade', parameters: {} },
    { type: 'n8n-nodes-base.httpRequest', name: 'Commit Attestation', parameters: {} },
  ],
  connections: {},
};

beforeEach(() => {
  vi.clearAllMocks();
  mockSupabaseInsert.mockInsert.mockResolvedValue({ data: null, error: null });
  process.env.GEMINI_CLI_AUTH_TYPE = 'api-key';
  process.env.GEMINI_API_KEY = 'test-key';
});

describe('generateWorkflow', () => {
  it('returns non-null workflowJson and validation result when LLM returns valid workflow', async () => {
    mockGenerateText.mockResolvedValue({ output: VALID_WORKFLOW });

    const result = await generateWorkflow('buy WMNT when volume is high', USER_CONFIG, '0xWallet');

    expect(result.workflowJson).not.toBeNull();
    expect(result.validation.passed).toBe(true);
    expect(result.summary).toContain('Test Strategy');
  });

  it('returns workflowJson: null and failed validation when LLM throws', async () => {
    mockGenerateText.mockRejectedValue(new Error('model error'));

    const result = await generateWorkflow('bad prompt', USER_CONFIG, '0xWallet');

    expect(result.workflowJson).toBeNull();
    expect(result.validation.passed).toBe(false);
    expect(result.validation.issues).toContain('invalid JSON from model');
    expect(result.summary).toContain('Generation failed');
  });

  it('returns workflowJson: null when LLM returns no output', async () => {
    mockGenerateText.mockResolvedValue({ output: null });

    const result = await generateWorkflow('empty prompt', USER_CONFIG, '0xWallet');

    expect(result.workflowJson).toBeNull();
    expect(result.validation.passed).toBe(false);
  });

  it('returns validation.passed: false when generated workflow violates guardrails', async () => {
    const violatingWorkflow = {
      ...VALID_WORKFLOW,
      nodes: VALID_WORKFLOW.nodes.map((n) =>
        n.name === 'Guardrail Check'
          ? { ...n, parameters: { maxValuePerTx: 99, stopLossPct: 5 } } // exceeds 25
          : n,
      ),
    };
    mockGenerateText.mockResolvedValue({ output: violatingWorkflow });

    const result = await generateWorkflow('oversized trade', USER_CONFIG, '0xWallet');

    expect(result.validation.passed).toBe(false);
    expect(result.validation.issues.some((i) => /maxValuePerTx/.test(i))).toBe(true);
  });

  it('inserts generated_workflows row for valid generation', async () => {
    mockGenerateText.mockResolvedValue({ output: VALID_WORKFLOW });

    await generateWorkflow('buy WMNT', USER_CONFIG, '0xWallet');

    expect(mockSupabaseInsert.mockFrom).toHaveBeenCalledWith('generated_workflows');
    expect(mockSupabaseInsert.mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({ wallet_address: '0xWallet', output_json: expect.any(Object) }),
    );
  });

  it('inserts generated_workflows row with null output_json on LLM failure', async () => {
    mockGenerateText.mockRejectedValue(new Error('fail'));

    await generateWorkflow('bad', USER_CONFIG, '0xWallet');

    expect(mockSupabaseInsert.mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({ output_json: null }),
    );
  });
});
