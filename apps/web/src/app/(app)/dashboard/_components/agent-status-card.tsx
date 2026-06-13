'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'motion/react';
import {
  Play,
  Pause,
  Zap,
  TrendingUp,
  TrendingDown,
  Minus,
  Loader2,
  CheckCircle2,
  XCircle,
  ExternalLink,
  Star,
  ShieldCheck,
  ShieldAlert,
  UserCheck,
} from 'lucide-react';
import type { ProgressStep } from '@/hooks/use-agent-progress';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useToggleAgent, useRunNow } from '@/hooks/use-agent';
import { useAgentReputation } from '@/hooks/use-reputation';
import { useSelfClawStatus } from '@/hooks/use-selfclaw';
import { SelfClawVerificationDialog } from '../../_components/selfclaw-verification-dialog';
import { SignalCard } from '@/components/signal-card';
import { formatRelativeTime } from '@/lib/format';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import {
  CountdownRing,
  AgentProgressStepper,
  RING_SIZE,
} from './agent-countdown';

const ERC8004_SCAN_BASE = 'https://www.8004scan.io/agents/bsc';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface AgentStatusCardProps {
  config: {
    id: string;
    active: boolean;
    frequency: number;
    maxTradeSizePct: number;
    maxAllocationPct: number;
    stopLossPct: number;
    dailyTradeLimit: number;
    allowedCurrencies: string[];
    blockedCurrencies: string[];
    customPrompt: string | null;
    serverWalletAddress: string | null;
    lastRunAt: string | null;
    nextRunAt: string | null;
    agent8004Id: number | null;
  };
  tradesToday: number;
  positionCount: number;
  latestSignal: {
    summary: string;
    currency: string | null;
    direction: string | null;
    confidencePct: number | null;
    createdAt: string;
    signals: Array<{
      currency: string;
      direction: string;
      confidence: number;
      reasoning: string;
    }>;
  } | null;
  progress: {
    isRunning: boolean;
    currentStep: ProgressStep | null;
    stepLabel: string;
    stepMessage: string;
  };
}

/* ------------------------------------------------------------------ */
/*  Direction icon helper                                              */
/* ------------------------------------------------------------------ */

function DirectionIcon({ direction }: { direction: string | null }) {
  if (direction === 'buy')
    return <TrendingUp className="size-4 text-success" />;
  if (direction === 'sell')
    return <TrendingDown className="size-4 text-destructive" />;
  return <Minus className="size-4 text-muted-foreground" />;
}

/* ------------------------------------------------------------------ */
/*  AgentStatusCard                                                    */
/* ------------------------------------------------------------------ */

