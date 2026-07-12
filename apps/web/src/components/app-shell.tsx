"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { UserButton, OrganizationSwitcher } from "@clerk/nextjs";
import { Folder, Settings, Users, type LucideIcon } from "lucide-react";
import { BrandMark } from "@/components/brand";
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
    <TooltipProvider>
      <SidebarProvider defaultOpen={defaultOpen}>
        <AppSidebar />
        <SidebarInset>
          <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b bg-background/80 px-4 backdrop-blur">
            <SidebarTrigger />
            <Link href="/dashboard" aria-label="EnvHQ home" className="md:hidden">
              <span className="font-semibold tracking-tight">
                env<span className="text-brand">HQ</span>
              </span>
            </Link>
          </header>
          <div className="w-full flex-1 px-6 py-8">{children}</div>
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  );
}

function AppSidebar() {
  const pathname = usePathname();

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <Link
          href="/dashboard"
          aria-label="EnvHQ home"
          className="flex items-center gap-2 px-1 py-1"
        >
          <BrandMark className="shrink-0" />
          <span className="font-semibold tracking-tight group-data-[collapsible=icon]:hidden">
            env<span className="text-brand">HQ</span>
          </span>
        </Link>
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
        <div className="flex items-center gap-2 px-1 group-data-[collapsible=icon]:hidden">
          <OrganizationSwitcher
            hidePersonal
            afterSelectOrganizationUrl="/dashboard"
            organizationProfileUrl="/teams"
            organizationProfileMode="navigation"
          />
        </div>
        <div className="flex items-center justify-between gap-2 px-1 group-data-[collapsible=icon]:flex-col-reverse group-data-[collapsible=icon]:gap-2">
          <UserButton />
          <ThemeToggle />
        </div>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  );
}
