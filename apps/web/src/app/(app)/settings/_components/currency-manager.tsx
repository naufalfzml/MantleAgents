'use client';

import { useMemo } from 'react';
import { STABLE_TOKENS, TOKEN_METADATA } from '@mantleagents/shared';
import { TokenLogo } from '@/components/token-logo';
import { cn } from '@/lib/utils';

interface CurrencyManagerProps {
  allowedCurrencies: string[];
  onAllowedChange: (currencies: string[]) => void;
}

export function CurrencyManager({
  allowedCurrencies,
  onAllowedChange,
}: CurrencyManagerProps) {
  const allSelected = useMemo(
    () => STABLE_TOKENS.every((t) => allowedCurrencies.includes(t)),
    [allowedCurrencies],
  );

  function toggleToken(token: string) {
    if (allowedCurrencies.includes(token)) {
      onAllowedChange(allowedCurrencies.filter((c) => c !== token));
    } else {
      onAllowedChange([...allowedCurrencies, token]);
    }
  }

  function toggleAll() {
    if (allSelected) {
      onAllowedChange([]);
    } else {
      onAllowedChange([...STABLE_TOKENS]);
    }
  }

  return (
    <div className="flex flex-wrap gap-2">
      {/* All toggle */}
      <button
        type="button"
        onClick={toggleAll}
        className={cn(
          'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors cursor-pointer',
          allSelected
            ? 'border-primary/50 bg-primary/15 text-primary'
            : 'border-border bg-transparent text-muted-foreground hover:text-foreground hover:border-foreground/30',
        )}
      >
        ALL
      </button>

      {STABLE_TOKENS.map((token) => {
        const isSelected = allowedCurrencies.includes(token);
        const meta = TOKEN_METADATA[token];
        return (
          <button
            key={token}
            type="button"
            onClick={() => toggleToken(token)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors cursor-pointer',
              isSelected
                ? 'border-primary/50 bg-primary/15 text-primary'
                : 'border-border bg-transparent text-muted-foreground hover:text-foreground hover:border-foreground/30',
            )}
          >
            <TokenLogo symbol={token} size={16} />
            <span>{token}</span>
            {meta?.name && (
              <span className="text-xs opacity-60 hidden sm:inline">
                {meta.name}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
