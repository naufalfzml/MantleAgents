import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import { useAuth } from '@/providers/auth-provider';
import type { RiskAnswers, RiskProfile } from '@mantleagents/shared';

interface RiskProfileResponse {
  display_name: string | null;
  risk_profile: RiskProfile | null;
  risk_answers: Record<string, unknown> | null;
  preferred_currencies: string[] | null;
  onboarding_completed: boolean;
}

interface SubmitRiskProfileResponse {
  profile: Record<string, unknown>;
  riskProfile: RiskProfile;
  score: number;
  serverWalletAddress: string | null;
}

export const userKeys = {
  all: ['user'] as const,
  riskProfile: () => [...userKeys.all, 'riskProfile'] as const,
};

export function useRiskProfile() {
  const { isAuthenticated } = useAuth();
  return useQuery({
    queryKey: userKeys.riskProfile(),
    queryFn: () => api.get<RiskProfileResponse>('/api/user/risk-profile'),
    enabled: isAuthenticated,
  });
}

export function useSubmitRiskProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (answers: RiskAnswers) =>
      api.post<SubmitRiskProfileResponse>('/api/user/risk-profile', answers),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: userKeys.riskProfile() });
    },
  });
}
