'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Plus } from 'lucide-react';

const faqs = [
  {
    q: 'What exactly does MantleAgents do?',
    a: 'It runs autonomous AI agents on your behalf — they trade stablecoins across 15+ currencies via automated DEX aggregation, farm yield on DeFi protocols, and monitor markets around the clock using real-time market data. Everything happens on-chain and non-custodial.',
  },
  {
    q: 'How does the platform execute trades?',
    a: 'The execution layer provides the core trading and data infrastructure. All swaps route through automated DEX aggregation for best-price execution, and market data flows from real-time market data APIs — covering token prices, risk scores, holder analytics, and more.',
  },
  {
    q: 'How do I get started?',
    a: 'Connect any wallet or sign in with Google, Apple, or X. No identity verification, no email, no forms. Once connected, configure your agent guardrails and activate.',
  },
  {
    q: 'Are my funds safe?',
    a: 'You remain non-custodial at all times. Agents execute through server wallets using gasless EIP-7702 transactions — your private keys never leave your control. Agent logic runs in TEEs with cryptographic attestation.',
  },
  {
    q: 'What currencies and assets are covered?',
    a: 'USDm, EURm, BRLm, KESm, NGNm, JPYm, CHFm, GBPm, and more — plus USDC, USDT, and yield positions via ICHI vaults, Uniswap, and Merkl. All trades are executed across BSC, Solana, ETH, and Base.',
  },
  {
    q: 'Do I pay for gas?',
    a: 'No. Every transaction is fully sponsored via EIP-7702. You pay zero gas fees.',
  },
  {
    q: 'Can I limit what agents are allowed to do?',
    a: 'Yes. Every agent has configurable guardrails — max trade size, daily trade count, allocation caps, stop-loss thresholds, and currency allowlists. You define the boundaries.',
  },
];

function FaqItem({ faq, index }: { faq: (typeof faqs)[0]; index: number }) {
  const [open, setOpen] = useState(false);

  return (
    <div
      className={`border-4 border-gb-deep bg-gb-light transition-colors hover:bg-gb-mid cursor-pointer shadow-[4px_4px_0px_var(--color-gb-deep)] ${
        open ? 'bg-gb-mid' : ''
      }`}
    >
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-4 p-6 text-left"
      >
        <span className="font-press-start-2p text-sm text-gb-deep shrink-0">
          {String(index + 1).padStart(2, '0')}
        </span>
        <span className="flex-1 text-lg font-press-start-2p text-gb-deep uppercase leading-snug">
          {faq.q}
        </span>
        <Plus
          className={`h-5 w-5 shrink-0 text-gb-deep transition-transform duration-200 ${
            open ? 'rotate-45' : ''
          }`}
        />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <p className="px-6 pb-6 pl-16 text-lg font-vt323 leading-relaxed text-gb-dark uppercase">
              {faq.a}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function FaqSection() {
  return (
    <section className="border-b-4 border-gb-deep bg-gb-mid" id="faq">
      <div className="mx-auto max-w-3xl px-4 py-16 lg:py-24">
        {/* Header - centered */}
        <div className="text-center mb-12">
          <h2 className="text-3xl font-press-start-2p text-gb-deep sm:text-4xl uppercase">
            FAQ
          </h2>
          <p className="mt-6 text-xl font-vt323 text-gb-dark uppercase">
            Straight answers. No filler.
          </p>
        </div>

        {/* Single column FAQ stack */}
        <div className="space-y-4">
          {faqs.map((faq, index) => (
            <FaqItem key={faq.q} faq={faq} index={index} />
          ))}
        </div>
      </div>
    </section>
  );
}
