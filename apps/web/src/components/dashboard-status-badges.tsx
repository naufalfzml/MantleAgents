'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import { StatusBadge } from '@/components/status-badge';

interface SystemStatusResponse {
  realClawConfigured: boolean;
  network: 'testnet' | 'mainnet';
}

export function DashboardStatusBadges() {
  const { data } = useQuery({
    queryKey: ['system', 'status'],
    queryFn: () => api.get<SystemStatusResponse>('/api/system/status'),
    staleTime: 5 * 60 * 1000,
  });

  return (
    <StatusBadge
      realClawConfigured={data?.realClawConfigured ?? false}
      custodyLabel="Non-custodial via Privy/RealClaw"
    />
  );
}
