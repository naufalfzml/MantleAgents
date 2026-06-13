import type { Metadata } from 'next';
import { pressStart2P, vt323 } from '@/lib/fonts';
import { Providers } from './providers';
import { Toaster } from '@/components/ui/sonner';
import './globals.css';

export const metadata: Metadata = {
  title: 'MantleAgents — Powered by AI',
  description: 'AI-Powered Multi-Chain Crypto Agents — Built on Automated DEX Aggregation',
  icons: {
    icon: '/mantleagents-polos.png',
    apple: '/mantleagents-polos.png',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`dark antialiased ${pressStart2P.variable} ${vt323.variable}`}
      suppressHydrationWarning
    >
      <body className="bg-gb-light text-gb-deep font-vt323 pixelated min-h-screen selection:bg-gb-deep selection:text-gb-light">
        <Providers>{children}</Providers>
        <Toaster />
      </body>
    </html>
  );
}
