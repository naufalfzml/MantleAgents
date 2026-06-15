'use client';

import { useState, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'motion/react';
import {
  Check,
  AlertCircle,
  Loader2,
  ExternalLink,
  ShieldCheck,
  Zap,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { api } from '@/lib/api-client';
import { get8004ScanUrl } from '@/lib/explorer';
import { useMotionSafe } from '@/lib/motion';
import { useAgentProgress } from '@/hooks/use-agent-progress';
import type { ProgressStep } from '@mantleagents/shared';
import { cn } from '@/lib/utils';

/* -------------------------------------------------------------------------- */
/*  Types                                                                     */
/* -------------------------------------------------------------------------- */

interface RegisterAgentProps {
  agentType: 'fx' | 'yield';
  serverWalletAddress: string | null;
  walletAddress: string;
  onDone?: () => void;
}

type RegistrationPhase = 'idle' | 'registering' | 'success' | 'error';

/* -------------------------------------------------------------------------- */
/*  Registration Step Indicator                                               */
/* -------------------------------------------------------------------------- */

const REGISTRATION_STEPS: { step: ProgressStep; label: string }[] = [
  { step: 'registering_8004', label: 'Register on ERC-8004' },
  { step: 'linking_wallet', label: 'Link server wallet' },
  { step: 'complete', label: 'Done' },
];

function StepIndicator({ currentStep }: { currentStep: ProgressStep | null }) {
  const stepIndex = REGISTRATION_STEPS.findIndex((s) => s.step === currentStep);

  return (
    <div className="flex w-full items-center justify-center gap-2">
      {REGISTRATION_STEPS.map((s, i) => {
        const isCompleted = stepIndex > i || currentStep === 'complete';
        const isActive = stepIndex === i;

        return (
          <div key={s.step} className="flex items-center gap-2">
            <div className="flex items-center gap-1.5">
              <div
                className={cn(
                  'flex size-6 items-center justify-center rounded-full text-xs font-medium transition-colors',
                  isCompleted && 'bg-primary text-primary-foreground',
                  isActive && 'bg-primary/20 text-primary ring-2 ring-primary',
                  !isCompleted && !isActive && 'bg-muted text-muted-foreground',
                )}
              >
                {isCompleted ? (
                  <Check className="size-3.5" />
                ) : (
                  <span>{i + 1}</span>
                )}
              </div>
              <span
                className={cn(
                  'text-xs',
                  isActive
                    ? 'font-medium text-foreground'
                    : 'text-muted-foreground',
                )}
              >
                {s.label}
              </span>
            </div>
            {i < REGISTRATION_STEPS.length - 1 && (
              <div
                className={cn(
                  'h-px w-6',
                  isCompleted ? 'bg-primary' : 'bg-border',
                )}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Component                                                                 */
/* -------------------------------------------------------------------------- */

export function RegisterAgent({
  agentType,
  serverWalletAddress,
  walletAddress,
  onDone,
}: RegisterAgentProps) {
  const m = useMotionSafe();
  const router = useRouter();
  const progress = useAgentProgress();

  const [phase, setPhase] = useState<RegistrationPhase>('idle');
  const [agentId, setAgentId] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Watch for WS completion events during registration
  useEffect(() => {
    if (phase !== 'registering') return;
    if (progress.currentStep === 'complete') {
      // Extract agent ID from progress data if available
      const lastStep = progress.steps[progress.steps.length - 1];
      const data = lastStep?.data as { agentId?: number } | undefined;
      if (data?.agentId) setAgentId(data.agentId);
      setPhase('success');
    } else if (progress.currentStep === 'error') {
      setErrorMessage(progress.stepMessage || 'Registration failed');
      setPhase('error');
    }
  }, [phase, progress.currentStep, progress.stepMessage, progress.steps]);

  const handleRegister = useCallback(async () => {
    try {
      setPhase('registering');
      setErrorMessage(null);

      const result = await api.post<{
        success: boolean;
        agentId: number;
        registerTxHash: string;
        linkTxHash: string;
      }>('/api/agent/register-8004', { agent_type: agentType });

      setAgentId(result.agentId);
      setPhase('success');
    } catch (err: unknown) {
      console.error('ERC-8004 registration failed:', err);
      const apiErr = err as { body?: { detail?: string }; message?: string };
      const detail =
        apiErr?.body &&
        typeof apiErr.body === 'object' &&
        'detail' in apiErr.body
          ? String((apiErr.body as { detail?: string }).detail)
          : null;
      setErrorMessage(
        detail ||
          (err instanceof Error
            ? err.message
            : 'Registration failed. Please try again.'),
      );
      setPhase('error');
    }
  }, [agentType]);

  const redirectPath = agentType === 'yield' ? '/yield-agent' : '/fx-agent';

  const handleSkip = useCallback(() => {
    if (onDone) onDone();
    else router.push(redirectPath);
  }, [onDone, router, redirectPath]);

  const handleRetry = useCallback(() => {
    setPhase('idle');
    setErrorMessage(null);
  }, []);

  /* ---- Idle state -------------------------------------------------------- */

  if (phase === 'idle') {
    return (
      <motion.div
        className="flex w-full max-w-lg flex-col items-center gap-6 text-center"
        initial={m.fadeUp.initial}
        animate={m.fadeUp.animate}
        transition={m.spring}
      >
        <div className="flex size-16 items-center justify-center rounded-full bg-primary/10">
          <ShieldCheck className="size-8 text-primary" />
        </div>

        <div>
          <h2 className="text-2xl font-bold tracking-tight">
            Register Your Agent on ERC-8004
          </h2>
          <p className="mt-2 text-muted-foreground">
            Register your autonomous{' '}
            {agentType === 'yield' ? 'yield' : 'trading'} agent on-chain with
            the ERC-8004 identity standard. This creates a verifiable on-chain
            identity for your agent.{' '}
            <span className="inline-flex items-center gap-1 font-medium text-primary">
              <Zap className="size-3.5" /> No gas fees required — we cover the
              cost.
            </span>
          </p>
        </div>

        <div className="flex w-full flex-col gap-3">
          <Button onClick={handleRegister} className="gap-2">
            <ShieldCheck className="size-4" />
            Register on ERC-8004
            <Badge
              variant="outline"
              className="ml-1 text-[10px] border-primary/40 bg-primary/20 text-primary-foreground"
            >
              Gasless
            </Badge>
          </Button>
          <Button variant="ghost" onClick={handleSkip}>
            Skip for now
          </Button>
        </div>
      </motion.div>
    );
  }

  /* ---- Registering state (live progress) --------------------------------- */

  if (phase === 'registering') {
    return (
      <motion.div
        className="flex w-full max-w-lg flex-col items-center gap-6 text-center"
        initial={m.fadeUp.initial}
        animate={m.fadeUp.animate}
        transition={m.spring}
      >
        <div className="flex size-16 items-center justify-center rounded-full bg-primary/10">
          <Loader2 className="size-8 animate-spin text-primary" />
        </div>

        <div>
          <h2 className="text-2xl font-bold tracking-tight">
            Registering your agent...
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {progress.stepMessage || 'Preparing on-chain registration...'}
          </p>
        </div>

        {/* Step indicator */}
        <StepIndicator currentStep={progress.currentStep} />

        {/* Live log messages */}
        {progress.steps.length > 0 && (
          <div className="w-full rounded-lg border border-border bg-card p-3 text-left">
            <div className="max-h-32 space-y-1 overflow-y-auto font-mono text-xs text-muted-foreground">
              {progress.steps.map((entry, i) => (
                <div key={i} className="flex items-start gap-2">
                  <span className="shrink-0 text-muted-foreground/50">
                    {new Date(entry.timestamp).toLocaleTimeString()}
                  </span>
                  <span>{entry.message}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </motion.div>
    );
  }

  /* ---- Error state ------------------------------------------------------- */

  if (phase === 'error') {
    return (
      <motion.div
        className="flex w-full max-w-lg flex-col items-center gap-6 text-center"
        initial={m.fadeUp.initial}
        animate={m.fadeUp.animate}
        transition={m.spring}
      >
        <div className="flex size-16 items-center justify-center rounded-full bg-destructive/10">
          <AlertCircle className="size-8 text-destructive" />
        </div>

        <div>
          <h2 className="text-2xl font-bold tracking-tight">
            Registration Failed
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">{errorMessage}</p>
        </div>

        <div className="flex w-full flex-col gap-3">
          <Button onClick={handleRetry}>Try Again</Button>
          <Button variant="ghost" onClick={handleSkip}>
            Skip for now
          </Button>
        </div>
      </motion.div>
    );
  }

  /* ---- Success state ----------------------------------------------------- */

  return (
    <motion.div
      className="flex w-full max-w-lg flex-col items-center gap-6 text-center"
      initial={m.fadeUp.initial}
      animate={m.fadeUp.animate}
      transition={m.spring}
    >
      <div className="flex size-16 items-center justify-center rounded-full bg-primary/10">
        <Check className="size-8 text-primary" />
      </div>

      <div>
        <h2 className="text-2xl font-bold tracking-tight">
          {agentId
            ? `Agent #${agentId} registered on ERC-8004!`
            : 'Agent registered on ERC-8004!'}
        </h2>
        <p className="mt-2 text-muted-foreground">
          Your autonomous agent now has a verifiable on-chain identity.
        </p>
      </div>

      {agentId && (
        <a
          href={get8004ScanUrl(agentId)}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
        >
          View on 8004scan
          <ExternalLink className="size-3.5" />
        </a>
      )}

      <div className="flex w-full flex-col gap-3">
        <Button onClick={onDone ?? (() => router.push(redirectPath))}>
          Go to {agentType === 'yield' ? 'Yield Agent' : 'FX Agent'}
        </Button>
      </div>
    </motion.div>
  );
}
