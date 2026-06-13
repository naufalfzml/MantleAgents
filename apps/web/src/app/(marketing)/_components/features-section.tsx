import { TrendingUp, Sprout, Lock, Newspaper, Shield, Zap } from 'lucide-react';
import { TokenLogo } from '@/components/token-logo';
import { TOKEN_METADATA } from '@mantleagents/shared';

const tokens = Object.entries(TOKEN_METADATA).map(([symbol, meta]) => ({
  symbol,
  name: meta.name,
}));

function TokenPill({ token }: { token: (typeof tokens)[0] }) {
  return (
    <div className="flex shrink-0 items-center gap-3 border-4 border-gb-deep bg-gb-light px-3 py-2 shadow-[4px_4px_0px_var(--color-gb-deep)]">
      <TokenLogo symbol={token.symbol} size={24} className="border-2 border-gb-deep" />
      <span className="font-press-start-2p text-sm text-gb-deep">{token.symbol}</span>
    </div>
  );
}

function MarqueeRow({ reverse = false }: { reverse?: boolean }) {
  const items = [...tokens, ...tokens, ...tokens];
  return (
    <div className="flex overflow-hidden py-1.5">
      <div className={`flex shrink-0 gap-4 ${reverse ? 'animate-marquee-reverse' : 'animate-marquee'}`}>
        {items.map((token, i) => (
          <TokenPill key={`${token.symbol}-${i}`} token={token} />
        ))}
      </div>
      <div className={`flex shrink-0 gap-4 ml-4 ${reverse ? 'animate-marquee-reverse' : 'animate-marquee'}`} aria-hidden>
        {items.map((token, i) => (
          <TokenPill key={`dup-${token.symbol}-${i}`} token={token} />
        ))}
      </div>
    </div>
  );
}

const capabilities = [
  {
    icon: TrendingUp,
    title: 'Automated FX Trading',
    description:
      'AI reads macro headlines, generates directional signals, and swaps stablecoins across 15+ currencies via automated DEX aggregation. Fully autonomous execution with best-price routing.',
    span: 'lg:col-span-2',
  },
  {
    icon: Sprout,
    title: 'Yield Farming',
    description:
      'Discovers the best on-chain yields across ICHI, Uniswap, CarbonFi, and Merkl. Deploys capital, auto-compounds, and exits when returns drop.',
    span: 'lg:col-span-1',
  },
  {
    icon: Newspaper,
    title: 'Market Data Intel',
    description:
      'Aggregates token analytics from real-time market data, FX news, social sentiment, and macro shifts in real-time. Connected to Parallel AI, Grok, and Firecrawl.',
    span: 'lg:col-span-1',
  },
  {
    icon: Lock,
    title: 'TEE Proofs',
    description:
      'Every agent decision runs inside a Trusted Execution Environment by Phala Network. Cryptographic attestation proves no one — not even us — altered the logic.',
    span: 'lg:col-span-2',
  },
];

const principles = [
  {
    icon: Shield,
    title: 'Non-Custodial',
    description:
      'Private keys stay with you. Agents use server wallets to execute, and every agent registers on-chain via ERC-8004 for a verifiable audit trail.',
  },
  {
    icon: Zap,
    title: 'Gasless',
    description:
      'All transactions are sponsored through EIP-7702. You pay zero gas — set your guardrails and let the agents move.',
  },
];

export function FeaturesSection() {
  return (
    <section className="border-b-4 border-gb-deep bg-gb-light" id="features">
      <div className="mx-auto max-w-7xl border-x-4 border-gb-deep">
        {/* Supported assets marquee band */}
        <div className="border-b-4 border-gb-deep bg-gb-mid py-6 overflow-hidden">
          <p className="text-center font-press-start-2p text-sm text-gb-deep mb-4 uppercase">
            Supported Assets
          </p>
          <MarqueeRow />
          <MarqueeRow reverse />
        </div>

        {/* Bento grid - asymmetric */}
        <div className="grid grid-cols-1 lg:grid-cols-3 bg-gb-light">
          {capabilities.map((cap, index) => (
            <div
              key={cap.title}
              className={`${cap.span} flex flex-col p-8 lg:p-10 border-b-4 border-gb-deep transition-colors hover:bg-gb-mid ${
                index === 0 || index === 2 ? 'lg:border-r-4 border-gb-deep' : ''
              }`}
            >
              <div className="mb-5 flex h-12 w-12 items-center justify-center border-4 border-gb-deep bg-gb-deep shadow-[4px_4px_0px_var(--color-gb-deep)]">
                <cap.icon className="h-6 w-6 text-gb-light" />
              </div>
              <h3 className="text-xl font-press-start-2p text-gb-deep uppercase leading-snug">
                {cap.title}
              </h3>
              <p className="mt-4 text-lg font-vt323 leading-relaxed text-gb-dark uppercase">
                {cap.description}
              </p>
            </div>
          ))}
        </div>

        {/* Principles row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 bg-gb-deep">
          {principles.map((p, index) => (
            <div
              key={p.title}
              className={`flex flex-col p-8 lg:p-10 ${
                index === 0 ? 'sm:border-r-4 border-b-4 sm:border-b-0 border-gb-mid' : ''
              }`}
            >
              <div className="mb-5 flex h-12 w-12 items-center justify-center border-4 border-gb-mid bg-gb-mid shadow-[4px_4px_0px_var(--color-gb-mid)]">
                <p.icon className="h-6 w-6 text-gb-deep" />
              </div>
              <h3 className="text-xl font-press-start-2p text-gb-light uppercase leading-snug">
                {p.title}
              </h3>
              <p className="mt-4 text-lg font-vt323 leading-relaxed text-gb-mid uppercase">
                {p.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
