'use client';

import { useState, useEffect } from 'react';
import { X, Copy, Check, Coins } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { shortenAddress } from '@/lib/format';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'motion/react';
import { useMotionSafe } from '@/lib/motion';

const DEFAULT_DISMISS_KEY = 'mantleagents_funding_banner_dismissed';
const DEFAULT_MESSAGE = 'Fund your agent to start trading.';

interface FundingBannerProps {
  serverWalletAddress: string;
  message?: string;
  dismissKey?: string;
}

export function FundingBanner({
  serverWalletAddress,
  message = DEFAULT_MESSAGE,
  dismissKey = DEFAULT_DISMISS_KEY,
}: FundingBannerProps) {
  const m = useMotionSafe();
  const [dismissed, setDismissed] = useState(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem(dismissKey) === 'true';
  });
  const [copied, setCopied] = useState(false);

  function handleDismiss() {
    setDismissed(true);
    localStorage.setItem(dismissKey, 'true');
  }

  async function handleCopy() {
    await navigator.clipboard.writeText(serverWalletAddress);
    toast('Address copied!');
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <AnimatePresence>
      {!dismissed && (
        <motion.div
          initial={m.fadeIn.initial}
          animate={m.fadeIn.animate}
          exit={{ opacity: 0, y: -8 }}
          className="flex items-center gap-2 rounded-lg border border-border/60 bg-muted/30 px-3 py-2"
        >
          <Coins className="size-4 text-muted-foreground shrink-0" aria-hidden="true" />
          <p className="text-xs flex-1 text-muted-foreground">{message}</p>
          <Button
            variant="ghost"
            size="xs"
            className="font-mono"
            onClick={handleCopy}
          >
            {shortenAddress(serverWalletAddress)}
            {copied ? (
              <Check className="size-3 text-success" />
            ) : (
              <Copy className="size-3" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="icon-xs"
            className="ml-auto shrink-0"
            onClick={handleDismiss}
          >
            <X />
            <span className="sr-only">Dismiss</span>
          </Button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
