'use client';

import { useState } from 'react';
import {
  Check,
  Clock3,
  Copy,
  ExternalLink,
  Loader2,
  ShieldCheck,
  ShieldEllipsis,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useExplorerTxUrl } from '@/lib/explorer';
import { toast } from 'sonner';

type AttestationDecisionTrail = {
  signal: {
    action: string | null;
    label: string | null;
    confidence: number | null;
    reasoning: string | null;
  } | null;
  guardrail: {
    passed: boolean;
    summary: string;
    rule: string | null;
  } | null;
  outcome: {
    status: 'executed' | 'failed' | 'skipped';
    summary: string;
    txHash: string | null;
    amountUsd: number | null;
  } | null;
};

type AttestationEntryLike = {
  id: string;
  runId: string | null;
  algorithm: string;
  createdAt: string;
  eventsHash: string | null;
  decisionHash: string | null;
  commitTxHash: string | null;
  commitTxExplorerUrl: string | null;
  decisionTrail?: AttestationDecisionTrail | null;
};

function shortHash(value: string | null, start = 10, end = 8) {
  if (!value) return 'Unavailable';
  if (value.length <= start + end) return value;
  return `${value.slice(0, start)}...${value.slice(-end)}`;
}

function statusTone(entry: AttestationEntryLike) {
  if (entry.commitTxHash) {
    return 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300';
  }
  return 'border-amber-500/20 bg-amber-500/10 text-amber-200';
}

