'use client';

import { useCallback, useState } from 'react';
import { useConnect, useSignMessage, useAccount, type Connector } from 'wagmi';
import { generatePayload, login } from '@/lib/auth';
import { useAuth } from '@/providers/auth-provider';

interface SiwePayload {
  message: string;
  address: string;
  nonce: string;
}

export function useSiweAuth() {
  const { connectors, connectAsync } = useConnect();
  const { signMessageAsync } = useSignMessage();
  const { handleLogin } = useAuth();
  const { address: connectedAddress, isConnected, chainId: accountChainId } = useAccount();
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const signIn = useCallback(
    async (connector: Connector) => {
      setIsPending(true);
      setError(null);
      try {
        let address: string;
        let chainId: number | undefined;

        if (isConnected && connectedAddress) {
          // Wallet already connected — use the account's current chain ID
          address = connectedAddress;
          chainId = accountChainId;
        } else {
          // connectAsync returns the actual chainId at connection time (more reliable than hook state)
          const result = await connectAsync({ connector });
          address = result.accounts[0];
          chainId = result.chainId;
          if (!address) throw new Error('No account returned from wallet');
        }

        const payload = (await generatePayload({ address, chainId })) as SiwePayload;
        const signature = await signMessageAsync({
          account: address as `0x${string}`,
          message: payload.message,
        });

        const jwt = await login({ payload, signature });
        await handleLogin(jwt, payload.address);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Connection failed';
        setError(msg);
        const { toast } = await import('sonner');
        toast.error(msg);
      } finally {
        setIsPending(false);
      }
    },
    [connectAsync, signMessageAsync, handleLogin, isConnected, connectedAddress, accountChainId],
  );

  return { connectors, signIn, isPending, error };
}
