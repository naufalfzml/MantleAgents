import { createHash, createHmac } from 'node:crypto';
import { createSupabaseAdmin } from '@mantleagents/db';
import { createWalletClient, http, keccak256, stringToBytes } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { attestationRegistryAbi } from '../abis/attestation-registry.js';
import {
  MANTLE_CHAIN,
  getAttestationRegistryAddress,
  mantleExplorerTxUrl,
  mantleRpcUrl,
} from '../lib/chains.js';

export type AgentType = 'fx' | 'yield';
export type AttestationStatus = 'missing' | 'verified' | 'invalid';

type TimelineEventRow = {
  event_type: string;
  summary: string;
  tx_hash: string | null;
  created_at: string;
};

type TimelineEventDetailRow = TimelineEventRow & {
  detail?: Record<string, unknown> | null;
  amount_usd?: number | null;
  currency?: string | null;
  direction?: string | null;
  confidence_pct?: number | null;
};

type DecisionInputSnapshot = {
  signal: Record<string, unknown>;
  guardrailParams: Record<string, unknown>;
  marketDataSnapshot: Record<string, unknown>;
};

type DecisionTrail = {
  signal: {
    action: string | null;
    label: string | null;
    confidence: number | null;
    reasoning: string | null;
    raw: Record<string, unknown>;
  } | null;
  guardrail: {
    passed: boolean;
    summary: string;
    rule: string | null;
    raw: Record<string, unknown> | null;
  } | null;
  outcome: {
    status: 'executed' | 'failed' | 'skipped';
    summary: string;
    txHash: string | null;
    amountUsd: number | null;
    raw: Record<string, unknown> | null;
  } | null;
};

interface AttestationPayload {
  schema: 'mantleagents/attestation-v1' | 'mantleagents/attestation-v2';
  walletAddress: string;
  agentType: AgentType;
  runId: string;
  eventCount: number;
  tradeCount: number;
  txHashes: string[];
  eventsHash: string;
  decisionHash: string | null;
  generatedAt: string;
}

interface AttestationRow {
  id: string;
  wallet_address: string;
  agent_type: AgentType;
  run_id: string | null;
  payload: Partial<AttestationPayload> | null;
  signature: string;
  algorithm: string;
  commit_tx_hash?: string | null;
  is_mock?: boolean;
  is_development?: boolean;
  created_at: string;
}

const ZERO_HASH = '0'.repeat(64);

