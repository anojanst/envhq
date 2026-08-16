"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { UserButton } from "@clerk/nextjs";
import { Folder, Settings, Users, type LucideIcon } from "lucide-react";
import { Logo, Wordmark } from "@/components/brand";
import { CryptoSessionProvider } from "@/components/crypto-session-provider";
import { ThemeToggle } from "@/components/theme-toggle";
import { Badge } from "@/components/ui/badge";
import { TooltipProvider } from "@/components/ui/tooltip";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
} from "@/components/ui/sidebar";

interface NavItem {
  label: string;
  href?: string;
  icon: LucideIcon;
  matchPrefixes: string[];
  soon?: boolean;
}

// Single source of truth for top-level sections. Add a section = add an entry
// (+ its page). Flip `soon` off and give an `href` when it ships.
const NAV_ITEMS: NavItem[] = [
  {
    label: "Projects",
    href: "/dashboard",
    icon: Folder,
    matchPrefixes: ["/dashboard", "/projects"],
  },
  {
    label: "Settings",
    href: "/settings/tokens",
    icon: Settings,
    matchPrefixes: ["/settings"],
  },
  { label: "Teams", href: "/teams", icon: Users, matchPrefixes: ["/teams"] },
];

function isActive(pathname: string, prefixes: string[]): boolean {
  return prefixes.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

export function AppShell({
  defaultOpen,
  children,
}: {
  defaultOpen: boolean;
  children: React.ReactNode;
}) {
  return (
    <CryptoSessionProvider>
      <TooltipProvider>
        <SidebarProvider defaultOpen={defaultOpen}>
          <AppSidebar />
          <SidebarInset>
            {/* Sidebar is off-canvas on mobile (closed by default), so it needs
                an entry point outside itself there. Desktop collapses the
                sidebar in place instead, so its trigger lives in the sidebar
                header — no bar needed. */}
            <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b bg-background/80 px-4 backdrop-blur md:hidden">
              <SidebarTrigger />
              <Link href="/dashboard" aria-label="EnvHQ home">
                <Wordmark />
              </Link>
            </header>
            <div className="w-full flex-1 px-6 py-8">{children}</div>
          </SidebarInset>
        </SidebarProvider>
      </TooltipProvider>
    </CryptoSessionProvider>
  );
}

function AppSidebar() {
  const pathname = usePathname();

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <div className="flex items-center justify-between gap-2 px-1 py-1 group-data-[collapsible=icon]:flex-col-reverse group-data-[collapsible=icon]:gap-2">
          <Link href="/dashboard" aria-label="EnvHQ home" className="flex min-w-0 items-center">
            <Logo
              markClassName="size-7"
              wordmarkClassName="truncate text-base group-data-[collapsible=icon]:hidden"
            />
          </Link>
          <SidebarTrigger className="shrink-0" />
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarMenu>
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;

              if (item.soon || !item.href) {
                return (
                  <SidebarMenuItem key={item.label}>
                    <SidebarMenuButton
                      aria-disabled
                      tooltip={`${item.label} (soon)`}
                    >
                      <Icon />
                      <span>{item.label}</span>
                    </SidebarMenuButton>
                    <SidebarMenuBadge>
                      <Badge variant="secondary">Soon</Badge>
                    </SidebarMenuBadge>
                  </SidebarMenuItem>
                );
              }

              return (
                <SidebarMenuItem key={item.label}>
                  <SidebarMenuButton
                    isActive={isActive(pathname, item.matchPrefixes)}
                    tooltip={item.label}
                    render={<Link href={item.href} />}
                  >
                    <Icon />
                    <span>{item.label}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              );
            })}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <div className="flex items-center justify-between gap-2 px-1 group-data-[collapsible=icon]:flex-col-reverse group-data-[collapsible=icon]:gap-2">
          <UserButton />
          <ThemeToggle />
        </div>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  );
}
