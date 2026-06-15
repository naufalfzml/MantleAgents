'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ExternalLink,
  Activity,
  Play,
  Sprout,
  ShieldCheck,
  UserCheck,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { formatUsd } from '@/lib/format';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { useAgentStatus, useToggleAgent, useRunNow } from '@/hooks/use-agent';
import {
  useYieldAgentStatus,
  useYieldPositions,
  useToggleYieldAgent,
  useRunYieldNow,
} from '@/hooks/use-yield-agent';
import { usePortfolio } from '@/hooks/use-portfolio';
import { useAgentReputation, useYieldReputation } from '@/hooks/use-reputation';
import { useAgentProgress } from '@/hooks/use-agent-progress';
import { useSelfClawStatus } from '@/hooks/use-selfclaw';
import { SelfClawVerificationDialog } from '../../_components/selfclaw-verification-dialog';

import { get8004ScanUrl } from '@/lib/explorer';
const isLpToken = (symbol: string) => /VAULT|LP|UNIV3/i.test(symbol);

interface OverviewAgentCardProps {
  agentType: 'fx' | 'yield';
}

export function OverviewAgentCard({ agentType }: OverviewAgentCardProps) {
  const isFx = agentType === 'fx';
  const title = isFx ? 'FX Agent' : 'Yield Agent';
  const Icon = isFx ? Activity : Sprout;
  const href = isFx ? '/fx-agent' : '/yield-agent';
  const onboardingHref = isFx
    ? '/onboarding?agent=fx'
    : '/onboarding?agent=yield';

  const { data: fxAgent, isLoading: fxStatusLoading } = useAgentStatus();
  const { data: yieldAgent, isLoading: yieldStatusLoading } =
    useYieldAgentStatus();
  const { data: fxPortfolio } = usePortfolio('fx');
  const { data: yieldPortfolio } = usePortfolio('yield');
  const { data: yieldPositionsData } = useYieldPositions();
  const { isRunning } = useAgentProgress();

  const toggleFxMutation = useToggleAgent();
  const toggleYieldMutation = useToggleYieldAgent();
  const runFxMutation = useRunNow();
  const runYieldMutation = useRunYieldNow();

  const agent = isFx ? fxAgent : yieldAgent;
  const portfolio = isFx ? fxPortfolio : yieldPortfolio;
  const config = agent?.config;
  const agent8004Id = config?.agent8004Id ?? null;
  const active = config?.active ?? false;
  const nextRunAt = config?.nextRunAt ? new Date(config.nextRunAt) : null;

  const fxRep = useAgentReputation(isFx ? agent8004Id : null);
  const yieldRep = useYieldReputation(!isFx ? agent8004Id : null);
  const reputationData = isFx ? fxRep.data : yieldRep.data;
  const selfclawStatus = useSelfClawStatus();
  const selfclawVerified = selfclawStatus.data?.verified ?? false;
  const [selfclawDialogOpen, setSelfclawDialogOpen] = useState(false);
  const reputationScore =
    reputationData != null
      ? reputationData.summaryValue /
        Math.pow(10, reputationData.summaryDecimals)
      : null;

  const pnl = portfolio?.totalPnl ?? null;
  const pnlPct = portfolio?.totalPnlPct ?? null;
  const hasPnl = pnl != null;
  const pnlColor = hasPnl
    ? pnl >= 0
      ? 'text-green-500'
      : 'text-red-500'
    : 'text-muted-foreground';
  const pnlBg = hasPnl
    ? pnl >= 0
      ? 'bg-green-500/10'
      : 'bg-red-500/10'
    : 'bg-muted/50';
  const pnlSign = hasPnl && pnl >= 0 ? '+' : hasPnl && pnl < 0 ? '' : '';

  // Yield: separate liquid vs invested
  const yieldLiquid = (yieldPortfolio?.holdings ?? [])
    .filter((h) => !isLpToken(h.tokenSymbol))
    .reduce((s, h) => s + (h.valueUsd || 0), 0);
  const yieldInvested = (yieldPositionsData?.positions ?? []).reduce(
    (s, p) => s + Number(p.depositAmountUsd ?? 0),
    0,
  );

  // Balance: FX = totalValueUsd; Yield = liquid + invested (total)
  const balance = isFx
    ? (fxPortfolio?.totalValueUsd ?? 0)
    : yieldLiquid + yieldInvested;

  // Top positions: FX = holdings; Yield = holdings (non-LP) + vault positions
  const topHoldings = isFx
    ? (fxPortfolio?.holdings ?? []).filter((h) => (h.valueUsd || 0) > 0.01)
    : (yieldPortfolio?.holdings ?? []).filter(
        (h) => !isLpToken(h.tokenSymbol) && (h.valueUsd || 0) > 0.01,
      );
  const topVaultPositions =
    !isFx && (yieldPositionsData?.positions ?? []).length > 0
      ? (yieldPositionsData?.positions ?? [])
          .filter((p) => Number(p.depositAmountUsd ?? 0) > 0.01)
          .slice(0, 3)
      : [];
  const positionItems = [
    ...topHoldings
      .sort((a, b) => (b.valueUsd || 0) - (a.valueUsd || 0))
      .slice(0, isFx ? 4 : 2)
      .map((h) => ({ label: h.tokenSymbol, value: h.valueUsd || 0 })),
    ...topVaultPositions.map((p) => ({
      label: p.protocol || 'Vault',
      value: Number(p.depositAmountUsd ?? 0),
    })),
  ];

  const [isActive, setIsActive] = useState(active);
  useEffect(() => {
    setIsActive(active);
  }, [active]);

  const toggleMutation = isFx ? toggleFxMutation : toggleYieldMutation;
  const runMutation = isFx ? runFxMutation : runYieldMutation;

  const handleToggle = () => {
    toggleMutation.mutate(undefined, {
      onSuccess: () =>
        toast.success(isActive ? 'Agent paused' : 'Agent activated'),
      onError: () => toast.error('Failed to toggle agent'),
    });
  };

  const handleRun = () => {
    runMutation.mutate(undefined, {
      onSuccess: () =>
        toast.success(isFx ? 'Run triggered' : 'Harvest triggered'),
      onError: (err: unknown) => {
        const body = (err as { body?: { error?: string } })?.body;
        const msg = body?.error ?? (err as Error).message;
        toast.error(msg);
      },
    });
  };

  const isRegistered8004 = agent8004Id !== null;
  const isLoading = isFx ? fxStatusLoading : yieldStatusLoading;

  if (isLoading) {
    return (
      <Card className="flex flex-col border-gb-deep bg-gb-deep p-5 shadow-[4px_4px_0px_var(--color-gb-deep)]">
        <Skeleton className="mb-4 h-10 w-3/4" />
        <Skeleton className="mb-5 h-20 w-full rounded-lg" />
        <Skeleton className="h-9 w-full" />
      </Card>
    );
  }

  // Agent not configured (404)
  if (!agent?.config) {
    return (
      <Card className="flex flex-col justify-between overflow-hidden border-dashed border-gb-dark bg-gb-mid p-5 shadow-[4px_4px_0px_var(--color-gb-deep)]">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center border-2 border-gb-deep bg-gb-light text-gb-deep">
            <Icon className="size-5" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gb-deep">{title}</h3>
            <p className="text-sm text-gb-dark">Not configured</p>
          </div>
        </div>
        <Button variant="outline" size="sm" className="mt-4" asChild>
          <Link href={onboardingHref}>Start {title}</Link>
        </Button>
      </Card>
    );
  }

  return (
    <Card className="flex flex-col justify-between overflow-hidden border-gb-deep bg-gb-deep p-5 shadow-[4px_4px_0px_var(--color-gb-deep)] transition-all">
      {/* Header */}
      <div className="mb-4 flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center border-2 border-gb-accent bg-gb-dark text-gb-accent">
            <Icon className="size-5" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gb-light">{title}</h3>
            <div className="flex items-center gap-2 text-sm text-gb-mid">
              <span
                className={cn(
                  'flex items-center gap-1',
                  isActive ? 'text-gb-accent' : 'text-gb-mid',
                )}
              >
                <div
                  className={cn(
                    'size-2 rounded-full',
                    isActive ? 'bg-green-400 animate-pulse' : 'bg-gb-dark',
                  )}
                />
                {isActive ? 'Active' : 'Paused'}
              </span>
              {nextRunAt && (
                <span>
                  • Next:{' '}
                  {nextRunAt.toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              )}
            </div>
          </div>
        </div>
        <Switch
          checked={isActive}
          onCheckedChange={handleToggle}
          disabled={toggleMutation.isPending || !isRegistered8004}
        />
      </div>

      {/* Stats Grid */}
      <div className="mb-5 grid grid-cols-2 gap-4 rounded-none border-2 border-gb-dark bg-gb-dark/30 p-4">
        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium uppercase text-gb-mid">
            {isFx ? 'Balance' : 'Total'}
          </span>
          <span className="font-mono text-xl font-semibold tabular-nums text-gb-light">
            {formatUsd(balance)}
          </span>
          {!isFx && (
            <div className="mt-0.5 flex flex-col gap-0.5 text-xs text-gb-mid">
              <span>Wallet: {formatUsd(yieldLiquid)}</span>
              <span>In Vaults: {formatUsd(yieldInvested)}</span>
            </div>
          )}
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium uppercase text-gb-mid">
            24h PnL
          </span>
          <div className="flex items-baseline gap-1.5">
            {hasPnl ? (
              <>
                <span
                  className={cn(
                    'font-mono text-xl font-semibold tabular-nums',
                    pnlColor,
                  )}
                >
                  {pnlSign}
                  {formatUsd(pnl as number)}
                </span>
                <span
                  className={cn(
                    'rounded px-1.5 py-0.5 text-xs font-medium',
                    pnlBg,
                    pnlColor,
                  )}
                >
                  {pnlPct != null ? `${pnlSign}${pnlPct.toFixed(2)}%` : ''}
                </span>
              </>
            ) : (
              <span className="font-mono text-xl font-semibold tabular-nums text-gb-mid">
                —
              </span>
            )}
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium uppercase text-gb-mid">
            Identity
          </span>
          {agent8004Id ? (
            <div className="flex flex-col gap-0.5">
              <a
                href={get8004ScanUrl(agent8004Id)}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1 text-sm font-medium text-gb-accent hover:underline"
              >
                <ShieldCheck className="size-4" />
                8004 #{agent8004Id}
                <ExternalLink className="size-3 opacity-60" />
              </a>
              {reputationScore != null && (
                <span className="text-xs text-gb-mid">
                  Rep: {Math.round(reputationScore)}
                </span>
              )}
            </div>
          ) : (
            <span className="text-sm text-gb-mid italic">Not registered</span>
          )}
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium uppercase text-gb-mid">
            Human-Backed
          </span>
          {selfclawVerified ? (
            <span className="flex items-center gap-1 text-sm font-medium text-gb-accent">
              <UserCheck className="size-4" />
              Verified
            </span>
          ) : (
            <button
              type="button"
              onClick={() => setSelfclawDialogOpen(true)}
              className="flex items-center gap-1 text-sm text-gb-accent hover:underline text-left"
            >
              <UserCheck className="size-4 opacity-60" />
              Verify
            </button>
          )}
        </div>
        {positionItems.length > 0 ? (
          <div className="col-span-2 flex flex-col gap-1">
            <span className="text-xs font-medium uppercase text-gb-mid">
              Positions
            </span>
            <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm text-gb-light">
              {positionItems.map((item, i) => (
                <span key={`${item.label}-${i}`} className="tabular-nums">
                  {item.label}: {formatUsd(item.value)}
                </span>
              ))}
            </div>
          </div>
        ) : (
          <div className="col-span-2 flex flex-col gap-1">
            <span className="text-xs font-medium uppercase text-gb-mid">
              Positions
            </span>
            <span className="text-sm text-gb-mid italic">No positions</span>
          </div>
        )}
      </div>

      <SelfClawVerificationDialog
        open={selfclawDialogOpen}
        onOpenChange={setSelfclawDialogOpen}
      />

      {/* Footer Actions */}
      <div className="flex gap-2">
        <Button variant="outline" size="sm" className="flex-1 text-sm" asChild>
          <Link href={href}>View Dashboard</Link>
        </Button>
        <Button
          size="sm"
          className="flex-1 gap-1.5 text-sm"
          disabled={
            !isActive || isRunning || runMutation.isPending || !isRegistered8004
          }
          onClick={handleRun}
        >
          {isFx ? (
            <>
              <Play className="size-4 fill-current" /> Run Now
            </>
          ) : (
            <>
              <Sprout className="size-4" /> Harvest
            </>
          )}
        </Button>
      </div>
    </Card>
  );
}