const supabaseAdmin = createSupabaseAdmin(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

function getTimelineTable(agentType: AgentType): 'fx_agent_timeline' | 'yield_agent_timeline' {
  return agentType === 'yield' ? 'yield_agent_timeline' : 'fx_agent_timeline';
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
      a.localeCompare(b),
    );
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function getAttestationSecret(): string {
  return (
    process.env.ATTESTATION_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    'mantleagents-dev-attestation-secret'
  );
}

function signPayload(payload: AttestationPayload): string {
  const canonical = stableStringify(payload);
  return createHmac('sha256', getAttestationSecret()).update(canonical).digest('hex');
}

function hashEvents(events: TimelineEventRow[]): string {
  return createHash('sha256')
    .update(
      events
        .map((event) => `${event.created_at}|${event.event_type}|${event.summary}|${event.tx_hash ?? ''}`)
        .join('\n'),
    )
    .digest('hex');
}

function toBytes32Hex(hash: string | null | undefined): `0x${string}` {
  return `0x${(hash ?? ZERO_HASH).toLowerCase()}` as `0x${string}`;
}

function computeRunIdHash(runId: string): `0x${string}` {
  return keccak256(stringToBytes(runId));
}

function extractDecisionInputSnapshot(events: TimelineEventRow[]): DecisionInputSnapshot | null {
  const decisionInputEvent = events.find((event) => event.event_type === 'decision_input');
  if (!decisionInputEvent?.summary) return null;

  try {
    const parsed = JSON.parse(decisionInputEvent.summary) as Partial<DecisionInputSnapshot>;
    if (!parsed || typeof parsed !== 'object') return null;
    if (!parsed.signal || !parsed.guardrailParams || !parsed.marketDataSnapshot) return null;
    return parsed as DecisionInputSnapshot;
  } catch {
    return null;
  }
}

function buildDecisionTrail(events: TimelineEventDetailRow[]): DecisionTrail | null {
  if (events.length === 0) return null;

  const snapshot = extractDecisionInputSnapshot(events);
  const signal = snapshot
    ? {
        action:
          (snapshot.signal.direction as string | undefined) ??
          (snapshot.signal.action as string | undefined) ??
          null,
        label:
          (snapshot.signal.currency as string | undefined) ??
          (snapshot.signal.vaultName as string | undefined) ??
          (snapshot.signal.vaultAddress as string | undefined) ??
          null,
        confidence:
          typeof snapshot.signal.confidence === 'number'
            ? snapshot.signal.confidence
            : null,
        reasoning:
          typeof snapshot.signal.reasoning === 'string'
            ? snapshot.signal.reasoning
            : null,
        raw: snapshot.signal,
      }
    : null;

  const guardrailEvent = events.find((event) => event.event_type === 'guardrail');
  const guardrail = guardrailEvent
    ? {
        passed: false,
        summary: guardrailEvent.summary,
        rule:
          typeof guardrailEvent.detail?.rule === 'string'
            ? guardrailEvent.detail.rule
            : null,
        raw: guardrailEvent.detail ?? null,
      }
    : signal
      ? {
          passed: true,
          summary: 'Passed pre-execution guardrails',
          rule: null,
          raw: null,
        }
      : null;

  const outcomeEvent = events.find(
    (event) => event.event_type === 'trade' || event.event_type === 'trade_failed',
  );
  const outcome = outcomeEvent
    ? {
        status:
          outcomeEvent.event_type === 'trade'
            ? ('executed' as const)
            : ('failed' as const),
        summary: outcomeEvent.summary,
        txHash: outcomeEvent.tx_hash ?? null,
        amountUsd: outcomeEvent.amount_usd ?? null,
        raw: outcomeEvent.detail ?? null,
      }
    : guardrailEvent
      ? {
          status: 'skipped' as const,
          summary: 'Execution skipped by guardrail',
          txHash: null,
          amountUsd: null,
          raw: guardrailEvent.detail ?? null,
        }
      : null;

  if (!signal && !guardrail && !outcome) return null;
  return { signal, guardrail, outcome };
}

function normalizePayload(rawPayload: Partial<AttestationPayload> | null | undefined) {
  const payload = { ...(rawPayload ?? {}) } as Partial<AttestationPayload>;
  if (typeof payload.schema === 'string' && payload.schema.includes('mock')) {
    payload.schema = payload.schema.replace(
      'mock-attestation',
      'attestation',
    ) as AttestationPayload['schema'];
  }
  return payload;
}

function mapAttestationRow(
  row: Record<string, unknown>,
  decisionTrail: DecisionTrail | null = null,
) {
  const payload = normalizePayload(row.payload as Partial<AttestationPayload> | null);
  const commitTxHash =
    typeof row.commit_tx_hash === 'string' ? row.commit_tx_hash : null;
  const eventsHash =
    typeof payload.eventsHash === 'string' ? payload.eventsHash : null;
  const decisionHash =
    typeof payload.decisionHash === 'string' ? payload.decisionHash : null;

  return {
    id: row.id as string,
    walletAddress: row.wallet_address as string,
    agentType: row.agent_type as AgentType,
    runId: (row.run_id as string | null) ?? null,
    payload,
    signature: row.signature as string,
    algorithm: row.algorithm as string,
    eventsHash,
    decisionHash,
    commitTxHash,
    commitTxExplorerUrl: commitTxHash ? mantleExplorerTxUrl(commitTxHash) : null,
    decisionTrail,
    isDevelopment: Boolean(row.is_development ?? row.is_mock),
    createdAt: row.created_at as string,
  };
}

async function loadRunTimelineEvents(params: {
  walletAddress: string;
  agentType: AgentType;
  runId: string;
}): Promise<TimelineEventDetailRow[]> {
  const { data, error } = await supabaseAdmin
    .from(getTimelineTable(params.agentType))
    .select(
      'event_type,summary,detail,tx_hash,amount_usd,currency,direction,confidence_pct,created_at',
    )
    .eq('wallet_address', params.walletAddress)
    .eq('run_id', params.runId)
    .order('created_at', { ascending: true });

  if (error) {
    throw new Error(`Failed to load run timeline for attestation: ${error.message}`);
  }

  return (data ?? []) as TimelineEventDetailRow[];
}

async function getAgentIdForAttestation(params: {
  walletAddress: string;
  agentType: AgentType;
}): Promise<bigint | null> {
  const { data, error } = await supabaseAdmin
    .from('agent_configs')
    .select('agent_8004_id')
    .eq('wallet_address', params.walletAddress)
    .eq('agent_type', params.agentType)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load agent config for attestation: ${error.message}`);
  }

  const agentId = (data as { agent_8004_id?: number | null } | null)?.agent_8004_id;
  return agentId == null ? null : BigInt(agentId);
}

export function computeDecisionHash(input: DecisionInputSnapshot): string {
  return createHash('sha256').update(stableStringify(input)).digest('hex');
}

export async function commitAttestationOnChain(params: {
  agentId: bigint;
  runId: string;
  eventsHash: string;
  decisionHash: string | null;
  tradeCount: number;
}): Promise<string | null> {
  try {
    const privateKey = process.env.EVM_SIGNER_PRIVATE_KEY as `0x${string}` | undefined;
    if (!privateKey) {
      throw new Error('EVM_SIGNER_PRIVATE_KEY is required');
    }

    const account = privateKeyToAccount(privateKey);
    const walletClient = createWalletClient({
      account,
      chain: MANTLE_CHAIN,
      transport: http(mantleRpcUrl()),
    });

    const txHash = await walletClient.writeContract({
      address: getAttestationRegistryAddress(),
      abi: attestationRegistryAbi,
      functionName: 'commitAttestation',
      args: [
        params.agentId,
        computeRunIdHash(params.runId),
        toBytes32Hex(params.eventsHash),
        toBytes32Hex(params.decisionHash),
        BigInt(params.tradeCount),
      ],
      account,
      chain: MANTLE_CHAIN,
    });

    return txHash;
  } catch (error) {
    console.warn('[attestation] On-chain commit failed (non-fatal):', {
      runId: params.runId,
      agentId: params.agentId.toString(),
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

export async function createAndAttachRunAttestation(params: {
  walletAddress: string;
  agentType: AgentType;
  runId: string;
  agentId: bigint;
}): Promise<{ attestationId: string; commitTxHash: string | null } | null> {
  const { walletAddress, agentType, runId, agentId } = params;
  const tableName = getTimelineTable(agentType);

  const { data: events, error: eventsError } = await supabaseAdmin
    .from(tableName)
    .select('event_type,summary,tx_hash,created_at')
    .eq('wallet_address', walletAddress)
    .eq('run_id', runId)
    .order('created_at', { ascending: true });

  if (eventsError) {
    throw new Error(`Failed to load timeline events for attestation: ${eventsError.message}`);
  }

  const timelineEvents = (events ?? []) as TimelineEventRow[];

  if (timelineEvents.length === 0) return null;

  const txHashes = Array.from(
    new Set(
      timelineEvents
        .map((event) => event.tx_hash)
        .filter((hash): hash is string => Boolean(hash)),
    ),
  );

  const decisionInputSnapshot = extractDecisionInputSnapshot(timelineEvents);
  const decisionHash = decisionInputSnapshot
    ? computeDecisionHash(decisionInputSnapshot)
    : null;

  const payload: AttestationPayload = {
    schema: 'mantleagents/attestation-v2',
    walletAddress,
    agentType,
    runId,
    eventCount: timelineEvents.length,
    tradeCount: timelineEvents.filter((event) => event.event_type === 'trade').length,
    txHashes,
    eventsHash: hashEvents(timelineEvents),
    decisionHash,
    generatedAt: new Date().toISOString(),
  };

  const signature = signPayload(payload);

  const { data: created, error: createError } = await supabaseAdmin
    .from('agent_attestations' as any)
    .insert({
      wallet_address: walletAddress,
      agent_type: agentType,
      run_id: runId,
      payload,
      signature,
      algorithm: 'HMAC-SHA256',
      is_development: true,
      commit_tx_hash: null,
    })
    .select('*')
    .single();

  if (createError || !created) {
    throw new Error(`Failed to create attestation: ${createError?.message ?? 'Unknown error'}`);
  }

  const attestation = created as unknown as AttestationRow;
  const isVerified = attestation.signature === signature;

  const commitTxHash = await commitAttestationOnChain({
    agentId,
    runId,
    eventsHash: payload.eventsHash,
    decisionHash: payload.decisionHash,
    tradeCount: payload.tradeCount,
  });

  if (commitTxHash) {
    const { error: commitUpdateError } = await supabaseAdmin
      .from('agent_attestations' as any)
      .update({ commit_tx_hash: commitTxHash })
      .eq('id', attestation.id);

    if (commitUpdateError) {
      throw new Error(
        `Failed to store attestation commit tx hash: ${commitUpdateError.message}`,
      );
    }
  }

  const { error: updateError } = await supabaseAdmin
    .from(tableName)
    .update({
      attestation_id: attestation.id,
      attestation_status: isVerified ? 'verified' : 'invalid',
    } as any)
    .eq('wallet_address', walletAddress)
    .eq('run_id', runId);

  if (updateError) {
    throw new Error(`Failed to attach attestation to timeline rows: ${updateError.message}`);
  }

  return {
    attestationId: attestation.id,
    commitTxHash,
  };
}

export async function listAttestations(params: {
  walletAddress: string;
  agentType: AgentType;
  limit?: number;
  offset?: number;
}) {
  const limit = Math.min(100, Math.max(1, params.limit ?? 20));
  const offset = Math.max(0, params.offset ?? 0);

  const { data, error, count } = await supabaseAdmin
    .from('agent_attestations' as any)
    .select('*', { count: 'exact' })
    .eq('wallet_address', params.walletAddress)
    .eq('agent_type', params.agentType)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    throw new Error(`Failed to fetch attestations: ${error.message}`);
  }

  return {
    entries: (data ?? []).map((row) =>
      mapAttestationRow(row as unknown as Record<string, unknown>),
    ),
    total: count ?? 0,
    hasMore: offset + limit < (count ?? 0),
  };
}

export async function getAttestationById(params: {
  walletAddress: string;
  agentType: AgentType;
  id: string;
}) {
  const { data, error } = await supabaseAdmin
    .from('agent_attestations' as any)
    .select('*')
    .eq('id', params.id)
    .eq('wallet_address', params.walletAddress)
    .eq('agent_type', params.agentType)
    .single();

  if (error || !data) return null;

  const attestation = data as unknown as AttestationRow;
  const timelineEvents =
    attestation.run_id == null
      ? []
      : await loadRunTimelineEvents({
          walletAddress: params.walletAddress,
          agentType: params.agentType,
          runId: attestation.run_id,
        });

  return mapAttestationRow(
    data as unknown as Record<string, unknown>,
    buildDecisionTrail(timelineEvents),
  );
}

export async function getLatestAttestationSummary(params: {
  walletAddress: string;
  agentType: AgentType;
}): Promise<{
  status: 'active' | 'none';
  latestAttestationAt: string | null;
}> {
  const { data, error } = await supabaseAdmin
    .from('agent_attestations' as any)
    .select('id,created_at')
    .eq('wallet_address', params.walletAddress)
    .eq('agent_type', params.agentType)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) {
    return { status: 'none', latestAttestationAt: null };
  }

  return {
    status: 'active',
    latestAttestationAt: (data as unknown as { created_at: string }).created_at,
  };
}

export async function backfillRunAttestations(params: {
  agentType: AgentType | 'all';
  limit: number;
  dryRun: boolean;
}) {
  const agentTypes: AgentType[] = params.agentType === 'all' ? ['fx', 'yield'] : [params.agentType];
  const results: Array<{ walletAddress: string; agentType: AgentType; runId: string; created: boolean; skipped: boolean; error?: string }> = [];

  for (const agentType of agentTypes) {
    const tableName = getTimelineTable(agentType);
    const { data, error } = await (supabaseAdmin as any)
      .from(tableName)
      .select('wallet_address,run_id,attestation_id')
      .not('run_id', 'is', null)
      .order('created_at', { ascending: false })
      .limit(params.limit);

    if (error) {
      throw new Error(`Failed to read ${tableName} for backfill: ${error.message}`);
    }

    const uniqueRuns = new Map<string, { walletAddress: string; runId: string; hasAttestation: boolean }>();
    for (const row of (data ?? []) as Array<{
      wallet_address: string;
      run_id: string | null;
      attestation_id: string | null;
    }>) {
      if (!row.run_id) continue;
      const key = `${row.wallet_address}:${row.run_id}`;
      const existing = uniqueRuns.get(key);
      if (!existing) {
        uniqueRuns.set(key, {
          walletAddress: row.wallet_address,
          runId: row.run_id,
          hasAttestation: Boolean(row.attestation_id),
        });
      } else if (row.attestation_id) {
        existing.hasAttestation = true;
      }
    }

    for (const run of uniqueRuns.values()) {
      if (run.hasAttestation) {
        results.push({
          walletAddress: run.walletAddress,
          agentType,
          runId: run.runId,
          created: false,
          skipped: true,
        });
        continue;
      }

      if (params.dryRun) {
        results.push({
          walletAddress: run.walletAddress,
          agentType,
          runId: run.runId,
          created: false,
          skipped: false,
        });
        continue;
      }

      try {
        const agentId = await getAgentIdForAttestation({
          walletAddress: run.walletAddress,
          agentType,
        });

        if (agentId == null) {
          results.push({
            walletAddress: run.walletAddress,
            agentType,
            runId: run.runId,
            created: false,
            skipped: false,
            error: 'Agent has no ERC-8004 id; cannot commit attestation on-chain',
          });
          continue;
        }

        const created = await createAndAttachRunAttestation({
          walletAddress: run.walletAddress,
          agentType,
          runId: run.runId,
          agentId,
        });
        results.push({
          walletAddress: run.walletAddress,
          agentType,
          runId: run.runId,
          created: Boolean(created),
          skipped: created == null,
        });
      } catch (error) {
        results.push({
          walletAddress: run.walletAddress,
          agentType,
          runId: run.runId,
          created: false,
          skipped: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  return {
    total: results.length,
    created: results.filter((r) => r.created).length,
    skipped: results.filter((r) => r.skipped).length,
    errors: results.filter((r) => r.error).length,
    results,
  };
}
