'use client';

import { useState, useMemo, useCallback, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDownUp, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'motion/react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { TokenLogo } from '@/components/token-logo';
import { api, ApiError } from '@/lib/api-client';
import { usePortfolio, portfolioKeys } from '@/hooks/use-portfolio';

const MANTLE_TOKENS = ['USDC', 'USDT', 'WMNT'] as const;

interface QuoteResponse {
  estimatedAmountOut: string;
  minimumAmountOut: string;
  exchangeRate: string;
  priceImpact: number;
}

interface SwapResponse {
  txHash: string;
  amountIn: string;
  amountOut: string;
  exchangeRate: string;
}

const AGENT_OPTIONS = [
  { value: 'fx', label: 'FX Agent' },
  { value: 'yield', label: 'Yield Agent' },
] as const;

export function SwapContent() {
  const queryClient = useQueryClient();
  const [agentType, setAgentType] = useState<'fx' | 'yield'>('fx');
  const { data: portfolio, isLoading: portfolioLoading } = usePortfolio(agentType);

  const [fromToken, setFromToken] = useState('USDC');
  const [toToken, setToToken] = useState('WMNT');
  const [amount, setAmount] = useState('');
  const [slippage] = useState(0.5);
  const [debouncedAmount, setDebouncedAmount] = useState('');

  // Debounce amount for quote fetching
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedAmount(amount), 500);
    return () => clearTimeout(timer);
  }, [amount]);

  const fromTokens = useMemo((): string[] => [...MANTLE_TOKENS], []);

  const toTokens = useMemo(
    (): string[] => MANTLE_TOKENS.filter((token) => token !== fromToken),
    [fromToken],
  );

  // Ensure toToken is valid when fromToken changes
  useEffect(() => {
    if (!toTokens.includes(toToken)) {
      setToToken(toTokens[0] ?? 'WMNT');
    }
  }, [toTokens, toToken]);

  const fromBalance = useMemo(() => {
    if (!portfolio) return null;
    const holding = portfolio.holdings.find((h) => h.tokenSymbol === fromToken);
    return holding?.balance ?? 0;
  }, [portfolio, fromToken]);

  // Fetch quote
  const shouldFetchQuote =
    debouncedAmount && !isNaN(Number(debouncedAmount)) && Number(debouncedAmount) > 0;

  const {
    data: quote,
    isLoading: quoteLoading,
    error: quoteError,
  } = useQuery({
    queryKey: ['swap-quote', fromToken, toToken, debouncedAmount, slippage],
    queryFn: () =>
      api.post<QuoteResponse>('/api/trade/quote', {
        from: fromToken,
        to: toToken,
        amount: debouncedAmount,
        slippage,
      }),
    enabled: !!shouldFetchQuote,
    retry: false,
    staleTime: 15_000,
  });

  // Execute swap mutation
  const swapMutation = useMutation({
    mutationFn: () =>
      api.post<SwapResponse>('/api/trade/swap', {
        from: fromToken,
        to: toToken,
        amount,
        slippage,
        agent_type: agentType,
      }),
    onSuccess: (data) => {
      toast.success('Swap executed', {
        description: `Swapped ${amount} ${fromToken} for ${toToken}`,
      });
      setAmount('');
      setDebouncedAmount('');
      queryClient.invalidateQueries({ queryKey: portfolioKeys.all });
      queryClient.invalidateQueries({ queryKey: ['timeline'] });
    },
    onError: (err) => {
      const desc =
        err instanceof ApiError && err.body && typeof err.body === 'object' && 'error' in err.body
          ? String((err.body as { error: unknown }).error)
          : err instanceof Error
            ? err.message
            : 'Swap failed';
      toast.error('Swap failed', { description: desc });
    },
  });

  const handleFlip = useCallback(() => {
    const prev = fromToken;
    setFromToken(toToken);
    setToToken(prev);
    setAmount('');
    setDebouncedAmount('');
  }, [fromToken, toToken]);

  const handleMax = useCallback(() => {
    if (fromBalance !== null && fromBalance > 0) {
      setAmount(String(fromBalance));
    }
  }, [fromBalance]);

  const canSwap =
    amount && Number(amount) > 0 && quote && !swapMutation.isPending;

  return (
    <div className="flex justify-center pt-4 md:pt-8">
      <div className="w-full max-w-md space-y-4">
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-lg font-semibold">Swap</h1>
          <Select
            value={agentType}
            onValueChange={(v) => setAgentType(v as 'fx' | 'yield')}
          >
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Agent wallet" />
            </SelectTrigger>
            <SelectContent>
              {AGENT_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="rounded-xl border bg-card p-5 space-y-3">
          {/* FROM */}
          <div className="rounded-lg bg-muted/50 p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">From</span>
              {fromBalance !== null && (
                <button
                  type="button"
                  onClick={handleMax}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                >
                  Balance: {fromBalance.toFixed(2)}{' '}
                  <span className="text-primary font-medium">MAX</span>
                </button>
              )}
              {portfolioLoading && <Skeleton className="h-3 w-20" />}
            </div>

            <div className="flex items-center gap-2">
              <Select value={fromToken} onValueChange={setFromToken}>
                <SelectTrigger className="w-[130px] shrink-0">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {fromTokens.map((t) => (
                    <SelectItem key={t} value={t}>
                      <TokenLogo symbol={t} size={18} className="mr-1 inline-block" /> {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Input
                type="text"
                inputMode="decimal"
                placeholder="0.00"
                value={amount}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === '' || /^\d*\.?\d*$/.test(v)) setAmount(v);
                }}
                className="text-right text-lg font-mono"
              />
            </div>
          </div>

          {/* Flip button */}
          <div className="flex justify-center -my-1">
            <Button
              variant="outline"
              size="icon"
              className="rounded-full size-8 cursor-pointer"
              onClick={handleFlip}
            >
              <ArrowDownUp className="size-4" />
            </Button>
          </div>

          {/* TO */}
          <div className="rounded-lg bg-muted/50 p-4 space-y-2">
            <span className="text-xs text-muted-foreground">To</span>

            <div className="flex items-center gap-2">
              <Select value={toToken} onValueChange={setToToken}>
                <SelectTrigger className="w-[130px] shrink-0">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {toTokens.map((t) => (
                    <SelectItem key={t} value={t}>
                      <TokenLogo symbol={t} size={18} className="mr-1 inline-block" /> {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <div className="flex-1 text-right text-lg font-mono text-muted-foreground px-3 py-2">
                {quoteLoading ? (
                  <Skeleton className="h-6 w-24 ml-auto" />
                ) : quote ? (
                  <AnimatePresence mode="wait">
                    <motion.span
                      key={quote.estimatedAmountOut}
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      transition={{ duration: 0.15 }}
                      className="block text-foreground"
                    >
                      {Number(quote.estimatedAmountOut).toFixed(4)}
                    </motion.span>
                  </AnimatePresence>
                ) : (
                  '0.00'
                )}
              </div>
            </div>
          </div>

          {/* Quote details */}
          <AnimatePresence>
            {quote && shouldFetchQuote && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <div className="rounded-lg border p-3 space-y-1.5 text-xs text-muted-foreground">
                  <div className="flex justify-between">
                    <span>Exchange Rate</span>
                    <span className="font-mono text-foreground">
                      1 {fromToken} = {Number(quote.exchangeRate).toFixed(4)} {toToken}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Min. Received</span>
                    <span className="font-mono">
                      {Number(quote.minimumAmountOut).toFixed(4)} {toToken}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Price Impact</span>
                    <span className="font-mono">
                      {quote.priceImpact < 0.01 ? '<0.01' : quote.priceImpact.toFixed(2)}%
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Slippage</span>
                    <span className="font-mono">{slippage}%</span>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Error */}
          {quoteError && shouldFetchQuote && (
            <p className="text-xs text-destructive px-1">
              {quoteError instanceof Error ? quoteError.message : 'Failed to get quote'}
            </p>
          )}

          {/* Swap button */}
          <Button
            className="w-full cursor-pointer"
            size="lg"
            disabled={!canSwap}
            onClick={() => swapMutation.mutate()}
          >
            {swapMutation.isPending ? (
              <>
                <Loader2 className="size-4 animate-spin mr-2" />
                Swapping...
              </>
            ) : !amount || Number(amount) <= 0 ? (
              'Enter an amount'
            ) : quoteLoading ? (
              'Fetching quote...'
            ) : quoteError ? (
              'Quote unavailable'
            ) : (
              `Swap ${fromToken} for ${toToken}`
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
