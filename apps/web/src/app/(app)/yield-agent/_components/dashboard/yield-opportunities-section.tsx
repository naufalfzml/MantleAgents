'use client';

import { TrendingUp } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { formatUsd } from '@/lib/format';
import { cn } from '@/lib/utils';
import { TOKEN_METADATA } from '@mantleagents/shared';
import { useYieldOpportunities } from '@/hooks/use-yield-agent';
import { getProtocolLogo } from './utils';

export function YieldOpportunitiesSection() {
  const { data, isLoading } = useYieldOpportunities();

  if (isLoading) {
    return (
      <div>
        <h3 className="mb-3 text-sm font-semibold text-gb-light">Top Opportunities</h3>
        <Card>
          <CardContent className="p-0">
            <div className="space-y-0 divide-y">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center gap-4 px-4 py-3">
                  <Skeleton className="h-4 w-8" />
                  <Skeleton className="h-4 flex-1" />
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-4 w-16" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const opportunities = (data?.opportunities ?? [])
    .sort((a, b) => b.apr - a.apr)
    .slice(0, 10);

  if (opportunities.length === 0) {
    return (
      <div>
        <h3 className="mb-3 text-sm font-semibold text-gb-light">Top Opportunities</h3>
        <Card className="border-dashed border-gb-dark bg-gb-deep">
          <CardContent className="flex flex-col items-center justify-center py-8 text-center">
            <TrendingUp className="mb-3 size-6 text-gb-mid/50" />
            <p className="text-sm text-gb-mid">
              No opportunities discovered yet
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div>
      <h3 className="mb-3 text-sm font-semibold text-gb-light">
        Top Opportunities{' '}
        <Badge variant="secondary" className="ml-1.5 text-xs">
          {opportunities.length}
        </Badge>
      </h3>
      <Card className="border-gb-dark bg-gb-deep">
        <CardContent className="p-0">
          {/* Table header */}
          <div className="flex items-center gap-4 border-b border-gb-dark px-4 py-2.5 text-xs font-medium text-gb-mid">
            <span className="w-8 text-center">#</span>
            <span className="flex-1">Composition</span>
            <span className="w-24 text-right">TVL</span>
            <span className="w-24 text-right">Rewards/day</span>
            <span className="w-20 text-right">APR</span>
          </div>

          {/* Table rows */}
          <div className="divide-y divide-gb-dark/50">
            {opportunities.map((opp, idx) => (
              <button
                key={opp.id}
                type="button"
                className={cn(
                  "w-full text-left flex items-center gap-4 px-4 py-3 transition-colors hover:bg-gb-dark/30",
                  (opp.merklUrl ?? opp.depositUrl) && "cursor-pointer"
                )}
                onClick={() => {
                  const url = opp.merklUrl ?? opp.depositUrl;
                  if (url) {
                    window.open(url, '_blank', 'noopener,noreferrer');
                  }
                }}
              >
                {/* Rank */}
                <span className="w-8 text-center text-sm text-gb-mid font-mono">
                  {idx + 1}
                </span>

                {/* Name + Protocol + Tokens */}
                <div className="flex-1 min-w-0">
                  <p className="truncate text-sm font-medium text-gb-light">{opp.name}</p>
                  <div className="mt-0.5 flex items-center gap-2 flex-wrap">
                    <Badge
                      variant="outline"
                      className="text-[11px] border-blue-500/30 text-blue-400 flex items-center gap-1.5"
                    >
                      {(() => {
                        const logo = getProtocolLogo(opp.protocol);
                        return logo ? (
                          <img src={logo} alt={opp.protocol} className="size-3 object-contain" />
                        ) : null;
                      })()}
                      {opp.protocol}
                    </Badge>
                    {opp.tokens
                      .filter((t) => !t.symbol.includes('VAULT') && !t.symbol.includes('UNIV3'))
                      .slice(0, 3)
                      .map((t) => {
                        const logoUrl = (t.icon && t.icon.trim()) || TOKEN_METADATA[t.symbol]?.logo;
                        return (
                          <span
                            key={t.address}
                            className="inline-flex items-center gap-1 rounded-md bg-gb-dark/50 px-1.5 py-0.5 text-[11px] font-medium text-gb-mid"
                          >
                            {logoUrl ? (
                              <img src={logoUrl} alt={t.symbol} className="size-3 rounded-full object-cover" />
                            ) : null}
                            {t.symbol}
                          </span>
                        );
                      })}
                  </div>
                </div>

                {/* TVL */}
                <span className="w-24 text-right text-sm font-mono tabular-nums text-gb-mid">
                  {formatUsd(opp.tvl)}
                </span>

                {/* Daily Rewards */}
                <span className="w-24 text-right text-sm font-mono tabular-nums text-gb-mid">
                  {formatUsd(opp.dailyRewards)}
                </span>

                {/* APR */}
                <span className="w-20 text-right text-sm font-semibold font-mono tabular-nums text-gb-accent">
                  {opp.apr.toFixed(1)}%
                </span>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
