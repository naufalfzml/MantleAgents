'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronLeft, ChevronRight, BadgeCheck } from 'lucide-react';

const testimonials = [
  {
    quote:
      'I literally set the guardrails once and forgot about it. Woke up to the yield agent having auto-compounded rewards overnight. This is the way.',
    name: 'Alex M.',
    role: 'DeFi degen, previously manual trader',
  },
  {
    quote:
      'The FX agent reads the news, picks the signal, and executes — all without me touching anything. I used to spend hours on this. Now I don\'t.',
    name: 'Sarah K.',
    role: 'Portfolio manager, DeFi ecosystem',
  },
  {
    quote:
      'Finally a platform that treats agents as first-class citizens. The ERC-8004 on-chain identity for agents is a nice touch — verifiable, not a black box.',
    name: 'James T.',
    role: 'Founder, BlockBridge',
  },
];

export function Testimonials() {
  const [current, setCurrent] = useState(0);

  const prev = () =>
    setCurrent((c) => (c === 0 ? testimonials.length - 1 : c - 1));
  const next = () =>
    setCurrent((c) => (c === testimonials.length - 1 ? 0 : c + 1));

  return (
    <section
      className="border-y-4 border-gb-deep bg-gb-light py-24"
      id="testimonials"
    >
      <div className="mx-auto max-w-7xl px-6 border-x-4 border-gb-deep bg-gb-mid p-8 lg:p-16 shadow-[8px_8px_0px_var(--color-gb-deep)]">
        <div className="mb-12 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="text-3xl font-press-start-2p text-gb-deep uppercase tracking-tight sm:text-4xl">
              Don't take our word for it.
              <br />
              Take theirs.
            </h2>
          </div>
          <p className="max-w-sm text-lg font-vt323 text-gb-dark uppercase">
            Real players, real loot. See what others have to say about deploying MantleAgents.
          </p>
        </div>

        <div className="relative overflow-hidden border-4 border-gb-deep bg-gb-light shadow-inner">
          <div className="absolute left-0 top-0 z-10 h-full w-12 bg-gradient-to-r from-gb-light to-transparent" />
          <div className="absolute right-0 top-0 z-10 h-full w-12 bg-gradient-to-l from-gb-light to-transparent" />

          <div className="relative px-12 py-16">
            <AnimatePresence mode="wait">
              <motion.div
                key={current}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.2 }}
                className="flex flex-col items-center text-center"
              >
                <div className="mb-6 flex space-x-1">
                  {[...Array(5)].map((_, i) => (
                    <BadgeCheck
                      key={i}
                      className="h-6 w-6 text-gb-deep"
                      strokeWidth={2}
                    />
                  ))}
                </div>
                <p className="max-w-4xl text-2xl font-vt323 leading-relaxed text-gb-deep uppercase sm:text-3xl lg:text-4xl">
                  "{testimonials[current].quote}"
                </p>
                <div className="mt-8">
                  <div className="font-press-start-2p text-lg text-gb-deep uppercase">
                    {testimonials[current].name}
                  </div>
                  <div className="mt-2 font-vt323 text-lg text-gb-dark uppercase">
                    {testimonials[current].role}
                  </div>
                </div>
              </motion.div>
            </AnimatePresence>
          </div>
        </div>

        <div className="mt-8 flex justify-center gap-4">
          <button
            onClick={prev}
            className="flex h-14 w-14 items-center justify-center border-4 border-gb-deep bg-gb-light text-gb-deep transition-colors hover:bg-gb-mid shadow-[4px_4px_0px_var(--color-gb-deep)] active:translate-x-[2px] active:translate-y-[2px] active:shadow-[2px_2px_0px_var(--color-gb-deep)] cursor-pointer"
            aria-label="Previous testimonial"
          >
            <ChevronLeft className="h-6 w-6" />
          </button>
          <button
            onClick={next}
            className="flex h-14 w-14 items-center justify-center border-4 border-gb-deep bg-gb-light text-gb-deep transition-colors hover:bg-gb-mid shadow-[4px_4px_0px_var(--color-gb-deep)] active:translate-x-[2px] active:translate-y-[2px] active:shadow-[2px_2px_0px_var(--color-gb-deep)] cursor-pointer"
            aria-label="Next testimonial"
          >
            <ChevronRight className="h-6 w-6" />
          </button>
        </div>
      </div>
    </section>
  );
}
