import { config as loadEnv } from 'dotenv';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSupabaseAdmin } from '@mantleagents/db';

type AgentType = 'fx' | 'yield';

function getArg(name: string): string | undefined {
  const match = process.argv.find((arg) => arg.startsWith(`${name}=`));
  return match?.split('=')[1];
}

async function main() {
  const scriptDir = dirname(fileURLToPath(import.meta.url));
  const envPaths = [
    resolve(process.cwd(), '.env'),
    resolve(process.cwd(), 'apps/api/.env'),
    resolve(scriptDir, '../../.env'),
  ];
  for (const envPath of envPaths) {
    loadEnv({ path: envPath, override: false });
  }

  const supabaseAdmin = createSupabaseAdmin(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const agentTypeArg = (getArg('--agent-type') || 'all').toLowerCase();
  const limit = Number.parseInt(getArg('--limit') || '200', 10);
  const agentTypes: AgentType[] =
    agentTypeArg === 'fx' || agentTypeArg === 'yield'
      ? [agentTypeArg]
      : ['fx', 'yield'];

  const rows: Array<Record<string, unknown>> = [];

  for (const agentType of agentTypes) {
    const table = agentType === 'yield' ? 'yield_agent_timeline' : 'fx_agent_timeline';
    const { data, error } = await (supabaseAdmin as any)
      .from(table)
      .select('wallet_address,event_type,tx_hash,run_id,created_at')
      .eq('event_type', 'trade')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      throw new Error(`Failed to fetch ${table}: ${error.message}`);
    }

    for (const row of (data ?? []) as Array<Record<string, unknown>>) {
      rows.push({ ...row, agent_type: agentType });
    }
  }

  const wallets = Array.from(new Set(rows.map((r) => String(r.wallet_address))));
  const { data: configs, error: cfgError } = await supabaseAdmin
    .from('agent_configs')
    .select('wallet_address,agent_type,agent_8004_id')
    .in('wallet_address', wallets);
  if (cfgError) {
    throw new Error(`Failed to fetch configs: ${cfgError.message}`);
  }

  const configMap = new Map<string, number | null>();
  for (const c of (configs ?? []) as Array<{ wallet_address: string; agent_type: AgentType; agent_8004_id: number | null }>) {
    configMap.set(`${c.wallet_address}:${c.agent_type}`, c.agent_8004_id);
  }

  const report = rows.map((row) => {
    const walletAddress = String(row.wallet_address);
    const agentType = String(row.agent_type) as AgentType;
    const txHash = (row.tx_hash as string | null) ?? null;
    const agent8004Id = configMap.get(`${walletAddress}:${agentType}`) ?? null;
    let status = 'ready';
    if (!agent8004Id) status = 'missing_agent_8004_id';
    else if (!txHash) status = 'missing_tx_hash';
    return {
      walletAddress,
      agentType,
      runId: (row.run_id as string | null) ?? null,
      txHash,
      createdAt: row.created_at,
      agent8004Id,
      status,
    };
  });

  const summary = {
    totalTrades: report.length,
    ready: report.filter((r) => r.status === 'ready').length,
    missingAgent8004Id: report.filter((r) => r.status === 'missing_agent_8004_id').length,
    missingTxHash: report.filter((r) => r.status === 'missing_tx_hash').length,
  };

  console.log('[feedback-audit] Summary');
  console.log(JSON.stringify(summary, null, 2));
  console.log('[feedback-audit] Sample');
  console.log(JSON.stringify(report.slice(0, 25), null, 2));
}

main().catch((error) => {
  console.error('[feedback-audit] Fatal:', error);
  process.exit(1);
});
