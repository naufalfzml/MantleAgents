'use client';

import { useState } from 'react';
import { ArrowUpRight, ArrowDownLeft, Wallet, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { formatUsd } from '@/lib/format';
import { get8004ScanUrl } from '@/lib/explorer';
import { SendModal } from '@/app/(app)/dashboard/_components/send-modal';
import { ReceiveModal } from '@/app/(app)/dashboard/_components/receive-modal';
import { usePortfolio } from '@/hooks/use-portfolio';
import { useYieldPositions } from '@/hooks/use-yield-agent';
import { useAgentStatus } from '@/hooks/use-agent';
import { useYieldAgentStatus } from '@/hooks/use-yield-agent';

const isLpToken = (symbol: string) => /VAULT|LP|UNIV3/i.test(symbol);

export function OverviewBalanceHero() {
  const [sendOpen, setSendOpen] = useState(false);
  const [receiveOpen, setReceiveOpen] = useState(false);

  const { data: fxData, isLoading: fxLoading } = usePortfolio('fx');
  const { data: yieldData, isLoading: yieldLoading } = usePortfolio('yield');
  const { data: yieldPositionsData } = useYieldPositions();
  const { data: fxAgent } = useAgentStatus();
  const { data: yieldAgent } = useYieldAgentStatus();

  // Total = FX + Yield liquid + Yield vault (same as sidebar-portfolio)
  const fxTotal = fxData?.totalValueUsd ?? 0;
  const yieldLiquidTotal = (yieldData?.holdings ?? [])
    .filter((h) => !isLpToken(h.tokenSymbol))
    .reduce((s, h) => s + (h.valueUsd || 0), 0);
  const yieldVaultTotal = (yieldPositionsData?.positions ?? []).reduce(
    (s, p) => s + Number(p.depositAmountUsd ?? 0),
    0,
  );
  const totalBalance = fxTotal + yieldLiquidTotal + yieldVaultTotal;
  const fxBalance = fxTotal;
  const yieldBalance = yieldLiquidTotal + yieldVaultTotal;

  // Primary wallet for Receive: FX if available, else Yield
  const primaryWalletAddress =
    fxAgent?.config.serverWalletAddress ??
    yieldAgent?.config.serverWalletAddress ??
    '';

  const fxHoldings = fxData?.holdings ?? [];
  const isLoading = fxLoading || yieldLoading;

  if (isLoading) {
    return (
      <Card className="flex flex-col gap-6 border-gb-deep bg-gb-deep p-6 shadow-[4px_4px_0px_var(--color-gb-deep)] lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-10 w-48" />
          <Skeleton className="h-3 w-32" />
        </div>
        <div className="flex gap-3">
          <Skeleton className="h-10 w-32" />
          <Skeleton className="h-10 w-24" />
        </div>
      </Card>
    );
  }

  return (
    <>
      <Card className="flex flex-col gap-6 border-gb-deep bg-gb-deep p-6 shadow-[4px_4px_0px_var(--color-gb-deep)] lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2 text-base text-gb-mid">
            <Wallet className="size-5" />
            <span>Total Portfolio Balance</span>
          </div>
          <div className="flex items-baseline gap-4">
            <h1 className="font-mono text-4xl font-bold tracking-tight text-gb-light">
              {formatUsd(totalBalance)}
            </h1>
          </div>
          <div className="flex flex-wrap gap-4 text-sm text-gb-mid">
            <span>FX: {formatUsd(fxBalance)}</span>
            <span>Yield: {formatUsd(yieldBalance)}</span>
          </div>
          {(fxAgent?.config.agent8004Id != null || yieldAgent?.config.agent8004Id != null) && (
            <div className="flex flex-wrap gap-3 text-xs">
              {fxAgent?.config.agent8004Id != null && (
                <a
                  href={get8004ScanUrl(fxAgent.config.agent8004Id)}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1 text-gb-accent hover:underline"
                >
                  <ShieldCheck className="size-3.5" />
                  FX #{fxAgent.config.agent8004Id}
                </a>
              )}
              {yieldAgent?.config.agent8004Id != null && (
                <a
                  href={get8004ScanUrl(yieldAgent.config.agent8004Id)}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1 text-gb-accent hover:underline"
                >
                  <ShieldCheck className="size-3.5" />
                  Yield #{yieldAgent.config.agent8004Id}
                </a>
              )}
            </div>
          )}
        </div>

        <div className="flex gap-3">
          <Button
            size="lg"
            className="flex-1 gap-2 lg:flex-none"
            onClick={() => setReceiveOpen(true)}
            disabled={!primaryWalletAddress}
          >
            <ArrowDownLeft className="size-4" />
            Receive Funds
          </Button>
          <Button
            variant="outline"
            size="lg"
            className="flex-1 gap-2 lg:flex-none"
            onClick={() => setSendOpen(true)}
            disabled={!primaryWalletAddress}
          >
            <ArrowUpRight className="size-4" />
            Send
          </Button>
        </div>
      </Card>

      <SendModal
        open={sendOpen}
        onOpenChange={setSendOpen}
        holdings={fxHoldings}
        agentType="fx"
      />
      <ReceiveModal
        open={receiveOpen}
        onOpenChange={setReceiveOpen}
        walletAddress={primaryWalletAddress || '0x0'}
      />
    </>
  );
}
