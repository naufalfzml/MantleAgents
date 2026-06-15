'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAccount, useDisconnect } from 'wagmi';
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
  LogOut,
  Copy,
  Check,
} from 'lucide-react';
import { usePortfolio } from '@/hooks/use-portfolio';
import { useYieldPositions } from '@/hooks/use-yield-agent';
import { useAuth } from '@/providers/auth-provider';
import { useSiweAuth } from '@/hooks/use-siwe-auth';
import { formatUsd, shortenAddress } from '@/lib/format';

const navItems = [
  { title: 'Overview', url: '/overview', icon: LayoutDashboard },
  { title: 'Chat', url: '/agent-chat', icon: MessageSquareText },
  { title: 'FX Agent', url: '/fx-agent', icon: TrendingUp },
  { title: 'Yield Agent', url: '/yield-agent', icon: Sprout },
  { title: 'Monitor', url: '/monitor', icon: Eye },
  { title: 'Swap', url: '/swap', icon: ArrowLeftRight },
];

const isLpToken = (symbol: string) => /VAULT|LP|UNIV3/i.test(symbol);

function getNetworkBadgeLabel(network: string | undefined): string {
  return network?.toLowerCase() === 'mainnet' ? 'Mantle' : 'Mantle Testnet';
}

function WalletDropdown() {
  const [open, setOpen] = React.useState(false);
  const [copied, setCopied] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  const { address, isConnected } = useAccount();
  const { disconnect } = useDisconnect();
  const { isAuthenticated, handleLogout } = useAuth();
  const { connectors, signIn, isPending } = useSiweAuth();

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

  const fxHoldings = (fxData?.holdings ?? []).filter((h) => (h.valueUsd || 0) > 0.01);
  const yieldHoldings = (yieldData?.holdings ?? []).filter(
    (h) => !isLpToken(h.tokenSymbol) && (h.valueUsd || 0) > 0.01,
  );

  React.useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleCopy = () => {
    if (!address) return;
    navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const handleDisconnect = async () => {
    setOpen(false);
    await handleLogout();
    disconnect();
  };

  // Not connected — show connect button
  if (!isConnected || !isAuthenticated) {
    return (
      <button
        onClick={() => {
          const connector = connectors[0];
          if (connector) signIn(connector);
        }}
        disabled={isPending}
        className="flex items-center gap-2 border-2 border-gb-dark bg-gb-deep px-3 py-1.5 font-vt323 text-lg text-gb-light uppercase transition-colors hover:bg-gb-dark disabled:opacity-50"
      >
        <Wallet className="size-4" />
        {isPending ? 'Connecting...' : 'Connect'}
      </button>
    );
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 border-2 border-gb-dark bg-gb-dark/30 px-3 py-1.5 font-vt323 text-xl text-gb-accent uppercase transition-colors hover:bg-gb-dark"
      >
        <Wallet className="size-4 text-gb-accent" />
        <span>{isLoading ? '...' : formatUsd(totalValue)}</span>
        <ChevronDown className={`size-4 text-gb-light transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 border-4 border-gb-deep bg-gb-light shadow-[4px_4px_0px_var(--color-gb-deep)] z-50">
          {/* Wallet address */}
          <div className="flex items-center justify-between bg-gb-deep px-3 py-2">
            <span className="font-vt323 text-lg text-gb-light uppercase tracking-wide">
              {address ? shortenAddress(address) : 'Connected'}
            </span>
            <button
              onClick={handleCopy}
              className="flex items-center gap-1 font-vt323 text-sm text-gb-mid hover:text-gb-accent transition-colors"
            >
              {copied ? <Check className="size-3.5 text-green-400" /> : <Copy className="size-3.5" />}
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>

          {/* Total */}
          <div className="flex items-center justify-between border-b-2 border-gb-deep px-3 py-2">
            <span className="font-press-start-2p text-xs text-gb-dark uppercase">Total</span>
            <span className="font-vt323 text-xl text-gb-deep font-bold">
              {isLoading ? '...' : formatUsd(totalValue)}
            </span>
          </div>

          {/* FX Holdings */}
          <div className="border-b-2 border-gb-mid/40 px-3 py-2">
            <div className="flex items-center justify-between mb-1.5">
              <span className="font-press-start-2p text-xs text-gb-dark">FX Agent</span>
              <span className="font-vt323 text-base text-gb-dark">{formatUsd(fxTotal)}</span>
            </div>
            {fxHoldings.length > 0 ? (
              <div className="space-y-0.5">
                {fxHoldings.slice(0, 4).map((h) => (
                  <div key={h.tokenSymbol} className="flex justify-between font-vt323 text-sm text-gb-dark/70 uppercase">
                    <span>{h.tokenSymbol}</span>
                    <span>{formatUsd(h.valueUsd)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="font-vt323 text-sm text-gb-dark/50 uppercase">No positions</p>
            )}
          </div>

          {/* Yield Holdings */}
          <div className="border-b-2 border-gb-deep px-3 py-2">
            <div className="flex items-center justify-between mb-1.5">
              <span className="font-press-start-2p text-xs text-gb-dark">Yield Agent</span>
              <span className="font-vt323 text-base text-gb-dark">{formatUsd(yieldLiquidTotal + yieldVaultTotal)}</span>
            </div>
            {yieldHoldings.length > 0 ? (
              <div className="space-y-0.5">
                {yieldHoldings.slice(0, 4).map((h) => (
                  <div key={h.tokenSymbol} className="flex justify-between font-vt323 text-sm text-gb-dark/70 uppercase">
                    <span>{h.tokenSymbol}</span>
                    <span>{formatUsd(h.valueUsd)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="font-vt323 text-sm text-gb-dark/50 uppercase">No positions</p>
            )}
          </div>

          {/* Disconnect */}
          <button
            onClick={handleDisconnect}
            className="flex w-full items-center gap-2 px-3 py-2.5 font-vt323 text-lg text-red-600 uppercase transition-colors hover:bg-red-50"
          >
            <LogOut className="size-4" />
            Disconnect Wallet
          </button>
        </div>
      )}
    </div>
  );
}

export function TerminalNavbar() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const networkLabel = getNetworkBadgeLabel(process.env.NEXT_PUBLIC_MANTLE_NETWORK);

  return (
    <nav className="shrink-0 border-b-4 border-gb-deep bg-gb-deep z-50">
      <div className="flex h-14 items-center gap-1 px-3">
        {/* Logo */}
        <Link href="/overview" className="flex items-center gap-2 shrink-0 mr-2">
          <span className="font-press-start-2p text-sm text-gb-accent uppercase tracking-wider hidden lg:inline">
            MANTLEAGENTS
          </span>
          <span className="font-press-start-2p text-xs text-gb-accent md:hidden">JA</span>
          <span className="font-vt323 text-2xl text-gb-accent">&gt;</span>
        </Link>

        {/* Desktop nav — icon + short label, compressed */}
        <div className="hidden md:flex items-center gap-0.5 flex-1 overflow-x-auto scrollbar-none">
          {navItems.map((item) => {
            const isActive = pathname.startsWith(item.url);
            return (
              <Link
                key={item.title}
                href={item.url}
                className={`flex items-center gap-1.5 px-2.5 py-2 font-vt323 text-lg uppercase transition-colors border-2 shrink-0 ${
                  isActive
                    ? 'bg-gb-accent text-gb-deep border-gb-accent font-bold'
                    : 'border-transparent text-gb-mid hover:bg-gb-dark/50 hover:text-gb-accent hover:border-gb-dark'
                }`}
              >
                <item.icon className="size-4 shrink-0" />
                <span className="hidden lg:inline">{item.title}</span>
              </Link>
            );
          })}
        </div>

        {/* Right section */}
        <div className="ml-auto flex items-center gap-2 shrink-0">
          {/* Network badge */}
          <div className="hidden sm:flex items-center gap-1.5 border-2 border-gb-dark bg-gb-dark/30 px-2.5 py-1.5 font-vt323 text-base text-gb-light uppercase">
            <span className="relative flex size-2">
              <span className="absolute inline-flex size-full animate-ping bg-green-400 opacity-60" />
              <span className="relative inline-flex size-2 bg-green-400" />
            </span>
            {networkLabel}
          </div>

          {/* Unified wallet dropdown */}
          <WalletDropdown />

          {/* Mobile hamburger */}
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="md:hidden flex items-center justify-center size-9 border-2 border-gb-dark text-gb-light hover:text-gb-accent hover:bg-gb-dark/50"
          >
            {mobileOpen ? <X className="size-4" /> : <Menu className="size-4" />}
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
        </div>
      )}
    </nav>
  );
}
