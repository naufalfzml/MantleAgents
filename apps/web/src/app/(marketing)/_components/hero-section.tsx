'use client';

import { useEffect, useState } from 'react';
import { ConnectCTA } from './connect-cta';
import { VideoModal } from './video-modal';
import { Button } from '@/components/ui/button';
import Image from 'next/image';

export function HeroSection() {
  const fullText = "WAKE UP, TRADER... THE MARKETS NEVER SLEEP, BUT YOU CAN. I AM YOUR AUTONOMOUS AGENT — POWERED BY AI. I HUNT YIELD. I EXECUTE TRADES. I SCAN EVERY TOKEN. DO YOU WISH TO DEPLOY ME?";
  const [displayedText, setDisplayedText] = useState("");
  const [isTyping, setIsTyping] = useState(true);

  useEffect(() => {
    let i = 0;
    const timer = setInterval(() => {
      setDisplayedText(fullText.substring(0, i));
      i++;
      if (i > fullText.length) {
        clearInterval(timer);
        setIsTyping(false);
      }
    }, 40); // 40ms per character for that classic RPG speed

    return () => clearInterval(timer);
  }, []);

  return (
    <section className="relative min-h-screen flex flex-col items-center justify-end pb-12 px-4 border-b-4 border-gb-deep" id="hero">

      {/* Background Image created from Nano Banana */}
      <div className="absolute inset-0 z-0 bg-gb-dark">
        <Image
          src="/hero-bg.png"
          alt="Nano Banana Agent Background"
          fill
          className="object-cover pixelated opacity-90 mix-blend-luminosity object-top"
          priority
        />
        {/* Gradient overlay for text readability at bottom */}
        <div className="absolute inset-0 bg-gradient-to-t from-gb-ligh/80t via-gb-light/30 to-transparent" />
      </div>

      {/* RPG Scene Container - fixed height so choice menu doesn't push dialogue */}
      <div className="w-full max-w-4xl z-10">

        {/* The Dialogue Box — click to skip typing animation */}
        <div
          className="relative border-4 border-gb-deep bg-gb-light p-6 md:p-8 shadow-[8px_8px_0px_var(--color-gb-deep)] min-h-45 cursor-pointer"
          onClick={() => {
            if (isTyping) {
              setDisplayedText(fullText);
              setIsTyping(false);
            }
          }}
        >
          {/* Name Tag */}
          <div className="absolute -top-6 left-4 bg-gb-deep text-gb-light px-4 py-1 border-2 border-gb-deep font-press-start-2p text-sm">
            MANTLEAGENTS
          </div>

          <p className="font-vt323 text-2xl md:text-3xl leading-relaxed text-gb-deep">
            {displayedText}
            {isTyping && <span className="animate-pulse">_</span>}
          </p>
        </div>

        {/* The Choice Menu - absolute positioned so it doesn't shift dialogue */}
        <div
          className={`flex justify-end mt-4 transition-opacity duration-500 ${
            !isTyping ? 'opacity-100' : 'opacity-0 pointer-events-none'
          }`}
        >
          <div className="border-4 border-gb-deep bg-gb-light p-4 shadow-[8px_8px_0px_var(--color-gb-deep)] w-72">
            <ul className="flex flex-col gap-4 font-vt323 text-2xl">
              <li>
                <ConnectCTA
                  variant="ghost"
                  className="w-full justify-start text-2xl hover:bg-gb-mid hover:text-gb-deep px-2 py-6 border-2 border-transparent hover:border-gb-deep transition-none"
                >
                  <span className="mr-2 opacity-0 group-hover:opacity-100">&gt;</span> YES
                </ConnectCTA>
              </li>
              <li>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}

