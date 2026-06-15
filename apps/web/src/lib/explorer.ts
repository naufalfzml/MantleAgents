'use client';

import { useMemo } from 'react';

type MantleNetwork = 'mainnet' | 'testnet';

const EXPLORERS: Record<MantleNetwork, string> = {
  mainnet: 'https://explorer.mantle.xyz',
  testnet: 'https://sepolia.mantlescan.xyz',
};

function normalizeNetwork(network: string | undefined): MantleNetwork {
  const value = network?.toLowerCase();
  return value === 'mainnet' || value === 'mantle' || value === 'mantle-mainnet'
    ? 'mainnet'
    : 'testnet';
}

export function getExplorerTxUrl(txHash: string, network: string): string {
  const base = EXPLORERS[normalizeNetwork(network)];
  return `${base}/tx/${txHash}`;
}

const ERC8004_SCAN_BASE: Record<MantleNetwork, string> = {
  mainnet: 'https://www.8004scan.io/agents/mantle',
  testnet: 'https://testnet.8004scan.io/agents/mantle-sepolia',
};

export function get8004ScanUrl(agentId: number | string): string {
  const network = normalizeNetwork(process.env.NEXT_PUBLIC_MANTLE_NETWORK);
  return `${ERC8004_SCAN_BASE[network]}/${agentId}`;
}

export function useExplorerTxUrl(txHash: string | null): string | null {
  const network = process.env.NEXT_PUBLIC_MANTLE_NETWORK ?? 'testnet';

  return useMemo(() => {
    if (!txHash) return null;
    return getExplorerTxUrl(txHash, network);
  }, [network, txHash]);
}
