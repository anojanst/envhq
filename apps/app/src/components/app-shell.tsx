import { Link, useLocation } from "@tanstack/react-router";
import { useUser } from "@clerk/clerk-react";
import { Folder, Settings, Users, type LucideIcon } from "lucide-react";
import { Logo, Wordmark } from "@/components/brand";
import { ThemeToggle } from "@/components/theme-toggle";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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

/**
 * Ported from apps/web's app-shell.tsx (HQ-60). Two deliberate differences
 * from the source, both scope calls for this ticket rather than oversights:
 * - No `CryptoSessionProvider` wrap — that's the data/crypto layer, not
 *   design system, and `@/lib/client`'s `api()` isn't ported to apps/app
 *   yet. Whichever page-porting ticket first needs real crypto wires it in.
 * - No Clerk `<UserButton>` — CLAUDE.md is explicit that Clerk's hosted UI
 *   components throw in this app. `UserBadge` below is a minimal stand-in
 *   (avatar + name, non-interactive); a full custom user menu is separate,
 *   future work.
 */
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
          {/* Sidebar is off-canvas on mobile (closed by default), so it needs
              an entry point outside itself there. Desktop collapses the
              sidebar in place instead, so its trigger lives in the sidebar
              header — no bar needed. */}
          <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b bg-background/80 px-4 backdrop-blur md:hidden">
            <SidebarTrigger />
            <Link to="/dashboard" aria-label="EnvHQ home">
              <Wordmark />
            </Link>
          </header>
          <div className="w-full flex-1 px-6 py-8">{children}</div>
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  );
}

function AppSidebar() {
  const pathname = useLocation({ select: (location) => location.pathname });

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <div className="flex items-center justify-between gap-2 px-1 py-1 group-data-[collapsible=icon]:flex-col-reverse group-data-[collapsible=icon]:gap-2">
          <Link to="/dashboard" aria-label="EnvHQ home" className="flex min-w-0 items-center">
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
                    render={<Link to={item.href} />}
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
          <UserBadge />
          <ThemeToggle />
        </div>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  );
}

/**
 * Stand-in for Clerk's hosted `<UserButton>` (unusable here, see module
 * comment) — avatar + name only, no sign-out/account menu yet.
 */
function UserBadge() {
  const { user } = useUser();
  const name = user?.fullName ?? user?.primaryEmailAddress?.emailAddress ?? "";
  const initial = name.charAt(0).toUpperCase();

  return (
    <div className="flex min-w-0 items-center gap-2 group-data-[collapsible=icon]:justify-center">
      <Avatar size="sm">
        <AvatarImage src={user?.imageUrl} alt="" />
        <AvatarFallback>{initial || "?"}</AvatarFallback>
      </Avatar>
      <span className="truncate text-sm text-foreground group-data-[collapsible=icon]:hidden">
        {name}
      </span>
    </div>
  );
}
