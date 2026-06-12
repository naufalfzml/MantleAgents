'use client';

import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import type { WatchlistRiskScore } from '@/hooks/use-watchlist';

interface RiskBadgeProps {
  riskScore: WatchlistRiskScore | null;
}

function getRiskConfig(riskScore: WatchlistRiskScore | null) {
  if (!riskScore) {
    return { label: 'Unknown', className: 'bg-muted text-muted-foreground' };
  }

  switch (riskScore.risk_level) {
    case 'LOW':
      return { label: 'Safe', className: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20' };
    case 'MEDIUM':
      return { label: 'Caution', className: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/20' };
    case 'HIGH':
    case 'CRITICAL':
      return { label: 'Danger', className: 'bg-red-500/15 text-red-400 border-red-500/20' };
    default:
      return { label: 'Unknown', className: 'bg-muted text-muted-foreground' };
  }
}

export function RiskBadge({ riskScore }: RiskBadgeProps) {
  const config = getRiskConfig(riskScore);

  if (!riskScore) {
    return <Badge className={cn('text-[11px]', config.className)}>{config.label}</Badge>;
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge className={cn('text-[11px] cursor-help', config.className)}>
            {config.label}
          </Badge>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-72 space-y-1 text-xs">
          <p className="font-medium leading-relaxed">
            Contract Risk Check (transaction simulation / GoPlus)
          </p>
          <p>Honeypot Flag: {riskScore.honeypot ? 'Yes' : 'No'}</p>
          <p>Buy Tax: {riskScore.buy_tax}%</p>
          <p>Sell Tax: {riskScore.sell_tax}%</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