export function AttestationRunDetail(props: {
  agentLabel: string;
  entries: AttestationEntryLike[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  selectedEntry?: AttestationEntryLike | null;
  isLoading?: boolean;
}) {
  const { agentLabel, entries, selectedId, onSelect, selectedEntry, isLoading = false } = props;
  const [copiedField, setCopiedField] = useState<string | null>(null);

  async function copyValue(label: string, value: string | null) {
    if (!value) return;
    await navigator.clipboard.writeText(value);
    setCopiedField(label);
    toast.success(`${label} copied`);
    setTimeout(() => setCopiedField((current) => (current === label ? null : current)), 1500);
  }

  const detail = selectedEntry ?? null;
  const commitTxUrl = useExplorerTxUrl(detail?.commitTxHash ?? null);
  const outcomeTxUrl = useExplorerTxUrl(detail?.decisionTrail?.outcome?.txHash ?? null);

  return (
    <div className="grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
      <div className="max-h-[60vh] space-y-2 overflow-auto rounded-md border border-border/60 p-2">
        {entries.length === 0 ? (
          <p className="px-2 py-4 text-sm text-muted-foreground">No attestations yet.</p>
        ) : (
          entries.map((entry) => (
            <button
              key={entry.id}
              type="button"
              onClick={() => onSelect(entry.id)}
              className={cn(
                'w-full rounded-md border px-3 py-3 text-left transition-colors',
                selectedId === entry.id
                  ? 'border-gb-accent bg-gb-accent/10'
                  : 'border-border/60 bg-muted/20 hover:bg-muted/35',
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-xs text-muted-foreground">
                  {entry.runId ? `Run ${entry.runId.slice(0, 8)}...` : 'No run id'}
                </span>
                <span
                  className={cn(
                    'rounded border px-1.5 py-0.5 text-[10px] uppercase tracking-wide',
                    statusTone(entry),
                  )}
                >
                  {entry.commitTxHash ? 'Verified on-chain' : 'Attestation pending'}
                </span>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                {new Date(entry.createdAt).toLocaleString()} · {entry.algorithm}
              </p>
            </button>
          ))
        )}
      </div>

      <div className="min-h-[360px] rounded-md border border-border/60 bg-muted/15 p-4">
        {!selectedId ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            Select an attestation to inspect the run detail.
          </div>
        ) : isLoading ? (
          <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Loading attestation detail...
          </div>
        ) : !detail ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            Unable to load this attestation.
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-foreground">{agentLabel} run attestation</p>
                <p className="font-mono text-xs text-muted-foreground">
                  {detail.runId ?? 'No run id'}
                </p>
              </div>
              {detail.commitTxHash && commitTxUrl ? (
                <a
                  href={commitTxUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-300 transition-colors hover:bg-emerald-500/15"
                >
                  <ShieldCheck className="size-3.5" />
                  Verified on-chain
                  <ExternalLink className="size-3.5" />
                </a>
              ) : (
                <span className="inline-flex items-center gap-2 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs font-medium text-amber-200">
                  <Clock3 className="size-3.5" />
                  Attestation pending
                </span>
              )}
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-md border border-border/60 bg-background/50 p-3">
                <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                  Signal
                </p>
                <p className="mt-2 text-sm font-medium capitalize text-foreground">
                  {detail.decisionTrail?.signal?.action ?? 'Unavailable'}{' '}
                  {detail.decisionTrail?.signal?.label ?? ''}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Confidence:{' '}
                  {detail.decisionTrail?.signal?.confidence != null
                    ? `${detail.decisionTrail.signal.confidence}%`
                    : 'Unavailable'}
                </p>
                <p className="mt-2 text-xs text-muted-foreground">
                  {detail.decisionTrail?.signal?.reasoning ?? 'No reasoning recorded.'}
                </p>
              </div>

              <div className="rounded-md border border-border/60 bg-background/50 p-3">
                <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                  Guardrail
                </p>
                <div className="mt-2 flex items-center gap-2 text-sm font-medium text-foreground">
                  {detail.decisionTrail?.guardrail?.passed ? (
                    <ShieldCheck className="size-4 text-emerald-400" />
                  ) : (
                    <ShieldEllipsis className="size-4 text-amber-300" />
                  )}
                  {detail.decisionTrail?.guardrail?.passed ? 'Passed' : 'Blocked'}
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  {detail.decisionTrail?.guardrail?.summary ?? 'No guardrail summary recorded.'}
                </p>
                {detail.decisionTrail?.guardrail?.rule ? (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Rule: {detail.decisionTrail.guardrail.rule}
                  </p>
                ) : null}
              </div>

              <div className="rounded-md border border-border/60 bg-background/50 p-3">
                <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                  Outcome
                </p>
                <div className="mt-2 flex items-center gap-2 text-sm font-medium capitalize text-foreground">
                  {detail.decisionTrail?.outcome?.status === 'executed' ? (
                    <Check className="size-4 text-emerald-400" />
                  ) : (
                    <Clock3 className="size-4 text-amber-300" />
                  )}
                  {detail.decisionTrail?.outcome?.status ?? 'Unavailable'}
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  {detail.decisionTrail?.outcome?.summary ?? 'No execution summary recorded.'}
                </p>
                {detail.decisionTrail?.outcome?.txHash && outcomeTxUrl ? (
                  <a
                    href={outcomeTxUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-2 inline-flex items-center gap-1 font-mono text-[11px] text-primary hover:underline"
                  >
                    {shortHash(detail.decisionTrail.outcome.txHash)}
                    <ExternalLink className="size-3" />
                  </a>
                ) : null}
              </div>
            </div>

            <div className="space-y-3 rounded-md border border-border/60 bg-background/40 p-3">
              <HashRow
                label="Decision Hash"
                value={detail.decisionHash}
                copied={copiedField === 'Decision Hash'}
                onCopy={() => copyValue('Decision Hash', detail.decisionHash)}
              />
              <HashRow
                label="Events Hash"
                value={detail.eventsHash}
                copied={copiedField === 'Events Hash'}
                onCopy={() => copyValue('Events Hash', detail.eventsHash)}
              />
              <HashRow
                label="Commit Tx"
                value={detail.commitTxHash}
                copied={copiedField === 'Commit Tx'}
                onCopy={() => copyValue('Commit Tx', detail.commitTxHash)}
                href={commitTxUrl}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function HashRow(props: {
  label: string;
  value: string | null;
  copied: boolean;
  onCopy: () => void;
  href?: string | null;
}) {
  const { label, value, copied, onCopy, href } = props;

  return (
    <div className="flex flex-col gap-2 rounded-md border border-border/50 bg-muted/20 p-3 md:flex-row md:items-center md:justify-between">
      <div>
        <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">{label}</p>
        <p className="mt-1 break-all font-mono text-xs text-foreground">
          {value ?? 'Unavailable'}
        </p>
      </div>
      <div className="flex items-center gap-2">
        {href ? (
          <Button asChild size="sm" variant="outline" className="h-8 gap-1 text-xs">
            <a href={href} target="_blank" rel="noreferrer">
              Open
              <ExternalLink className="size-3.5" />
            </a>
          </Button>
        ) : null}
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-8 gap-1 text-xs"
          onClick={onCopy}
          disabled={!value}
        >
          {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
          Copy
        </Button>
      </div>
    </div>
  );
}
