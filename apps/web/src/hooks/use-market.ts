import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import type { MarketTokensResponse } from '@mantleagents/shared';

export const marketKeys = {
  all: ['market'] as const,
  tokens: () => [...marketKeys.all, 'tokens'] as const,
};

export function useMarketTokens() {
  return useQuery({
    queryKey: marketKeys.tokens(),
    queryFn: () => api.get<MarketTokensResponse>('/api/market/tokens'),
    staleTime: 5 * 60_000,
  });
}
