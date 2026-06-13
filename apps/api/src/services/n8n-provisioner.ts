import { createHash, createHmac } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createSupabaseAdmin } from '@mantleagents/db';

const supabaseAdmin = createSupabaseAdmin(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const TEMPLATE_PATH = join(__dirname, '../../../../n8n/templates/fx-agent-default-flow.json');

export function generateN8nToken(walletAddress: string): string {
  const secret = process.env.N8N_BRIDGE_API_KEY_SECRET ?? 'mantleagents-dev-secret';
  const exp = Math.floor(Date.now() / 1000) + 300;
  const payload = Buffer.from(JSON.stringify({ sub: walletAddress, exp })).toString('base64url');
  const sig = createHmac('sha256', secret).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

function workflowNameFor(walletAddress: string): string {
  return `FX Agent — ${walletAddress.slice(0, 10)}`;
}

export async function provisionUserWorkflow(walletAddress: string): Promise<{
  workflowId: string | null;
  n8nBaseUrl: string;
  token: string;
  configured: boolean;
}> {
  const n8nBaseUrl = process.env.N8N_BASE_URL ?? 'http://localhost:5678';
  const n8nApiKey = process.env.N8N_API_KEY ?? null;
  const token = generateN8nToken(walletAddress);

  if (!n8nApiKey) {
    return { workflowId: null, n8nBaseUrl, token, configured: false };
  }

  const { data: profile, error: profileError } = await supabaseAdmin
    .from('user_profiles' as any)
    .select('n8n_workflow_id')
    .eq('wallet_address', walletAddress)
    .maybeSingle();

  if (profileError) {
    throw new Error(`Failed to read user profile: ${profileError.message}`);
  }

  const existingId = (profile as { n8n_workflow_id?: string | null } | null)?.n8n_workflow_id;
  if (existingId) {
    return { workflowId: existingId, n8nBaseUrl, token, configured: true };
  }

  const templateRaw = await readFile(TEMPLATE_PATH, 'utf-8');
  const template = JSON.parse(templateRaw) as Record<string, unknown>;
  template.name = workflowNameFor(walletAddress);

  const response = await fetch(`${n8nBaseUrl}/api/v1/workflows`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-N8N-API-KEY': n8nApiKey,
    },
    body: JSON.stringify(template),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`n8n workflow creation failed: ${response.status} ${body}`);
  }

  const created = (await response.json()) as { id: string };
  const workflowId = String(created.id);

  await supabaseAdmin
    .from('user_profiles' as any)
    .update({ n8n_workflow_id: workflowId })
    .eq('wallet_address', walletAddress);

  return { workflowId, n8nBaseUrl, token, configured: true };
}

export function deriveN8nApiKey(walletAddress: string): string {
  const secret = process.env.N8N_BRIDGE_API_KEY_SECRET ?? '';
  return createHmac('sha256', secret).update(walletAddress).digest('hex');
}

export { createHash };
