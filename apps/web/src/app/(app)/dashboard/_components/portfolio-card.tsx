'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { Copy, Check, Wallet, ArrowUpRight, ArrowDownLeft, Info } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { TokenInfo } from '@mantleagents/shared';
import { TOKEN_METADATA } from '@mantleagents/shared';
import { TokenLogo } from '@/components/token-logo';
import { formatUsd, formatPct, pctColorClass } from '@/lib/format';
import { shortenAddress } from '@/lib/format';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { ReceiveModal } from './receive-modal';
import { SendModal } from './send-modal';

const SparklineArea = dynamic(
  () => import('./portfolio-charts').then((m) => m.SparklineArea),
  { ssr: false },
);

const PerformanceChart = dynamic(
  () => import('./portfolio-charts').then((m) => m.PerformanceChart),
  {
    ssr: false,
    loading: () => <Skeleton className="h-48 w-full rounded-lg" />,
  },
);

interface PortfolioCardProps {
  totalValueUsd: number;
  totalPnl: number | null;
  totalPnlPct: number | null;
  holdings: Array<{
    tokenSymbol: string;
    balance: number;
    priceUsd: number;
    valueUsd: number;
    avgEntryRate?: number | null;
    costBasis?: number | null;
  }>;
  isLoading: boolean;
  serverWalletAddress: string | null;
  marketTokens?: TokenInfo[];
  agentType?: 'fx' | 'yield';
}

/* ------------------------------------------------------------------ */
/*  Token Holding Card                                                 */
/* ------------------------------------------------------------------ */

