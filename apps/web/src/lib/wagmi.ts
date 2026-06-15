import { createConfig, http } from 'wagmi';
import { mantle, mantleSepoliaTestnet } from 'wagmi/chains';
import { metaMask } from 'wagmi/connectors';

function normalizeNetwork(network: string | undefined): 'mainnet' | 'testnet' {
  const value = network?.toLowerCase();
  return value === 'mainnet' || value === 'mantle' || value === 'mantle-mainnet'
    ? 'mainnet'
    : 'testnet';
}

const network = normalizeNetwork(process.env.NEXT_PUBLIC_MANTLE_NETWORK);
const chains =
  network === 'mainnet'
    ? ([mantle, mantleSepoliaTestnet] as const)
    : ([mantleSepoliaTestnet, mantle] as const);

export const wagmiConfig = createConfig({
  chains,
  connectors: [metaMask()],
  transports: {
    [mantle.id]: http(),
    [mantleSepoliaTestnet.id]: http(),
  },
  ssr: true,
});

declare module 'wagmi' {
  interface Register {
    config: typeof wagmiConfig;
  }
}
