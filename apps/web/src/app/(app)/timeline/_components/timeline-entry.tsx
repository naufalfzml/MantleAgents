'use client';

import { useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import {
  ChevronDown,
  ExternalLink,
  ArrowUpDown,
  Search,
  ShieldAlert,
  Wallet,
  Settings,
  Layers,
  type LucideIcon,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { useExplorerTxUrl } from '@/lib/explorer';
import { formatRelativeTime, formatUsd, shortenAddress } from '@/lib/format';
import { SignalCard, YieldSignalCard } from '@/components/signal-card';

/* ------------------------------------------------------------------ */
/*  Node configuration                                                 */
/* ------------------------------------------------------------------ */

export interface EventNodeConfig {
  icon: LucideIcon;
  bgClass: string;
  iconClass: string;
}

export const EVENT_NODE_CONFIG: Record<string, EventNodeConfig> = {
  trade: {
    icon: ArrowUpDown,
    bgClass: 'bg-primary/15',
    iconClass: 'text-primary',
  },
  analysis: {
    icon: Search,
    bgClass: 'bg-muted-foreground/15',
    iconClass: 'text-muted-foreground',
  },
  guardrail: {
    icon: ShieldAlert,
    bgClass: 'bg-destructive/15',
    iconClass: 'text-destructive',
  },
  funding: {
    icon: Wallet,
    bgClass: 'bg-success/15',
    iconClass: 'text-success',
  },
  system: {
    icon: Settings,
    bgClass: 'bg-muted-foreground/10',
    iconClass: 'text-muted-foreground/70',
  },
};

export const GROUP_NODE_CONFIG: EventNodeConfig = {
  icon: Layers,
  bgClass: 'bg-primary/20',
  iconClass: 'text-primary',
};

const EVENT_LABELS: Record<string, string> = {
  trade: 'Trade',
  analysis: 'Analysis',
  guardrail: 'Guardrail',
  funding: 'Funding',
  system: 'System',
};

/* ------------------------------------------------------------------ */
/*  TimelineNode                                                       */
/* ------------------------------------------------------------------ */

export function TimelineNode({
  config,
  compact = false,
}: {
  config: EventNodeConfig;
  compact?: boolean;
}) {
  const Icon = config.icon;
  return (
    <div className={cn('timeline-node border border-border/50', config.bgClass)}>
      <Icon className={cn(compact ? 'size-3' : 'size-3.5', config.iconClass)} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */

interface TimelineEntryProps {
  entry: {
    id: string;
    eventType: string;
    summary: string;
    detail: Record<string, unknown>;
    citations: Array<{ url: string; title: string; excerpt?: string }>;
    confidencePct: number | null;
    currency: string | null;
    amountUsd: number | null;
    direction: string | null;
    txHash: string | null;
    createdAt: string;
  };
  /** Renders bare card without spine grid wrapper (used inside RunGroupCard) */
  nested?: boolean;
  /** Uses compact sizing */
  compact?: boolean;
}

/* ------------------------------------------------------------------ */
/*  Shared helpers                                                    */
/* ------------------------------------------------------------------ */

function renderCitations(
  citations: Array<{ url: string; title: string; excerpt?: string }>
) {
  if (!citations || citations.length === 0) return null;
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium text-muted-foreground">Sources</p>
      {citations.map((c, i) => (
        <a
          key={i}
          href={c.url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 text-xs text-primary hover:underline"
          onClick={(e) => e.stopPropagation()}
        >
          <ExternalLink className="size-3 shrink-0" />
          {c.title}
        </a>
      ))}
    </div>
  );
}

function TxHashLink({ txHash }: { txHash: string | null }) {
  const txUrl = useExplorerTxUrl(txHash);
  if (!txHash) return null;
  if (!txUrl) return null;

  return (
    <a
      href={txUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 text-xs text-primary hover:underline font-mono"
      onClick={(e) => e.stopPropagation()}
    >
      <ExternalLink className="size-3 shrink-0" />
      {shortenAddress(txHash, 6)}
    </a>
  );
}

/* ------------------------------------------------------------------ */
/*  Per-event-type detail rendering                                   */
/* ------------------------------------------------------------------ */

function renderDetail(entry: TimelineEntryProps['entry']) {
  const detail = entry.detail ?? {};

  switch (entry.eventType) {
    case 'trade':
      return (
        <div className="space-y-2">
          {entry.direction && (
            <Badge
              variant={entry.direction === 'buy' ? 'default' : 'destructive'}
            >
              {(entry.direction as string).toUpperCase()}
            </Badge>
          )}
          {entry.confidencePct != null && (
            <p className="text-xs text-muted-foreground">
              Confidence:{' '}
              <span
                className="text-primary font-mono"
                style={{
                  opacity:
                    0.4 + ((entry.confidencePct ?? 0) / 100) * 0.6,
                }}
              >
                {entry.confidencePct}%
              </span>
            </p>
          )}
          {detail.reasoning ? (
            <p className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">
              {String(detail.reasoning)}
            </p>
          ) : null}
          {renderCitations(entry.citations)}
          <TxHashLink txHash={entry.txHash} />
        </div>
      );

    case 'analysis': {
      const signals = Array.isArray(detail.signals) ? detail.signals : [];
      const isYieldAnalysis = signals.length > 0 && typeof signals[0] === 'object' && 'vaultName' in (signals[0] as object);

      return (
        <div className="space-y-3">
          {(detail.marketSummary || detail.reasoning || detail.summary) ? (
            <p className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">
              {String(detail.marketSummary || detail.reasoning || detail.summary)}
            </p>
          ) : null}
          {signals.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">
                Signals ({signals.length})
              </p>
              {isYieldAnalysis
                ? (signals as Array<{
                    vaultName: string;
                    action: string;
                    amountUsd: number;
                    estimatedApr: number;
                    confidence: number;
                    reasoning?: string;
                  }>).map((s, i) => (
                    <YieldSignalCard
                      key={i}
                      vaultName={s.vaultName}
                      action={s.action}
                      amountUsd={s.amountUsd}
                      estimatedApr={s.estimatedApr}
                      confidence={s.confidence}
                      reasoning={s.reasoning}
                    />
                  ))
                : (signals as Array<{
                    currency: string;
                    direction: string;
                    confidence: number;
                    reasoning?: string;
                    timeHorizon?: string;
                  }>).map((s, i) => (
                    <SignalCard
                      key={i}
                      currency={s.currency}
                      direction={s.direction}
                      confidence={s.confidence}
                      reasoning={s.reasoning}
                      timeHorizon={s.timeHorizon}
                    />
                  ))}
            </div>
          )}
          {renderCitations(entry.citations)}
        </div>
      );
    }

    case 'guardrail':
      return (
        <div className="space-y-2">
          {detail.rule ? (
            <p className="text-sm font-medium">
              Rule: {String(detail.rule)}
            </p>
          ) : null}
          {detail.reason ? (
            <p className="text-sm text-muted-foreground">
              {String(detail.reason)}
            </p>
          ) : null}
        </div>
      );

    case 'funding':
      return (
        <div className="space-y-2">
          {detail.from ? (
            <p className="text-sm text-muted-foreground">
              From:{' '}
              <span className="font-mono">
                {shortenAddress(String(detail.from))}
              </span>
            </p>
          ) : null}
          <TxHashLink txHash={entry.txHash} />
        </div>
      );

    case 'system':
      return (
        <div className="space-y-2">
          {detail.message ? (
            <p className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">
              {String(detail.message)}
            </p>
          ) : null}
        </div>
      );

    default:
      return null;
  }
}

/* ------------------------------------------------------------------ */
/*  Component                                                         */
/* ------------------------------------------------------------------ */

export function TimelineEntry({
  entry,
  nested = false,
  compact = false,
}: TimelineEntryProps) {
  const shouldReduceMotion = useReducedMotion();
  const [expanded, setExpanded] = useState(false);
  const nodeConfig =
    EVENT_NODE_CONFIG[entry.eventType] ?? EVENT_NODE_CONFIG.system;

  const card = (
    <div
      className={cn(
        'rounded-xl border bg-card cursor-pointer transition-colors',
        nested && 'rounded-lg border-border/50',
      )}
      role="button"
      tabIndex={0}
      aria-expanded={expanded}
      onClick={() => setExpanded(!expanded)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          setExpanded(!expanded);
        }
      }}
    >
      {/* Collapsed row — always visible */}
      <div className={cn('flex items-start gap-3', compact ? 'p-3' : 'p-4')}>
        {/* Main content */}
        <div className="flex-1 min-w-0">
          <p className="text-sm leading-snug line-clamp-1">{entry.summary}</p>
          <div className="mt-1 flex items-center gap-2">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="text-xs text-muted-foreground">
                    {formatRelativeTime(entry.createdAt)}
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  {new Date(entry.createdAt).toLocaleString()}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <Badge variant="secondary" className="text-[11px] px-1.5 py-0">
              {EVENT_LABELS[entry.eventType] ?? entry.eventType}
            </Badge>
            {entry.currency && (
              <Badge variant="outline" className="text-[11px] px-1.5 py-0">
                {entry.currency}
              </Badge>
            )}
          </div>
        </div>

        {/* Right side */}
        <div className="flex items-center gap-2 shrink-0">
          {entry.amountUsd != null && (
            <span className="text-sm font-mono tabular-nums text-muted-foreground">
              {formatUsd(entry.amountUsd)}
            </span>
          )}
          <ChevronDown
            className={cn(
              'size-4 text-muted-foreground transition-transform',
              expanded && 'rotate-180'
            )}
          />
        </div>
      </div>

      {/* Expanded detail — animated */}
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: shouldReduceMotion ? 0 : 0.2 }}
            className="overflow-hidden"
          >
            <div className={cn(compact ? 'px-3 pb-3' : 'px-4 pb-4')}>
              <Separator className="mb-3" />
              {renderDetail(entry)}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );

  // Nested: bare card (used inside RunGroupCard)
  if (nested) return card;

  // Standalone: wrap in spine grid row
  return (
    <div className="timeline-item">
      <div className="timeline-node-col">
        <TimelineNode config={nodeConfig} compact={compact} />
      </div>
      <div className="timeline-card-col">{card}</div>
    </div>
  );
}
