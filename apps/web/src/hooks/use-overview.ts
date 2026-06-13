import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { api } from '@/lib/api-client';
import type { MarketTokensResponse } from '@mantleagents/shared';

interface YieldOpportunityResponse {
  id: string;
  name: string;
  vaultAddress: string;
  protocol: string;
  apr: number;
  tvl: number;
  dailyRewards: number;
  tokens: Array<{ symbol: string; address: string; decimals: number; icon?: string }>;
  depositUrl?: string;
  type?: string;
  merklUrl?: string;
  status?: string;
}

export const overviewKeys = {
  all: ['overview'] as const,
  trendingFx: () => [...overviewKeys.all, 'trending-fx'] as const,
  yieldOpportunities: () => [...overviewKeys.all, 'yield-opportunities'] as const,
};

function hasAnyTokenNews(tokenNews?: Record<string, string>): boolean {
  if (!tokenNews || typeof tokenNews !== 'object') return false;
  return Object.values(tokenNews).some((v) => (v ?? '').trim().length > 0);
}

export interface OverviewTrendingFxAnalysis {
  detail?: {
    signals?: Array<{
      currency: string;
      direction: string;
      confidence: number;
      reasoning: string;
    }>;
    marketSummary?: string;
  };
  summary?: string;
}

export function useOverviewTrendingFx() {
  const triggerSentRef = useRef(false);

  const query = useQuery({
    queryKey: overviewKeys.trendingFx(),
    queryFn: () =>
      api.get<{
        tokens: MarketTokensResponse['tokens'];
        analysis: OverviewTrendingFxAnalysis | null;
        tokenNews?: Record<string, string>;
        updatedAt: string;
      }>('/api/overview/trending-fx'),
    staleTime: 60 * 60_000, // 1h - matches DB cache TTL
    refetchInterval: (q) => {
      const data = q.state.data;
      if (data?.analysis != null && hasAnyTokenNews(data.tokenNews)) return false;
      if (data?.tokens != null && data.tokens.length > 0) return 8_000;
      return false;
    },
  });

  useEffect(() => {
    if (triggerSentRef.current) return;
    const data = query.data;
    if (
      !query.isLoading &&
      data?.tokens != null &&
      data.tokens.length > 0 &&
      data.analysis == null
    ) {
      triggerSentRef.current = true;
      api
        .post<{ triggered: boolean }>('/api/overview/trigger-fx-analysis')
        .catch(() => {});
    }
  }, [query.isLoading, query.data]);

  return query;
}

export function useOverviewYieldOpportunities() {
  return useQuery({
    queryKey: overviewKeys.yieldOpportunities(),
    queryFn: () =>
      api.get<{
        opportunities: YieldOpportunityResponse[];
        updatedAt: string;
      }>('/api/overview/yield-opportunities'),
    staleTime: 60 * 60_000, // 1h - matches DB cache TTL
  });
}
