'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import dynamic from 'next/dynamic';
import {
  TrendingUp,
  Sprout,
  ArrowLeftRight,
  LayoutDashboard,
  MessageSquareText,
  Eye,
  ChevronDown,
  Wallet,
  Menu,
  X,
  GitBranch,
  Store,
} from 'lucide-react';
import { usePortfolio } from '@/hooks/use-portfolio';
import { useYieldPositions } from '@/hooks/use-yield-agent';
import { formatUsd } from '@/lib/format';

const WalletConnect = dynamic(
  () => import('@/components/wallet-connect').then((m) => m.WalletConnect),
  { ssr: false },
);

const navItems = [
  { title: 'Overview', url: '/overview', icon: LayoutDashboard },
  { title: 'Chat', url: '/agent-chat', icon: MessageSquareText },
  { title: 'FX Agent', url: '/fx-agent', icon: TrendingUp },
  { title: 'Yield Agent', url: '/yield-agent', icon: Sprout },
  { title: 'Monitor', url: '/monitor', icon: Eye },
  { title: 'Swap', url: '/swap', icon: ArrowLeftRight },
  { title: 'Orchestration', url: '/orchestration', icon: GitBranch },
  { title: 'Marketplace', url: '/marketplace', icon: Store },
];

const isLpToken = (symbol: string) => /VAULT|LP|UNIV3/i.test(symbol);

