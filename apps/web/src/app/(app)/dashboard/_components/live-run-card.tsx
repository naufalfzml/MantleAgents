'use client';

import { motion, AnimatePresence } from 'motion/react';
import {
  CheckCircle2,
  Loader2,
  XCircle,
  ExternalLink,
  ShieldCheck,
  ShieldX,
  ArrowUpRight,
  ArrowDownRight,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useMotionSafe } from '@/lib/motion';
import { formatUsd } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useExplorerTxUrl } from '@/lib/explorer';
import type { StepEntry, ProgressStep } from '@/hooks/use-agent-progress';
import type {
  ProgressNewsData,
  ProgressSignalsData,
  ProgressGuardrailData,
  ProgressTradeData,
  ProgressCompleteData,
  ProgressErrorData,
  ProgressData,
} from '@mantleagents/shared';

/* ------------------------------------------------------------------ */
/*  Props                                                              */
/* ------------------------------------------------------------------ */

interface LiveRunCardProps {
  steps: StepEntry[];
  isRunning: boolean;
  currentStep: ProgressStep | null;
}

/* ------------------------------------------------------------------ */
/*  Type guards for step data                                          */
/* ------------------------------------------------------------------ */

function isNewsData(data: ProgressData): data is ProgressNewsData {
  return 'articles' in data && 'queryCount' in data;
}

function isSignalsData(data: ProgressData): data is ProgressSignalsData {
  return 'signals' in data && 'marketSummary' in data;
}

function isGuardrailData(data: ProgressData): data is ProgressGuardrailData {
  return 'passed' in data && 'currency' in data && !('amountUsd' in data);
}

function isTradeData(data: ProgressData): data is ProgressTradeData {
  return 'amountUsd' in data && 'currency' in data;
}

function isCompleteData(data: ProgressData): data is ProgressCompleteData {
  return 'signalCount' in data && 'tradeCount' in data;
}

function isErrorData(data: ProgressData): data is ProgressErrorData {
  return 'error' in data && 'step' in data && !('currency' in data);
}

/* ------------------------------------------------------------------ */
/*  Step dot                                                           */
/* ------------------------------------------------------------------ */

function StepDot({ status }: { status: 'done' | 'active' | 'pending' }) {
  if (status === 'done') {
    return <CheckCircle2 className="size-4 text-success shrink-0" />;
  }
  if (status === 'active') {
    return <Loader2 className="size-4 text-primary shrink-0 animate-spin" />;
  }
  return (
    <div className="size-4 rounded-full border-2 border-muted-foreground/30 shrink-0" />
  );
}

/* ------------------------------------------------------------------ */
/*  Data renderers                                                     */
/* ------------------------------------------------------------------ */

