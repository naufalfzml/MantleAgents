'use client';

import { type ComponentProps, type ReactNode } from 'react';
import { useSiweAuth } from '@/hooks/use-siwe-auth';
import { Button } from '@/components/ui/button';

interface ConnectCTAProps extends Omit<ComponentProps<typeof Button>, 'onClick'> {
  children: ReactNode;
}

export function ConnectCTA({ children, ...buttonProps }: ConnectCTAProps) {
  const { connectors, signIn, isPending } = useSiweAuth();

  const handleClick = async () => {
    const connector = connectors[0];
    if (!connector) return;
    await signIn(connector);
  };

  return (
    <Button
      {...buttonProps}
      onClick={handleClick}
      disabled={isPending || buttonProps.disabled}
    >
      {isPending ? 'Connecting...' : children}
    </Button>
  );
}
