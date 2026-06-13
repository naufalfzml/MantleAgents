import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import { useAuth } from '@/providers/auth-provider';
import type { TimelineEventType, TradeDirection, Citation } from '@mantleagents/shared';

interface TimelineEntry {
  id: string;
  eventType: TimelineEventType;
  summary: string;
  detail: Record<string, unknown>;
  citations: Citation[];
  confidencePct: number | null;
  currency: string | null;
  amountUsd: number | null;
  direction: TradeDirection | null;
  txHash: string | null;
  runId: string | null;
  attestationId: string | null;
  attestationStatus: 'missing' | 'verified' | 'invalid';
  createdAt: string;
}

interface TimelineResponse {
  entries: TimelineEntry[];
  total: number;
  hasMore: boolean;
}

interface AttestationDecisionTrail {
  signal: {
    action: string | null;
    label: string | null;
    confidence: number | null;
    reasoning: string | null;
    raw: Record<string, unknown>;
  } | null;
  guardrail: {
    passed: boolean;
    summary: string;
    rule: string | null;
    raw: Record<string, unknown> | null;
  } | null;
  outcome: {
    status: 'executed' | 'failed' | 'skipped';
    summary: string;
    txHash: string | null;
    amountUsd: number | null;
    raw: Record<string, unknown> | null;
  } | null;
}

export interface AttestationEntry {
  id: string;
  walletAddress: string;
  agentType: 'fx' | 'yield';
  runId: string | null;
  payload: Record<string, unknown>;
  signature: string;
  algorithm: string;
  eventsHash: string | null;
  decisionHash: string | null;
  commitTxHash: string | null;
  commitTxExplorerUrl: string | null;
  decisionTrail?: AttestationDecisionTrail | null;
  isDevelopment: boolean;
  createdAt: string;
}

interface AttestationResponse {
  entries: AttestationEntry[];
  total: number;
  hasMore: boolean;
}

export interface TimelineFilters {
  type?: TimelineEventType;
  limit?: number;
  offset?: number;
}

export const timelineKeys = {
  all: ['timeline'] as const,
  list: (filters?: TimelineFilters) => [...timelineKeys.all, 'list', filters] as const,
  entry: (id: string) => [...timelineKeys.all, 'entry', id] as const,
  attestations: (limit?: number, offset?: number) =>
    [...timelineKeys.all, 'attestations', limit, offset] as const,
  attestation: (id: string) => [...timelineKeys.all, 'attestation', id] as const,
};

export function useTimeline(filters?: TimelineFilters) {
  const { isAuthenticated } = useAuth();
  return useQuery({
    queryKey: timelineKeys.list(filters),
    queryFn: () =>
      api.get<TimelineResponse>('/api/agent/timeline', {
        params: {
          type: filters?.type,
          limit: filters?.limit,
          offset: filters?.offset,
        },
      }),
    enabled: isAuthenticated,
  });
}

export function useTimelineEntry(id: string) {
  return useQuery({
    queryKey: timelineKeys.entry(id),
    queryFn: () => api.get<TimelineEntry>(`/api/agent/timeline/${id}`),
    enabled: !!id,
  });
}

export function useFxAttestations(limit = 20, offset = 0) {
  const { isAuthenticated } = useAuth();
  return useQuery({
    queryKey: timelineKeys.attestations(limit, offset),
    queryFn: () =>
      api.get<AttestationResponse>('/api/agent/attestations', {
        params: { limit, offset },
      }),
    enabled: isAuthenticated,
  });
}

export function useFxAttestation(id: string) {
  const { isAuthenticated } = useAuth();
  return useQuery({
    queryKey: timelineKeys.attestation(id),
    queryFn: () => api.get<AttestationEntry>(`/api/agent/attestations/${id}`),
    enabled: isAuthenticated && !!id,
  });
}
