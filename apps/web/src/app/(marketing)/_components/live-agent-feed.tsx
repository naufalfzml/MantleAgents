'use client';

import { useEffect, useState } from 'react';

const feedEntries = [
  { time: '14:32:01', agent: 'FX', message: 'Scanning EUR/USD macro sentiment...', type: 'info' as const },
  { time: '14:32:03', agent: 'FX', message: 'Signal detected: BUY EURm — confidence 0.82', type: 'signal' as const },
  { time: '14:32:05', agent: 'FX', message: 'Executing swap: 150 USDC -> EURm via DEX swap', type: 'exec' as const },
  { time: '14:32:08', agent: 'FX', message: 'Swap confirmed. TX: 0xa3f1...9e2c', type: 'success' as const },
  { time: '14:32:12', agent: 'YIELD', message: 'Checking ICHI vault APRs on BSC...', type: 'info' as const },
  { time: '14:32:14', agent: 'YIELD', message: 'Best opportunity: USDC/USDT vault — 12.4% APR', type: 'signal' as const },
  { time: '14:32:16', agent: 'YIELD', message: 'Depositing 500 USDC into vault', type: 'exec' as const },
  { time: '14:32:19', agent: 'YIELD', message: 'Deposit confirmed. Position active.', type: 'success' as const },
  { time: '14:32:22', agent: 'NEWS', message: 'Fetching headlines from Parallel AI...', type: 'info' as const },
  { time: '14:32:24', agent: 'NEWS', message: 'Alert: Fed rate decision in 2h — risk elevated', type: 'signal' as const },
  { time: '14:32:26', agent: 'FX', message: 'Guardrail check: daily limit 3/5 trades used', type: 'info' as const },
  { time: '14:32:28', agent: 'TEE', message: 'Attestation generated. Proof hash: 0xb7e2...4f1a', type: 'success' as const },
];

const typeColors: Record<string, string> = {
  info: 'text-gb-dark',
  signal: 'text-gb-deep',
  exec: 'text-gb-deep animate-pulse',
  success: 'text-gb-deep',
};

const typePrefix: Record<string, string> = {
  info: '[...]',
  signal: '[>>>]',
  exec: '[RUN]',
  success: '[ OK]',
};

export function LiveAgentFeed() {
  const [visibleCount, setVisibleCount] = useState(0);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          let i = 0;
          const timer = setInterval(() => {
            i++;
            setVisibleCount(i);
            if (i >= feedEntries.length) {
              clearInterval(timer);
            }
          }, 600);
          observer.disconnect();
          return () => clearInterval(timer);
        }
      },
      { threshold: 0.3 }
    );

    const el = document.getElementById('agent-feed-terminal');
    if (el) observer.observe(el);

    return () => observer.disconnect();
  }, []);

  return (
    <section className="border-b-4 border-gb-deep bg-gb-deep" id="agent-feed">
      <div className="mx-auto max-w-7xl border-x-4 border-gb-mid">
        <div className="grid grid-cols-1 lg:grid-cols-5">
          {/* Left - description */}
          <div className="lg:col-span-2 flex flex-col justify-center p-8 lg:p-12 border-b-4 lg:border-b-0 lg:border-r-4 border-gb-mid">
            <h2 className="text-3xl font-press-start-2p text-gb-light sm:text-4xl uppercase leading-snug">
              Agent Activity Log
            </h2>
            <p className="mt-8 text-xl font-vt323 text-gb-mid uppercase leading-relaxed">
              This is what your agents do while you sleep. Every action is logged, every decision is provable, every trade has a receipt.
            </p>
            <div className="mt-8 flex items-center gap-3 font-vt323 text-lg text-gb-mid uppercase">
              <span className="inline-block h-3 w-3 bg-gb-mid animate-pulse" />
              Simulation — actual feed streams in your dashboard
            </div>
          </div>

          {/* Right - terminal */}
          <div
            id="agent-feed-terminal"
            className="lg:col-span-3 bg-gb-dark p-6 lg:p-8 min-h-[400px] flex flex-col"
          >
            {/* Terminal header bar */}
            <div className="flex items-center gap-2 mb-6 pb-4 border-b-4 border-gb-deep">
              <div className="h-3 w-3 border-2 border-gb-mid" />
              <div className="h-3 w-3 border-2 border-gb-mid" />
              <div className="h-3 w-3 border-2 border-gb-mid" />
              <span className="ml-4 font-press-start-2p text-xs text-gb-mid uppercase">
                mantleagents://feed
              </span>
            </div>

            {/* Feed lines */}
            <div className="flex-1 space-y-1.5 font-vt323 text-lg overflow-hidden">
              {feedEntries.slice(0, visibleCount).map((entry, i) => (
                <div key={i} className="flex gap-3 items-start">
                  <span className="text-gb-dark shrink-0">{entry.time}</span>
                  <span className="text-gb-mid shrink-0 font-press-start-2p text-xs mt-1">
                    {entry.agent}
                  </span>
                  <span className={`shrink-0 ${typeColors[entry.type]}`}>
                    {typePrefix[entry.type]}
                  </span>
                  <span className="text-gb-mid">{entry.message}</span>
                </div>
              ))}
              {visibleCount < feedEntries.length && visibleCount > 0 && (
                <span className="text-gb-mid animate-pulse">_</span>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
