import { generateText, Output } from 'ai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createGeminiProvider } from 'ai-sdk-provider-gemini-cli';
import { z } from 'zod';
import { createSupabaseAdmin } from '@mantleagents/db';
import type { GeneratedWorkflow } from '@mantleagents/shared';
import { validateWorkflow, type AgentConfigForRules } from './workflow-validator.js';

const supabaseAdmin = createSupabaseAdmin(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

// ---------------------------------------------------------------------------
// LLM provider (same pattern as llm-analyzer.ts)
// ---------------------------------------------------------------------------

function getGeminiProvider() {
  const authType = process.env.GEMINI_CLI_AUTH_TYPE || 'oauth-personal';
  if (authType === 'api-key') {
    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    if (!apiKey) throw new Error('GEMINI_API_KEY required');
    return createGoogleGenerativeAI({ apiKey });
  }
  return createGeminiProvider({ authType: 'oauth-personal' });
}

function getLlmModel() {
  return process.env.LLM_MODEL || 'gemini-2.5-flash';
}

// ---------------------------------------------------------------------------
// Zod schema — constrains LLM output to a subset of n8n workflow JSON
// ---------------------------------------------------------------------------

export const N8nWorkflowSchema = z.object({
  name: z.string(),
  nodes: z.array(
    z.object({
      type: z.string(),
      name: z.string(),
      parameters: z.record(z.string(), z.unknown()).optional().default({}),
    }),
  ),
  connections: z.record(z.string(), z.unknown()),
  notes: z.string().optional(),
});

export type N8nWorkflow = z.infer<typeof N8nWorkflowSchema>;

// ---------------------------------------------------------------------------
// Available node schema (auto-derived from bridge types)
// ---------------------------------------------------------------------------

const AVAILABLE_NODES = [
  {
    name: 'Get Market Data',
    endpoint: '/api/n8n/market-data',
    description: 'Fetch price, kline, volume, and risk data for a token',
    inputs: ['walletAddress', 'chain', 'tokenAddress', 'klineInterval', 'klineLimit'],
    outputs: ['marketData', 'kline', 'riskSummary'],
  },
  {
    name: 'AI Signal Analysis',
    endpoint: '/api/n8n/signal-analysis',
    description: 'Use Gemini AI to analyze market data and generate trading signals',
    inputs: ['walletAddress', 'news', 'currentPositions', 'portfolioValueUsd', 'allowedCurrencies'],
    outputs: ['signals', 'marketSummary'],
  },
  {
    name: 'Guardrail Check',
    endpoint: '/api/n8n/guardrail-check',
    description: 'Validate a trading signal against user-configured risk guardrails',
    inputs: ['walletAddress', 'signal', 'config', 'positions', 'portfolioValueUsd', 'tradesToday', 'tradeAmountUsd', 'maxValuePerTx', 'stopLossPct'],
    outputs: ['passed', 'blockedReason', 'ruleName'],
  },
  {
    name: 'Risk Check',
    endpoint: '/api/n8n/risk-check',
    description: 'Run GoPlus transaction simulation to detect honeypot, high tax, mint risk, etc.',
    inputs: ['walletAddress', 'chain', 'tokenAddress'],
    outputs: ['riskSummary', 'flags'],
  },
  {
    name: 'Execute Trade',
    endpoint: '/api/n8n/execute-trade',
    description: 'Execute a swap on-chain (Mantle via RealClaw, other chains via AVE)',
    inputs: ['walletAddress', 'serverWalletId', 'serverWalletAddress', 'currency', 'direction', 'amountUsd', 'chain', 'inTokenAddress', 'outTokenAddress'],
    outputs: ['success', 'txHash', 'amountIn', 'amountOut'],
  },
  {
    name: 'Commit Attestation',
    endpoint: '/api/n8n/commit-attestation',
    description: 'Commit a run attestation hash to the AgentAttestationRegistry on Mantle',
    inputs: ['walletAddress', 'agentType', 'runId', 'agentId'],
    outputs: ['attestationId', 'commitTxHash'],
  },
];

export function buildNodeSchemaSnippet(): string {
  return JSON.stringify(AVAILABLE_NODES, null, 2);
}

export function buildGeneratorSystemPrompt(nodeSchemaSnippet: string): string {
  return `You are an autonomous trading agent workflow architect for MantleAgents on Mantle blockchain.

You MUST generate a valid n8n workflow JSON that uses ONLY nodes from the following list:

AVAILABLE_NODES:
${nodeSchemaSnippet}

REQUIRED RULES:
1. ALWAYS include a "Guardrail Check" node before any "Execute Trade" node.
2. ALWAYS include a "Risk Check" node when an "Execute Trade" node is present.
3. When the user mentions honeypot detection, contract risk, or GoPlus, use the "Risk Check" node — NEVER an AI/LLM node for this purpose.
4. If the prompt implies guaranteed profits or always-winning strategies, set conservative guardrail parameters (maxValuePerTx <= 5, stopLossPct <= 3) and add a notes field: "Note: No strategy guarantees profit. Conservative defaults applied."
5. Node connections must follow a logical sequence: data fetch → AI analysis → risk checks → guardrail → trade → attestation.
6. Use node type "n8n-nodes-base.httpRequest" for all bridge nodes.
7. The connections object must use node names as keys.

OUTPUT FORMAT:
Return only the JSON object matching the schema — no markdown, no explanation.`;
}

// ---------------------------------------------------------------------------
// Main generator function
// ---------------------------------------------------------------------------

export async function generateWorkflow(
  prompt: string,
  userConfig: AgentConfigForRules,
  walletAddress: string,
): Promise<GeneratedWorkflow> {
  const nodeSchemaSnippet = buildNodeSchemaSnippet();
  const systemPrompt = buildGeneratorSystemPrompt(nodeSchemaSnippet);

  let workflowJson: Record<string, unknown> | null = null;
  let summary = '';
  let validation = { passed: false, issues: ['invalid JSON from model'] };

  try {
    const result = await generateText({
      model: getGeminiProvider()(getLlmModel()),
      output: Output.object({ schema: N8nWorkflowSchema }),
      system: systemPrompt,
      prompt: `Generate an n8n workflow for this trading strategy:\n\n${prompt}`,
    });

    if (!result.output) {
      throw new Error('No output from LLM');
    }

    const workflow = result.output as N8nWorkflow;
    workflowJson = workflow as unknown as Record<string, unknown>;

    const nodeNames = workflow.nodes.map((n) => n.name);
    summary = `Workflow "${workflow.name}" with ${workflow.nodes.length} nodes: ${nodeNames.join(' → ')}`;
    if (workflow.notes) summary += `. Note: ${workflow.notes}`;

    validation = validateWorkflow(workflowJson, userConfig);
  } catch (err) {
    console.error('[workflow-generator] Generation failed:', err);
    workflowJson = null;
    summary = 'Generation failed: invalid model output';
    validation = { passed: false, issues: ['invalid JSON from model'] };
  }

  try {
    await (supabaseAdmin as any)
      .from('generated_workflows')
      .insert({
        wallet_address: walletAddress,
        prompt,
        output_json: workflowJson,
        validation_result: validation,
      });
  } catch (err) {
    console.error('[workflow-generator] Failed to log audit row:', err);
  }

  return { workflowJson, summary, validation };
}
