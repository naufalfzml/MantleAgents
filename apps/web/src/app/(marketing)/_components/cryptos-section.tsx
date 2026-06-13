import { ArrowUpRight } from 'lucide-react';
import { TokenLogo } from '@/components/token-logo';
import { TOKEN_METADATA } from '@mantleagents/shared';

const tokens = Object.entries(TOKEN_METADATA).map(([symbol, meta]) => ({
  symbol,
  name: meta.name,
  // Mock data for price/change since we don't have it in metadata yet
  price: '$1.00',
  change: '[+]',
  up: true,
  color: 'bg-neutral-800'
}));

function TokenPill({ token }: { token: typeof tokens[0] }) {
  return (
    <div className="flex shrink-0 items-center gap-4 border-4 border-gb-deep bg-gb-mid px-4 py-3 shadow-[4px_4px_0px_var(--color-gb-deep)]">
      <TokenLogo symbol={token.symbol} size={32} className="border-2 border-gb-deep" />
      <div className="flex flex-col font-vt323 uppercase">
        <span className="text-xl font-press-start-2p text-gb-deep">{token.symbol}</span>
        <span className="text-lg text-gb-dark">{token.price}</span>
      </div>
      <span
        className={`font-vt323 text-xl ml-4 ${
          token.up ? 'text-gb-deep' : 'text-gb-dark'
        }`}
      >
        {token.change}
      </span>
    </div>
  );
}

function MarqueeRow({ reverse = false }: { reverse?: boolean }) {
  const items = [...tokens, ...tokens, ...tokens];
  return (
    <div className="flex overflow-hidden py-2">
      <div
        className={`flex shrink-0 gap-6 ${
          reverse ? 'animate-marquee-reverse' : 'animate-marquee'
        }`}
      >
        {items.map((token, i) => (
          <TokenPill key={`${token.symbol}-${i}`} token={token} />
        ))}
      </div>
      <div
        className={`flex shrink-0 gap-6 ml-6 ${
          reverse ? 'animate-marquee-reverse' : 'animate-marquee'
        }`}
        aria-hidden
      >
        {items.map((token, i) => (
          <TokenPill key={`dup-${token.symbol}-${i}`} token={token} />
        ))}
      </div>
    </div>
  );
}

export function CryptosSection() {
  return (
    <section
      className="border-b-4 border-gb-deep bg-gb-light"
      id="cryptos"
    >
      <div className="mx-auto max-w-7xl border-x-4 border-gb-deep">
        <div className="grid items-stretch lg:grid-cols-2">
          <div className="flex flex-col justify-center border-b-4 lg:border-b-0 lg:border-r-4 border-gb-deep p-8 lg:p-16 bg-gb-mid">
            <h2 className="text-3xl font-press-start-2p text-gb-deep uppercase tracking-tight sm:text-4xl leading-snug">
              15+ GLOBAL CURRENCIES.
              <br />
              ONE AGENT RUNTIME.
            </h2>
            <p className="mt-8 max-w-md text-xl font-vt323 text-gb-dark uppercase">
              USDm, EURm, BRLm, KESm, NGNm, JPYm and more — plus USDC, USDT,
              and yield positions across Uniswap and ICHI vaults. Your agents
              trade and farm across all of it, automatically.
            </p>
            <a
              href="#get-started"
              className="mt-8 inline-flex items-center gap-1 font-vt323 text-2xl text-gb-deep transition-colors hover:text-gb-dark uppercase"
            >
              MantleAgents for Web
              <ArrowUpRight className="h-5 w-5" />
            </a>
          </div>

          <div className="flex flex-col justify-center space-y-4 overflow-hidden p-8 lg:p-16 bg-gb-light">
            <MarqueeRow />
            <MarqueeRow reverse />
            <MarqueeRow />
          </div>
        </div>
      </div>
    </section>
  );
}