export function AgentStatusCard({
  config,
  tradesToday,
  positionCount,
  latestSignal,
  progress,
}: AgentStatusCardProps) {
  const router = useRouter();
  /* ---- mutations ---- */
  const toggleMutation = useToggleAgent();
  const runNowMutation = useRunNow();

  /* ---- 8004 identity ---- */
  const agent8004Id = config.agent8004Id;
  const isRegistered8004 = agent8004Id !== null;
  const reputationQuery = useAgentReputation(agent8004Id);

  /* ---- SelfClaw verification ---- */
  const selfclawStatus = useSelfClawStatus();
  const selfclawVerified = selfclawStatus.data?.verified ?? false;
  const [selfclawDialogOpen, setSelfclawDialogOpen] = useState(false);
  const reputation = reputationQuery.data ?? null;
  const reputationScore =
    reputation !== null
      ? reputation.summaryValue / Math.pow(10, reputation.summaryDecimals)
      : null;

  /* ---- optimistic active state ---- */
  const [isActive, setIsActive] = useState(config.active);

  useEffect(() => {
    setIsActive(config.active);
  }, [config.active]);

  /* ---- optimistic running state (instant feedback) ---- */
  const [isRunningOptimistic, setIsRunningOptimistic] = useState(false);
  const runningTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clear optimistic state once real progress arrives
  useEffect(() => {
    if (progress.isRunning) {
      setIsRunningOptimistic(false);
    }
  }, [progress.isRunning]);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (runningTimerRef.current) clearTimeout(runningTimerRef.current);
    };
  }, []);

  const isRunning = progress.isRunning || isRunningOptimistic;

  /* ---- 5-minute cooldown ---- */
  const COOLDOWN_MS = 5 * 60 * 1000;
  const [cooldownEnd, setCooldownEnd] = useState<number | null>(() => {
    if (typeof window === 'undefined') return null;
    const stored = localStorage.getItem('mantleagents:runNow:cooldownEnd');
    if (stored) {
      const end = parseInt(stored, 10);
      return end > Date.now() ? end : null;
    }
    return null;
  });
  const [cooldownLeft, setCooldownLeft] = useState('');

  useEffect(() => {
    if (!cooldownEnd || cooldownEnd <= Date.now()) {
      setCooldownLeft('');
      setCooldownEnd(null);
      return;
    }

    function tick() {
      const diff = (cooldownEnd as number) - Date.now();
      if (diff <= 0) {
        setCooldownLeft('');
        setCooldownEnd(null);
        localStorage.removeItem('mantleagents:runNow:cooldownEnd');
        return;
      }
      const mins = Math.floor(diff / 60000);
      const secs = Math.floor((diff % 60000) / 1000);
      setCooldownLeft(`${mins}:${secs.toString().padStart(2, '0')}`);
    }

    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [cooldownEnd]);

  const isCoolingDown = cooldownEnd !== null && cooldownEnd > Date.now();

  /* ---- handlers ---- */
  function handleToggle() {
    const previous = isActive;
    setIsActive(!previous);

    toggleMutation.mutate(undefined, {
      onSuccess: () => {
        toast.success(previous ? 'Agent paused' : 'Agent resumed');
      },
      onError: () => {
        setIsActive(previous);
        toast.error('Failed to toggle agent');
      },
    });
  }

  function handleRunNow() {
    // Instant visual feedback
    setIsRunningOptimistic(true);

    // Auto-clear optimistic state after 15s if WebSocket never fires
    runningTimerRef.current = setTimeout(
      () => setIsRunningOptimistic(false),
      15_000,
    );

    // Start cooldown
    const end = Date.now() + COOLDOWN_MS;
    setCooldownEnd(end);
    localStorage.setItem('mantleagents:runNow:cooldownEnd', String(end));

    runNowMutation.mutate(undefined, {
      onSuccess: () => {
        toast.success('Agent run triggered');
      },
      onError: () => {
        setIsRunningOptimistic(false);
        if (runningTimerRef.current) clearTimeout(runningTimerRef.current);
        // Clear cooldown on error
        setCooldownEnd(null);
        localStorage.removeItem('mantleagents:runNow:cooldownEnd');
        toast.error('Failed to trigger run');
      },
    });
  }

  return (
    <Card>
      {/* ============================================================ */}
      {/* A. Header with status indicator                               */}
      {/* ============================================================ */}
      <CardHeader className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span
              className={cn(
                'inline-block size-2.5 rounded-full',
                isActive ? 'bg-success' : 'bg-muted-foreground',
              )}
            />
            <CardTitle className="text-lg">
              {isActive ? 'Active' : 'Paused'}
            </CardTitle>
          </div>
          <Badge variant="secondary">{config.frequency}h</Badge>
        </div>

        {/* ---- ERC-8004 Identity Badge ---- */}
        <div className="flex items-center justify-between rounded-md border border-border/60 bg-muted/30 px-3 py-2">
          {isRegistered8004 ? (
            <div className="flex items-center gap-2">
              <ShieldCheck className="size-4 text-primary" />
              <a
                href={`${ERC8004_SCAN_BASE}/${agent8004Id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
              >
                8004 #{agent8004Id}
                <ExternalLink className="size-3" />
              </a>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <ShieldAlert className="size-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">
                Not registered on 8004
              </span>
            </div>
          )}
          {isRegistered8004 && reputation !== null ? (
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <Star className="size-3.5 fill-primary text-primary" />
              <span className="font-mono tabular-nums font-medium text-foreground">
                {reputationScore?.toFixed(1)}
              </span>
              <span className="text-xs">
                | {reputation.feedbackCount}{' '}
                {reputation.feedbackCount === 1 ? 'review' : 'reviews'}
              </span>
            </div>
          ) : isRegistered8004 && reputationQuery.isLoading ? (
            <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
          ) : !isRegistered8004 ? (
            <button
              type="button"
              onClick={() => router.push('/onboarding?agent=fx&step=register')}
              className="text-xs text-primary hover:underline"
            >
              Register
            </button>
          ) : null}
        </div>

        {/* ---- SelfClaw Human-Backed Badge ---- */}
        <div className="flex items-center justify-between rounded-md border border-border/60 bg-muted/30 px-3 py-2">
          {selfclawVerified ? (
            <div className="flex items-center gap-2">
              <UserCheck className="size-4 text-primary" />
              <span className="text-sm font-medium">Human-Backed</span>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <UserCheck className="size-4 text-muted-foreground" />
              <button
                type="button"
                onClick={() => setSelfclawDialogOpen(true)}
                className="text-sm text-primary hover:underline"
              >
                Verify Identity
              </button>
            </div>
          )}
        </div>

        <SelfClawVerificationDialog
          open={selfclawDialogOpen}
          onOpenChange={setSelfclawDialogOpen}
        />
      </CardHeader>

      <CardContent className="flex flex-col items-center gap-6">
        {/* ============================================================ */}
        {/* B. Countdown Ring or Progress Stepper                         */}
        {/* ============================================================ */}
        <AnimatePresence mode="wait">
          {isRunning ||
          progress.currentStep === 'complete' ||
          progress.currentStep === 'error' ? (
            <motion.div
              key="stepper"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.2 }}
            >
              <AgentProgressStepper
                currentStep={progress.currentStep}
                stepLabel={progress.stepLabel}
                stepMessage={progress.stepMessage}
                variant="fx"
              />
            </motion.div>
          ) : (
            <motion.div
              key="countdown"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.2 }}
            >
              <CountdownRing
                nextRunAt={config.nextRunAt}
                lastRunAt={config.lastRunAt}
                frequency={config.frequency}
              />
            </motion.div>
          )}
        </AnimatePresence>

        {/* ============================================================ */}
        {/* C. Stats Row                                                  */}
        {/* ============================================================ */}
        <div className="flex w-full items-center justify-around border-y py-4">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex flex-col items-center gap-0.5">
                  <span className="font-mono text-xl tabular-nums font-semibold">
                    {tradesToday}/{config.dailyTradeLimit}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    trades today
                  </span>
                </div>
              </TooltipTrigger>
              <TooltipContent>
                {tradesToday} of {config.dailyTradeLimit} daily trades used
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <div className="h-8 w-px bg-border" />

          <div className="flex flex-col items-center gap-0.5">
            <span className="font-mono text-lg tabular-nums font-semibold">
              {positionCount}
            </span>
            <span className="text-xs text-muted-foreground">positions</span>
          </div>
        </div>

        {/* ============================================================ */}
        {/* D. Latest Signal                                              */}
        {/* ============================================================ */}
        <div className="w-full rounded-lg bg-muted/50 p-3">
          {latestSignal ? (
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
                  Latest Signal
                </span>
                <span className="text-xs text-muted-foreground">
                  {formatRelativeTime(latestSignal.createdAt)}
                </span>
              </div>
              {latestSignal.signals.length > 0 ? (
                <div className="space-y-1.5 max-h-[200px] overflow-y-auto">
                  {latestSignal.signals.map((s, i) => (
                    <SignalCard
                      key={i}
                      currency={s.currency}
                      direction={s.direction}
                      confidence={s.confidence}
                      reasoning={s.reasoning}
                    />
                  ))}
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-1.5">
                    <DirectionIcon direction={latestSignal.direction} />
                    {latestSignal.confidencePct !== null && (
                      <Badge variant="outline">
                        {latestSignal.confidencePct}%
                      </Badge>
                    )}
                  </div>
                  <p className="line-clamp-2 text-sm text-muted-foreground">
                    {latestSignal.summary}
                  </p>
                </>
              )}
            </div>
          ) : (
            <p className="text-center text-sm text-muted-foreground">
              No signals yet
            </p>
          )}
        </div>

        {/* ============================================================ */}
        {/* E. Action Buttons                                             */}
        {/* ============================================================ */}
        <div className="flex w-full flex-col gap-2">
          <div className="flex w-full gap-3">
            <div className="flex-1 min-w-0">
              <Button
                variant="default"
                className="w-full h-11"
                disabled={
                  runNowMutation.isPending ||
                  isRunning ||
                  isCoolingDown ||
                  !isActive ||
                  !isRegistered8004
                }
                onClick={handleRunNow}
              >
                {isRunning ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Zap className="size-4" />
                )}
                {isRunning
                  ? 'Running...'
                  : isCoolingDown
                    ? `Cooldown ${cooldownLeft}`
                    : 'Run Now'}
              </Button>
            </div>

            <div className="flex-1 min-w-0">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="block w-full">
                      <Button
                        variant="outline"
                        className="w-full h-11"
                        disabled={toggleMutation.isPending || !isRegistered8004}
                        onClick={handleToggle}
                      >
                        {isActive ? (
                          <>
                            <Pause className="size-4" />
                            Pause
                          </>
                        ) : (
                          <>
                            <Play className="size-4" />
                            Resume
                          </>
                        )}
                      </Button>
                    </span>
                  </TooltipTrigger>
                  {!isRegistered8004 && (
                    <TooltipContent>
                      Register on 8004 to activate your agent
                    </TooltipContent>
                  )}
                </Tooltip>
              </TooltipProvider>
            </div>
          </div>

          {!isRegistered8004 && (
            <p className="text-center text-xs text-muted-foreground">
              <button
                type="button"
                onClick={() =>
                  router.push('/onboarding?agent=fx&step=register')
                }
                className="text-primary hover:underline"
              >
                Register on ERC-8004
              </button>{' '}
              to activate your agent
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
