'use client';

import { AuthGuard } from '@/components/auth-guard';
import { DashboardStatusBadges } from '@/components/dashboard-status-badges';
import { PageTransition } from '@/components/page-transition';
import { TerminalNavbar } from '@/components/terminal-navbar';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard requireOnboarded={true}>
      <div className="flex flex-col overflow-hidden bg-gb-light">
        <TerminalNavbar />
        <div className="shrink-0 border-b-2 border-gb-deep bg-gb-mid/30 px-4 py-2">
          <div className="mx-auto flex w-full max-w-6xl justify-end">
            <DashboardStatusBadges />
          </div>
        </div>
        <main className="w-full flex-1 overflow-y-auto overflow-x-hidden relative">
          <div className="mx-auto w-full max-w-6xl px-4 py-6 md:px-6 md:py-8">
            <PageTransition>{children}</PageTransition>
          </div>
          <div className="flex justify-center pb-4">
            <a
              href="https://ave.ai"
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 font-vt323 text-base text-gb-dark/60 uppercase transition-colors hover:text-gb-deep"
            >
              Powered by AI
            </a>
          </div>
        </main>
      </div>
    </AuthGuard>
  );
}
