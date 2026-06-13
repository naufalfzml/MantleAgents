'use client';

import { useMemo } from 'react';
import { ArrowDownToLine } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/empty-state';
import { TokenLogo } from '@/components/token-logo';
import { formatUsd, formatUsdCompact, formatRelativeTime } from '@/lib/format';
import { TOKEN_METADATA } from '@mantleagents/shared';
import { useYieldPositions, useYieldOpportunities } from '@/hooks/use-yield-agent';
import { getProtocolLogo } from './utils';

type YieldPositionResponse = NonNullable<
  ReturnType<typeof useYieldPositions>['data']
>['positions'][number];
type YieldOpportunityResponse = NonNullable<
  ReturnType<typeof useYieldOpportunities>['data']
>['opportunities'][number];

function YieldPositionCard({
  position,
  opportunity,
}: {
  position: YieldPositionResponse;
  opportunity: YieldOpportunityResponse | null;
}) {
  const logo = getProtocolLogo(position.protocol);
  const name = opportunity?.name ?? position.depositToken;
  const apr = opportunity?.apr ?? position.currentApr ?? null;
  const tvl = opportunity?.tvl;
  const dailyRewards = opportunity?.dailyRewards;
  const tokens = opportunity?.tokens ?? [];

  return (
    <div className="relative overflow-hidden border-2 border-gb-dark bg-gb-deep transition-all hover:shadow-md">
      {/* Header */}
      <div className="flex items-start justify-between p-5 pb-4">
        <div className="flex items-center gap-3">
          {logo ? (
            <img
              src={logo}
              alt={position.protocol}
              className="size-10 shrink-0 rounded-full object-contain bg-gb-light p-1"
            />
          ) : (
            <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-gb-dark text-xs font-medium text-gb-light">
              {position.protocol.slice(0, 1).toUpperCase()}
            </div>
          )}
          <div className="flex flex-col">
            <h4 className="font-semibold text-base leading-tight text-gb-light">{name}</h4>
            <div className="flex items-center gap-2 mt-1.5">
              <Badge
                variant="secondary"
                className="text-[10px] px-1.5 py-0 h-5 font-medium bg-gb-dark text-gb-mid hover:bg-gb-dark"
              >
                {position.protocol}
              </Badge>
              {tokens.filter((t) => !t.symbol.includes('VAULT') && !t.symbol.includes('UNIV3')).length > 0 && (
                <div className="flex -space-x-1.5">
                  {tokens
                    .filter((t) => !t.symbol.includes('VAULT') && !t.symbol.includes('UNIV3'))
                    .slice(0, 3)
                    .map((t) => {
                    const logoUrl = (t.icon && t.icon.trim()) || TOKEN_METADATA[t.symbol]?.logo;
                    const flag = TOKEN_METADATA[t.symbol]?.flag;
                    return (
                      <div
                        key={t.address}
                        className="flex size-5 shrink-0 items-center justify-center overflow-hidden rounded-full border border-gb-dark bg-gb-dark ring-2 ring-gb-deep"
                        title={t.symbol}
                      >
                        {logoUrl ? (
                          <img
                            src={logoUrl}
                            alt={t.symbol}
                            className="size-full object-cover"
                          />
                        ) : flag ? (
                          <TokenLogo symbol={t.symbol} size={14} />
                        ) : (
                          <span className="text-[9px] font-medium text-gb-mid">
                            {t.symbol.slice(0, 1)}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        {apr !== null && (
          <div className="flex flex-col items-end">
            <span className="text-xs text-gb-mid font-medium mb-0.5">APR</span>
            <span className="text-lg font-bold text-gb-accent tabular-nums leading-none">
              {apr.toFixed(1)}%
            </span>
          </div>
        )}
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-2 gap-px bg-gb-dark/50 border-y border-gb-dark">
        <div className="bg-gb-deep p-4 flex flex-col gap-1">
          <span className="text-xs text-gb-mid font-medium">Deposited</span>
          <span className="text-sm font-mono font-medium tabular-nums text-gb-light">
            {formatUsd(position.depositAmountUsd)}
          </span>
        </div>
        <div className="bg-gb-deep p-4 flex flex-col gap-1">
          <span className="text-xs text-gb-mid font-medium">Daily Rewards</span>
          <span className="text-sm font-mono font-medium tabular-nums text-gb-light">
            {dailyRewards ? formatUsd(dailyRewards) : '-'}
          </span>
        </div>
        <div className="bg-gb-deep p-4 flex flex-col gap-1">
          <span className="text-xs text-gb-mid font-medium">TVL</span>
          <span className="text-sm font-mono font-medium tabular-nums text-gb-mid">
            {tvl ? formatUsdCompact(tvl) : '-'}
          </span>
        </div>
        <div className="bg-gb-deep p-4 flex flex-col gap-1">
          <span className="text-xs text-gb-mid font-medium">Time Held</span>
          <span className="text-sm font-mono font-medium tabular-nums text-gb-mid">
            {position.depositedAt
              ? formatRelativeTime(position.depositedAt).replace(' ago', '')
              : '-'}
          </span>
        </div>
      </div>
    </div>
  );
}

export function YieldPositionsSection() {
  const { data: positionsData, isLoading: positionsLoading } =
    useYieldPositions();
  const { data: opportunitiesData } =
    useYieldOpportunities();

  const enrichedPositions = useMemo(() => {
    const positions = positionsData?.positions ?? [];
    const opportunities = opportunitiesData?.opportunities ?? [];
    const oppByVault = new Map<string, YieldOpportunityResponse>();
    for (const opp of opportunities) {
      const key = (opp.vaultAddress ?? opp.id ?? '').toLowerCase();
      if (key) oppByVault.set(key, opp);
    }
    return positions.map((pos) => {
      const vaultKey = (pos.vaultAddress ?? '').toLowerCase();
      const opportunity = oppByVault.get(vaultKey) ?? null;
      return { position: pos, opportunity };
    });
  }, [positionsData?.positions, opportunitiesData?.opportunities]);

  const isLoading = positionsLoading;
  const positions = positionsData?.positions ?? [];

  if (isLoading) {
    return (
      <div>
        <h3 className="mb-3 text-sm font-semibold text-gb-light">Active Positions</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <div
              key={i}
              className="rounded-xl border bg-card p-4 min-h-[100px] flex flex-col justify-between"
            >
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/2 mt-2" />
              <Skeleton className="h-3 w-2/3 mt-3" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (positions.length === 0) {
    return (
      <div>
        <h3 className="mb-3 text-sm font-semibold text-gb-light">Active Positions</h3>
        <Card className="border-dashed">
          <CardContent className="p-0">
            <EmptyState
              icon={ArrowDownToLine}
              title="No active vault positions yet"
              description="The agent will deposit into vaults when it finds suitable opportunities."
            />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div>
      <h3 className="mb-3 text-sm font-semibold text-gb-light">
        Active Positions{' '}
        <Badge variant="secondary" className="ml-1.5 text-xs">
          {positions.length}
        </Badge>
      </h3>
      <div className="grid gap-3 sm:grid-cols-2">
        {enrichedPositions.map(({ position, opportunity }) => (
          <YieldPositionCard
            key={position.id}
            position={position}
            opportunity={opportunity}
          />
        ))}
      </div>
    </div>
  );
}
