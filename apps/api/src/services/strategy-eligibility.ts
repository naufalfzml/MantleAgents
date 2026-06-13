import { createSupabaseAdmin } from '@mantleagents/db';
import type { EligibilityResult } from '@mantleagents/shared';

const supabaseAdmin = createSupabaseAdmin(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

function getMinAttestations(): number {
  const val = parseInt(process.env.MIN_ATTESTATIONS_REQUIRED ?? '10', 10);
  return isFinite(val) && val > 0 ? val : 10;
}

function getMinTrackRecordDays(): number {
  const val = parseInt(process.env.MIN_TRACK_RECORD_DAYS ?? '7', 10);
  return isFinite(val) && val > 0 ? val : 7;
}

export async function checkEligibility(
  walletAddress: string,
  agentType: string,
): Promise<EligibilityResult> {
  const minAttestations = getMinAttestations();
  const minDays = getMinTrackRecordDays();

  const { data: rows, error } = await (supabaseAdmin as any)
    .from('agent_attestations')
    .select('id, created_at, payload')
    .eq('wallet_address', walletAddress)
    .eq('agent_type', agentType)
    .order('created_at', { ascending: true });

  if (error) {
    throw new Error(`Failed to query agent_attestations: ${error.message}`);
  }

  const attestations = (rows ?? []) as Array<{
    id: string;
    created_at: string;
    payload: Record<string, unknown> | null;
  }>;

  const issues: string[] = [];

  if (attestations.length < minAttestations) {
    issues.push(
      `insufficient track record: ${attestations.length} runs, need ${minAttestations}`,
    );
  }

  let firstRunAt: string | undefined;
  let lastRunAt: string | undefined;

  if (attestations.length > 0) {
    firstRunAt = attestations[0].created_at;
    lastRunAt = attestations[attestations.length - 1].created_at;

    const spanMs =
      new Date(lastRunAt).getTime() - new Date(firstRunAt).getTime();
    const spanDays = spanMs / (1000 * 60 * 60 * 24);

    if (spanDays < minDays) {
      issues.push(
        `track record period too short: ${spanDays.toFixed(1)} days, need ${minDays}`,
      );
    }
  } else if (minDays > 0) {
    issues.push(`track record period too short: 0 days, need ${minDays}`);
  }

  if (issues.length > 0) {
    return { eligible: false, issues };
  }

  // Approximate ROI: sum of tradeCount from payloads as proxy for activity
  // Real P&L tracking requires wallet balance diffs — out of scope for MVP
  let totalTrades = 0;
  for (const row of attestations) {
    const tradeCount = (row.payload as { tradeCount?: number } | null)
      ?.tradeCount;
    if (typeof tradeCount === 'number' && isFinite(tradeCount)) {
      totalTrades += tradeCount;
    }
  }

  const roiPct = isFinite(totalTrades) ? totalTrades : 0;

  return {
    eligible: true,
    issues: [],
    attestationCount: attestations.length,
    firstRunAt,
    lastRunAt,
    roiPct,
  };
}
