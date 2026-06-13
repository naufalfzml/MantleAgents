'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import dynamic from 'next/dynamic';
import { TrendingUp, Sprout, ArrowLeftRight, LayoutDashboard, MessageSquareText, Eye } from 'lucide-react';
import { Logo } from '@/components/logo';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar';
import { SidebarPortfolio } from '@/components/sidebar-portfolio';

const WalletConnect = dynamic(
  () => import('@/components/wallet-connect').then((m) => m.WalletConnect),
  { ssr: false },
);

// Menu items.
const items = [
  {
    title: 'Overview',
    url: '/overview',
    icon: LayoutDashboard,
  },
  {
    title: 'Agent Chat',
    url: '/agent-chat',
    icon: MessageSquareText,
  },
  {
    title: 'FX Agent',
    url: '/fx-agent',
    icon: TrendingUp,
  },
  {
    title: 'Yield Agent',
    url: '/yield-agent',
    icon: Sprout,
  },
  {
    title: 'Monitor',
    url: '/monitor',
    icon: Eye,
  },
  {
    title: 'Swap',
    url: '/swap',
    icon: ArrowLeftRight,
  },
];

export function AppSidebar() {
  const pathname = usePathname();
  const { setOpenMobile } = useSidebar();

  return (
    <Sidebar collapsible="offcanvas" className="border-r-4 border-gb-deep bg-gb-mid">
      <SidebarHeader className="border-b-4 border-gb-deep">
        <div className="flex items-center gap-2 px-2 py-2">
          <Link href="/overview" aria-label="MantleAgents home">
            <div className="group-data-[collapsible=icon]:hidden">
              <Logo size="sm" showWordmark={true} className="text-gb-deep" />
            </div>
            <div className="hidden group-data-[collapsible=icon]:block">
              <Logo size="sm" showWordmark={false} className="text-gb-deep" />
            </div>
          </Link>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <div className="border-b-4 border-gb-deep bg-gb-light">
          <SidebarPortfolio />
        </div>
        <SidebarGroup>
          <SidebarGroupLabel className="text-gb-deep font-press-start-2p uppercase pt-4">AI Agents</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => {
                const isActive = pathname.startsWith(item.url);
                return (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    asChild
                    isActive={isActive}
                    tooltip={item.title}
                    size="lg"
                    className={`h-12 border-2 rounded-none uppercase font-vt323 text-xl transition-none ${isActive ? 'bg-gb-deep text-gb-light border-gb-deep' : 'border-transparent text-gb-deep hover:border-gb-deep hover:bg-gb-light hover:shadow-[2px_2px_0px_var(--color-gb-deep)]'}`}
                  >
                    <Link
                      href={item.url}
                      onClick={() => setOpenMobile(false)}
                    >
                      <item.icon className="!size-5" />
                      <span>{isActive ? `> ${item.title} <` : item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )})}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="px-2 py-4 border-t-4 border-gb-deep bg-gb-mid">
        <div className="w-full [&>button]:w-full [&>button]:px-3">
          <WalletConnect />
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