function TokenHoldingCard({
  tokenSymbol,
  balance,
  valueUsd,
  marketInfo,
}: {
  tokenSymbol: string;
  balance: number;
  valueUsd: number;
  marketInfo?: TokenInfo;
}) {
  const meta = TOKEN_METADATA[tokenSymbol];
  const name = meta?.name ?? tokenSymbol;
  const change = marketInfo?.change24hPct ?? 0;
  const sparkline = marketInfo?.sparkline7d ?? [];

  // Determine sparkline color: green if up over 7d, red if down
  const isUp =
    sparkline.length >= 2 ? sparkline[sparkline.length - 1] >= sparkline[0] : true;
  const sparkColor = isUp ? 'var(--success)' : 'var(--destructive)';

  return (
    <div className="relative overflow-hidden rounded-xl border bg-card p-4 min-h-[100px] flex flex-col justify-between">
      {/* Background sparkline */}
      {sparkline.length >= 2 && (
        <div className="absolute bottom-0 left-0 right-0 h-[60%] opacity-25 pointer-events-none">
          <SparklineArea data={sparkline} color={sparkColor} />
        </div>
      )}

      {/* Content layer */}
      <div className="relative z-10 flex flex-col gap-3">
        {/* Top row: token identity */}
        <div className="flex items-center gap-2">
          <TokenLogo symbol={tokenSymbol} size={20} />
          <span className="font-semibold text-sm">{tokenSymbol}</span>
          <span className="text-xs text-muted-foreground truncate">{name}</span>
        </div>

        {/* Bottom row: balance + value + change */}
        <div className="flex items-end justify-between gap-2">
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground truncate font-mono tabular-nums">
              {balance.toLocaleString('en-US', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}{' '}
              {tokenSymbol}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="font-mono text-sm tabular-nums font-medium">
              {formatUsd(valueUsd)}
            </span>
            {marketInfo && (
              <Badge
                variant="outline"
                className={cn(
                  'text-[11px] px-1.5 py-0 font-mono tabular-nums border-transparent',
                  pctColorClass(change),
                )}
              >
                {formatPct(change)}
              </Badge>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Portfolio Card                                                     */
/* ------------------------------------------------------------------ */

export function PortfolioCard({
  totalValueUsd,
  totalPnl,
  totalPnlPct,
  holdings,
  isLoading,
  serverWalletAddress,
  marketTokens,
  agentType = 'fx',
}: PortfolioCardProps) {
  const [copied, setCopied] = useState(false);
  const [receiveOpen, setReceiveOpen] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);

  const sortedHoldings = useMemo(
    () =>
      [...holdings]
        .filter((h) => h.valueUsd >= 0.01)
        .sort((a, b) => b.valueUsd - a.valueUsd),
    [holdings],
  );

  // Show banner when user holds USDm or USDT instead of USDC (preferred for yield agent)
  const nonUsdcStables = useMemo(
    () =>
      sortedHoldings.filter(
        (h) => (h.tokenSymbol === 'USDm' || h.tokenSymbol === 'USDT') && h.valueUsd >= 0.01,
      ),
    [sortedHoldings],
  );

  // Build a lookup map from market tokens for quick access
  const marketMap = useMemo(() => {
    const map = new Map<string, TokenInfo>();
    if (marketTokens) {
      for (const t of marketTokens) {
        map.set(t.symbol, t);
      }
    }
    return map;
  }, [marketTokens]);

  async function handleCopy() {
    if (!serverWalletAddress) return;
    await navigator.clipboard.writeText(serverWalletAddress);
    toast('Address copied!');
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Portfolio</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-9 w-40" />
          <Skeleton className="h-4 w-24" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-[100px] rounded-xl" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (holdings.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Portfolio</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col items-center justify-center py-8 text-center">
          <div className="flex size-12 items-center justify-center rounded-full bg-muted">
            <Wallet className="size-5 text-muted-foreground" />
          </div>
          <p className="mt-3 font-medium text-sm">No positions yet</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Fund your agent wallet to start trading.
          </p>
          {serverWalletAddress && (
            <div className="mt-4 flex items-center gap-2 rounded-lg border bg-muted/50 px-3 py-2">
              <code className="font-mono text-xs">
                {shortenAddress(serverWalletAddress, 6)}
              </code>
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={handleCopy}
              >
                {copied ? (
                  <Check className="size-3 text-success" />
                ) : (
                  <Copy className="size-3" />
                )}
                <span className="sr-only">Copy address</span>
              </Button>
            </div>
          )}

          {/* Send / Receive buttons */}
          <div className="mt-4 flex items-center justify-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              disabled={holdings.length === 0}
              onClick={() => setSendOpen(true)}
            >
              <ArrowUpRight className="size-4" />
              Send
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              disabled={!serverWalletAddress}
              onClick={() => setReceiveOpen(true)}
            >
              <ArrowDownLeft className="size-4" />
              Receive
            </Button>
          </div>

          {/* Modals */}
          {serverWalletAddress && (
            <ReceiveModal
              open={receiveOpen}
              onOpenChange={setReceiveOpen}
              walletAddress={serverWalletAddress}
            />
          )}
          <SendModal
            open={sendOpen}
            onOpenChange={setSendOpen}
            holdings={holdings}
            agentType={agentType}
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Portfolio</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-start justify-between">
          <div>
            <span className="font-mono text-3xl tabular-nums font-bold">
              {formatUsd(totalValueUsd)}
            </span>
            {totalPnl != null ? (
              <p className={cn('text-sm mt-1 font-mono tabular-nums', pctColorClass(totalPnl))}>
                {totalPnl >= 0 ? '+' : ''}{formatUsd(totalPnl)} PnL
                {totalPnlPct != null && (
                  <span className="text-muted-foreground ml-1">
                    ({totalPnlPct >= 0 ? '+' : ''}{totalPnlPct.toFixed(1)}%)
                  </span>
                )}
              </p>
            ) : (
              <p className="text-sm text-muted-foreground mt-1">
                <span className="font-mono tabular-nums">--</span> PnL
              </p>
            )}
          </div>

          {/* Send / Receive buttons */}
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              disabled={holdings.length === 0}
              onClick={() => setSendOpen(true)}
            >
              <ArrowUpRight className="size-4" />
              Send
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              disabled={!serverWalletAddress}
              onClick={() => setReceiveOpen(true)}
            >
              <ArrowDownLeft className="size-4" />
              Receive
            </Button>
          </div>
        </div>

        {/* Banner when user has USDm/USDT instead of USDC */}
        {nonUsdcStables.length > 0 && (
          <div className="mt-4 flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2.5">
            <Info className="size-4 shrink-0 text-amber-500 mt-0.5" />
            <div className="text-sm">
              <p className="font-medium text-amber-600 dark:text-amber-400">
                Agent only works with USDC
              </p>
              <p className="mt-0.5 text-muted-foreground">
                You have {nonUsdcStables.map((h) => h.tokenSymbol).join(' and ')}. Use the{' '}
                <Link href="/swap" className="text-primary hover:underline font-medium">
                  Swap
                </Link>{' '}
                feature to convert to USDC.
              </p>
            </div>
          </div>
        )}

        {/* Token holding cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-6">
          {sortedHoldings.map((h) => (
            <TokenHoldingCard
              key={h.tokenSymbol}
              tokenSymbol={h.tokenSymbol}
              balance={h.balance}
              valueUsd={h.valueUsd}
              marketInfo={marketMap.get(h.tokenSymbol)}
            />
          ))}
        </div>

        {/* Performance chart */}
        <div className="mt-6">
          <p className="text-xs font-medium text-muted-foreground mb-3">
            Portfolio Performance (7d)
          </p>
          <PerformanceChart />
        </div>

        {/* Modals */}
        {serverWalletAddress && (
          <ReceiveModal
            open={receiveOpen}
            onOpenChange={setReceiveOpen}
            walletAddress={serverWalletAddress}
          />
        )}
        <SendModal
          open={sendOpen}
          onOpenChange={setSendOpen}
          holdings={holdings}
          agentType={agentType}
        />
      </CardContent>
    </Card>
  );
}
