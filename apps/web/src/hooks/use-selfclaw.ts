import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import { useAuth } from '@/providers/auth-provider';
import type { SelfClawVerification } from '@mantleagents/shared';

export interface StartVerificationResponse {
  sessionId: string;
  qrCodeUrl: string;
  agentName: string;
}

export interface PollVerificationResponse {
  status: 'pending' | 'verified' | 'expired';
  verified: boolean;
  agentName?: string;
  humanId?: string;
  verifiedAt?: string;
}

export const selfclawKeys = {
  all: ['selfclaw'] as const,
  status: () => [...selfclawKeys.all, 'status'] as const,
  poll: (sessionId: string | null) =>
    [...selfclawKeys.all, 'poll', sessionId] as const,
};

export function useSelfClawStatus() {
  const { isAuthenticated } = useAuth();
  return useQuery({
    queryKey: selfclawKeys.status(),
    queryFn: () => api.get<SelfClawVerification>('/api/selfclaw/status'),
    enabled: isAuthenticated,
  });
}

export function useStartVerification() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (agentName: string) =>
      api.post<StartVerificationResponse>('/api/selfclaw/start', { agentName }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: selfclawKeys.status() });
    },
  });
}

export function usePollVerification(sessionId: string | null) {
  const { isAuthenticated } = useAuth();
  return useQuery({
    queryKey: selfclawKeys.poll(sessionId),
    queryFn: () => api.get<PollVerificationResponse>('/api/selfclaw/poll'),
    enabled: isAuthenticated && !!sessionId,
    refetchInterval: (query) => {
      const data = query.state.data as PollVerificationResponse | undefined;
      if (data?.status === 'verified' || data?.status === 'expired') {
        return false;
      }
      return 5000;
    },
  });
}