function NewsDataView({ data }: { data: ProgressNewsData }) {
  if (data.articles.length === 0) return null;
  return (
    <div className="mt-2 space-y-1 ml-6">
      {data.articles.slice(0, 8).map((article, i) => (
        <a
          key={i}
          href={article.url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors group"
        >
          <ExternalLink className="size-3 shrink-0 opacity-50 group-hover:opacity-100" />
          <span className="truncate">{article.title}</span>
          <Badge variant="outline" className="text-[10px] px-1.5 py-0 shrink-0">
            {article.source}
          </Badge>
        </a>
      ))}
      {data.articles.length > 8 && (
        <p className="text-[11px] text-muted-foreground/60 ml-5">
          +{data.articles.length - 8} more
        </p>
      )}
    </div>
  );
}

function SignalsDataView({ data }: { data: ProgressSignalsData }) {
  if (data.signals.length === 0) return null;
  return (
    <div className="mt-2 space-y-1.5 ml-6">
      {data.signals.map((signal, i) => (
        <div
          key={i}
          className="flex items-center gap-2 rounded-lg border bg-card/50 px-3 py-2"
        >
          <span className="font-mono text-sm font-medium w-12">
            {signal.currency}
          </span>
          <Badge
            variant="outline"
            className={cn(
              'text-[11px] px-1.5 py-0',
              signal.direction === 'buy' && 'border-success/40 text-success',
              signal.direction === 'sell' && 'border-destructive/40 text-destructive',
              signal.direction === 'hold' && 'text-muted-foreground',
            )}
          >
            {signal.direction.toUpperCase()}
          </Badge>
          <div className="flex-1 min-w-0">
            <div className="h-1.5 rounded-full bg-muted overflow-hidden">
              <div
                className={cn(
                  'h-full rounded-full transition-all',
                  signal.confidence >= 70 ? 'bg-success' : signal.confidence >= 50 ? 'bg-warning' : 'bg-muted-foreground',
                )}
                style={{ width: `${signal.confidence}%` }}
              />
            </div>
          </div>
          <span className="font-mono text-xs tabular-nums text-muted-foreground w-8 text-right">
            {signal.confidence}%
          </span>
        </div>
      ))}
      {data.marketSummary && (
        <p className="text-xs text-muted-foreground/70 italic line-clamp-2 ml-1">
          {data.marketSummary}
        </p>
      )}
    </div>
  );
}

function GuardrailDataView({ data }: { data: ProgressGuardrailData }) {
  return (
    <div className="mt-1 ml-6 flex items-center gap-2 text-xs">
      {data.passed ? (
        <ShieldCheck className="size-3.5 text-success" />
      ) : (
        <ShieldX className="size-3.5 text-destructive" />
      )}
      <span className="font-mono">{data.currency}</span>
      <span className={data.passed ? 'text-success' : 'text-destructive'}>
        {data.passed ? 'Passed' : 'Blocked'}
      </span>
      {data.reason && (
        <span className="text-muted-foreground truncate">— {data.reason}</span>
      )}
    </div>
  );
}

function TradeDataView({ data }: { data: ProgressTradeData }) {
  const isError = !!data.error;
  const txUrl = useExplorerTxUrl(data.txHash ?? null);

  return (
    <div className="mt-1 ml-6 flex items-center gap-2 text-xs">
      {data.direction === 'buy' ? (
        <ArrowUpRight className={cn('size-3.5', isError ? 'text-destructive' : 'text-success')} />
      ) : (
        <ArrowDownRight className={cn('size-3.5', isError ? 'text-destructive' : 'text-destructive')} />
      )}
      <span className="font-mono">{data.currency}</span>
      <span className={cn('font-mono', isError ? 'text-destructive' : 'text-foreground')}>
        {formatUsd(data.amountUsd)}
      </span>
      {data.txHash && txUrl && (
        <a
          href={txUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary hover:underline font-mono"
        >
          {data.txHash.slice(0, 10)}...
        </a>
      )}
      {data.error && (
        <span className="text-destructive truncate">{data.error}</span>
      )}
    </div>
  );
}

function CompleteDataView({ data }: { data: ProgressCompleteData }) {
  return (
    <div className="mt-1 ml-6 flex items-center gap-3 text-xs text-muted-foreground">
      <span>{data.signalCount} signals</span>
      <span>{data.tradeCount} traded</span>
      <span>{data.blockedCount} blocked</span>
    </div>
  );
}

function ErrorDataView({ data }: { data: ProgressErrorData }) {
  return (
    <div className="mt-1 ml-6 text-xs text-destructive">
      {data.error}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Step data renderer (dispatches by type)                            */
/* ------------------------------------------------------------------ */

function StepDataRenderer({ data }: { data?: ProgressData }) {
  if (!data) return null;

  if (isNewsData(data)) return <NewsDataView data={data} />;
  if (isSignalsData(data)) return <SignalsDataView data={data} />;
  if (isGuardrailData(data)) return <GuardrailDataView data={data} />;
  if (isTradeData(data)) return <TradeDataView data={data} />;
  if (isCompleteData(data)) return <CompleteDataView data={data} />;
  if (isErrorData(data)) return <ErrorDataView data={data} />;

  return null;
}

/* ------------------------------------------------------------------ */
/*  Main: LiveRunCard                                                  */
/* ------------------------------------------------------------------ */

const ORDERED_STEPS: ProgressStep[] = [
  'fetching_news',
  'analyzing',
  'checking_signals',
  'executing_trades',
];

export function LiveRunCard({ steps, isRunning, currentStep }: LiveRunCardProps) {
  const m = useMotionSafe();

  // Determine which ordered steps have been seen
  const seenSteps = new Set(steps.map((s) => s.step));
  const currentIdx = currentStep ? ORDERED_STEPS.indexOf(currentStep) : -1;
  const isComplete = currentStep === 'complete';
  const isError = currentStep === 'error';

  // Group steps by step type for display
  const stepGroups = ORDERED_STEPS.map((stepName) => {
    const entries = steps.filter((s) => s.step === stepName);
    const isDone = isComplete || (seenSteps.has(stepName) && ORDERED_STEPS.indexOf(stepName) < currentIdx);
    const isActive = stepName === currentStep;

    return { stepName, entries, isDone, isActive };
  });

  return (
    <motion.div
      initial={m.fadeUp.initial}
      animate={m.fadeUp.animate}
      exit={{ opacity: 0, y: -20 }}
      transition={m.spring}
    >
      <Card className="border-primary/20 overflow-hidden">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {isRunning && (
                <span className="relative flex size-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
                  <span className="relative inline-flex rounded-full size-2.5 bg-primary" />
                </span>
              )}
              {isComplete && <CheckCircle2 className="size-4 text-success" />}
              {isError && <XCircle className="size-4 text-destructive" />}
              <CardTitle className="text-sm font-medium">
                {isRunning
                  ? 'Agent Running'
                  : isComplete
                    ? 'Run Complete'
                    : isError
                      ? 'Run Failed'
                      : 'Agent Run'}
              </CardTitle>
            </div>
            {isRunning && currentIdx >= 0 && (
              <span className="text-xs text-muted-foreground font-mono tabular-nums">
                {currentIdx + 1} of {ORDERED_STEPS.length}
              </span>
            )}
          </div>
        </CardHeader>

        <CardContent className="pt-0 space-y-3">
          <AnimatePresence mode="popLayout">
            {stepGroups.map(({ stepName, entries, isDone, isActive }) => {
              // Don't show steps that haven't been reached yet (unless we're done)
              if (!isDone && !isActive && !isComplete && !isError) return null;

              const status = isDone || isComplete ? 'done' : isActive ? 'active' : 'pending';

              return (
                <motion.div
                  key={stepName}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 24 }}
                  className={cn(
                    'transition-opacity',
                    status === 'pending' && 'opacity-40',
                  )}
                >
                  {/* Step header */}
                  <div className="flex items-center gap-2">
                    <StepDot status={status} />
                    <span
                      className={cn(
                        'text-sm',
                        status === 'active' && 'font-medium',
                        status === 'pending' && 'text-muted-foreground',
                      )}
                    >
                      {entries.length > 0
                        ? entries[entries.length - 1].message
                        : stepName.replace(/_/g, ' ')}
                    </span>
                  </div>

                  {/* Step data (render the latest entry with data) */}
                  {entries
                    .filter((e) => e.data)
                    .map((entry, i) => (
                      <StepDataRenderer key={i} data={entry.data} />
                    ))}
                </motion.div>
              );
            })}

            {/* Terminal step (complete / error) */}
            {(isComplete || isError) && (
              <motion.div
                key="terminal"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ type: 'spring', stiffness: 400, damping: 24 }}
              >
                <div className="flex items-center gap-2">
                  {isComplete ? (
                    <CheckCircle2 className="size-4 text-success shrink-0" />
                  ) : (
                    <XCircle className="size-4 text-destructive shrink-0" />
                  )}
                  <span
                    className={cn(
                      'text-sm font-medium',
                      isComplete ? 'text-success' : 'text-destructive',
                    )}
                  >
                    {steps.length > 0 ? steps[steps.length - 1].message : isComplete ? 'Done' : 'Failed'}
                  </span>
                </div>
                {/* Render terminal data */}
                {steps.length > 0 && steps[steps.length - 1].data && (
                  <StepDataRenderer data={steps[steps.length - 1].data} />
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </CardContent>
      </Card>
    </motion.div>
  );
}