function PortfolioDropdown() {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);
  const { data: fxData, isLoading: fxLoading } = usePortfolio('fx');
  const { data: yieldData, isLoading: yieldLoading } = usePortfolio('yield');
  const { data: yieldPositionsData } = useYieldPositions();

  const fxTotal = fxData?.totalValueUsd ?? 0;
  const yieldLiquidTotal = (yieldData?.holdings ?? [])
    .filter((h) => !isLpToken(h.tokenSymbol))
    .reduce((s, h) => s + (h.valueUsd || 0), 0);
  const yieldVaultTotal = (yieldPositionsData?.positions ?? []).reduce(
    (s, p) => s + Number(p.depositAmountUsd ?? 0),
    0,
  );
  const totalValue = fxTotal + yieldLiquidTotal + yieldVaultTotal;
  const isLoading = fxLoading || yieldLoading;

  const fxHoldings = (fxData?.holdings || []).filter((h) => h.valueUsd > 0.01);
  const yieldHoldings = (yieldData?.holdings || []).filter((h) => h.valueUsd > 0.01);

  React.useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 border-2 border-gb-dark bg-gb-dark/30 px-3 py-1.5 font-vt323 text-xl text-gb-accent uppercase transition-colors hover:bg-gb-dark"
      >
        <Wallet className="size-5 text-gb-accent" />
        <span>{isLoading ? '...' : formatUsd(totalValue)}</span>
        <ChevronDown className={`size-4 text-gb-light transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-72 border-4 border-gb-deep bg-gb-light shadow-[4px_4px_0px_var(--color-gb-deep)] z-50">
          <div className="bg-gb-deep px-3 py-1.5 font-press-start-2p text-xs text-gb-light uppercase">
            Portfolio
          </div>

          {/* FX Agent */}
          <div className="border-b-2 border-gb-deep p-3">
            <div className="flex items-center justify-between font-press-start-2p text-xs text-gb-deep mb-2">
              <span>FX Agent</span>
              <span>{formatUsd(fxTotal)}</span>
            </div>
            {fxHoldings.length > 0 ? (
              <div className="space-y-1">
                {fxHoldings.map((h) => (
                  <div key={h.tokenSymbol} className="flex justify-between font-vt323 text-base text-gb-dark uppercase">
                    <span>{h.tokenSymbol}</span>
                    <span>{formatUsd(h.valueUsd)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="font-vt323 text-base text-gb-dark uppercase">No positions</p>
            )}
          </div>

          {/* Yield Agent */}
          <div className="p-3">
            <div className="flex items-center justify-between font-press-start-2p text-xs text-gb-deep mb-2">
              <span>Yield Agent</span>
              <span>{formatUsd(yieldLiquidTotal + yieldVaultTotal)}</span>
            </div>
            {yieldHoldings.length > 0 ? (
              <div className="space-y-1">
                {yieldHoldings.map((h) => (
                  <div key={h.tokenSymbol} className="flex justify-between font-vt323 text-base text-gb-dark uppercase">
                    <span>{h.tokenSymbol}</span>
                    <span>{formatUsd(h.valueUsd)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="font-vt323 text-base text-gb-dark uppercase">No positions</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function TerminalNavbar() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = React.useState(false);

  return (
    <nav className="shrink-0 border-b-4 border-gb-deep bg-gb-deep z-50">
      {/* Main bar */}
      <div className="flex h-14 items-center gap-2 px-4">
        {/* Logo / prompt */}
        <Link href="/overview" className="flex items-center gap-2.5 shrink-0 mr-4">
          <span className="font-press-start-2p text-sm text-gb-accent uppercase tracking-wider hidden sm:inline">
            MANTLEAGENTS
          </span>
          <span className="font-press-start-2p text-sm text-gb-accent sm:hidden">JA</span>
          <span className="font-vt323 text-2xl text-gb-accent">&gt;</span>
        </Link>

        {/* Desktop nav items */}
        <div className="hidden md:flex items-center gap-1.5 flex-1">
          {navItems.map((item) => {
            const isActive = pathname.startsWith(item.url);
            return (
              <Link
                key={item.title}
                href={item.url}
                className={`flex items-center gap-2 px-4 py-2 font-vt323 text-xl uppercase transition-colors border-2 ${
                  isActive
                    ? 'bg-gb-accent text-gb-deep border-gb-accent font-bold'
                    : 'border-transparent text-gb-mid hover:bg-gb-dark/50 hover:text-gb-accent hover:border-gb-dark'
                }`}
              >
                <item.icon className="size-5" />
                <span>{item.title}</span>
              </Link>
            );
          })}
        </div>

        {/* Right section */}
        <div className="ml-auto flex items-center gap-2.5">
          {/* Network status */}
          <div className="hidden sm:flex items-center gap-2 border-2 border-gb-dark bg-gb-dark/30 px-3 py-1.5 font-vt323 text-lg text-gb-light uppercase">
            <span className="relative flex size-2.5">
              <span className="absolute inline-flex size-full animate-ping bg-green-400 opacity-60" />
              <span className="relative inline-flex size-2.5 bg-green-400" />
            </span>
            BSC
          </div>

          {/* Portfolio */}
          <div className="hidden sm:block">
            <PortfolioDropdown />
          </div>

          {/* Wallet */}
          <div className="[&>button]:border-2 [&>button]:border-gb-dark [&>button]:bg-gb-deep [&>button]:text-gb-light [&>button]:font-vt323 [&>button]:text-lg [&>button]:uppercase hover:[&>button]:bg-gb-dark [&_button]:!rounded-none [&_img]:!rounded-none">
            <WalletConnect />
          </div>

          {/* Mobile hamburger */}
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="md:hidden flex items-center justify-center size-10 border-2 border-gb-dark text-gb-light hover:text-gb-accent hover:bg-gb-dark/50"
          >
            {mobileOpen ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>
      </div>

      {/* Mobile dropdown */}
      {mobileOpen && (
        <div className="md:hidden border-t-2 border-gb-dark bg-gb-deep">
          <div className="grid grid-cols-2 gap-1.5 p-3">
            {navItems.map((item) => {
              const isActive = pathname.startsWith(item.url);
              return (
                <Link
                  key={item.title}
                  href={item.url}
                  onClick={() => setMobileOpen(false)}
                  className={`flex items-center gap-2.5 px-4 py-3 font-vt323 text-xl uppercase transition-colors border-2 ${
                    isActive
                      ? 'bg-gb-accent text-gb-deep border-gb-accent font-bold'
                      : 'border-gb-dark bg-gb-dark/20 text-gb-light hover:text-gb-accent hover:border-gb-accent hover:bg-gb-dark/40'
                  }`}
                >
                  <item.icon className="size-5" />
                  <span>{item.title}</span>
                </Link>
              );
            })}
          </div>
          {/* Mobile portfolio */}
          <div className="border-t-2 border-gb-dark p-3 sm:hidden">
            <PortfolioDropdown />
          </div>
        </div>
      )}
    </nav>
  );
}
