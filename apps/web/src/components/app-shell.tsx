"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Folder, Settings, Users, type LucideIcon } from "lucide-react";
import { BrandMark } from "@/components/brand";
import { AccountMenu, type AccountUser } from "@/components/account-menu";
import { CryptoSessionProvider } from "@/components/crypto-session-provider";
import { ThemeToggle } from "@/components/theme-toggle";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  matchPrefixes: string[];
}

// Single source of truth for top-level sections: the desktop rail and the
// mobile tab bar both render this list. Add a section = add an entry (+ its page).
const NAV_ITEMS: NavItem[] = [
  { label: "Projects", href: "/dashboard", icon: Folder, matchPrefixes: ["/dashboard", "/projects"] },
  { label: "Teams", href: "/teams", icon: Users, matchPrefixes: ["/teams"] },
  { label: "Settings", href: "/settings/security", icon: Settings, matchPrefixes: ["/settings"] },
];

function isActive(pathname: string, prefixes: string[]): boolean {
  return prefixes.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

/**
 * The signed-in frame: a slim icon rail on a warm canvas, and the page in one
 * floating panel beside it. Three sections don't need a sidebar's width or a
 * collapse control, so the rail is all there is. On phones the rail becomes a
 * bottom tab bar, where a thumb reaches it.
 */
export function AppShell({ user, children }: { user: AccountUser; children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <CryptoSessionProvider>
      <TooltipProvider>
        <div data-app-shell className="flex min-h-dvh bg-canvas">
          <nav
            aria-label="Main"
            className="sticky top-0 hidden h-dvh w-[76px] shrink-0 flex-col items-center gap-6 py-5 md:flex"
          >
            <Link href="/dashboard" aria-label="EnvHQ home" className="rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <BrandMark className="size-10 rounded-xl" />
            </Link>
            <ul className="flex flex-1 flex-col items-center gap-2 pt-4">
              {NAV_ITEMS.map((item) => (
                <li key={item.href}>
                  <RailLink item={item} active={isActive(pathname, item.matchPrefixes)} />
                </li>
              ))}
            </ul>
            <div className="flex flex-col items-center gap-3">
              <ThemeToggle />
              <AccountMenu user={user} side="right" align="end" />
            </div>
          </nav>

          <div className="flex min-w-0 flex-1 flex-col pb-[calc(4.5rem+env(safe-area-inset-bottom))] md:py-3 md:pr-3 md:pb-3">
            <header className="flex h-14 items-center justify-between gap-2 px-4 md:hidden">
              <Link href="/dashboard" aria-label="EnvHQ home" className="flex items-center gap-2">
                <BrandMark className="size-8 rounded-lg" />
                <span className="font-semibold tracking-tight">
                  env<span className="text-brand">HQ</span>
                </span>
              </Link>
              <div className="flex items-center gap-1">
                <ThemeToggle />
                <AccountMenu user={user} side="bottom" align="end" />
              </div>
            </header>
            <main className="flex-1 bg-background ring-foreground/[0.05] max-md:rounded-t-[28px] max-md:shadow-soft md:rounded-[28px] md:shadow-soft md:ring-1">
              <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-8 sm:py-9 lg:px-10">{children}</div>
            </main>
          </div>

          <nav
            aria-label="Main"
            className="translucent-chrome fixed inset-x-0 bottom-0 z-30 flex justify-around border-t bg-background/85 px-2 pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] backdrop-blur md:hidden"
          >
            {NAV_ITEMS.map((item) => {
              const active = isActive(pathname, item.matchPrefixes);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex min-w-20 flex-col items-center gap-1 rounded-xl px-3 py-1.5 text-[11px] font-medium transition-colors",
                    active ? "text-foreground" : "text-muted-foreground",
                  )}
                >
                  <span
                    className={cn(
                      "flex h-7 w-12 items-center justify-center rounded-full transition-colors",
                      active && "bg-foreground text-background",
                    )}
                  >
                    <Icon className="size-4" />
                  </span>
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </TooltipProvider>
    </CryptoSessionProvider>
  );
}

function RailLink({ item, active }: { item: NavItem; active: boolean }) {
  const Icon = item.icon;
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Link
            href={item.href}
            aria-label={item.label}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex size-11 items-center justify-center rounded-xl outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
              active
                ? "bg-foreground text-background shadow-soft"
                : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
            )}
          />
        }
      >
        <Icon className="size-[18px]" />
      </TooltipTrigger>
      <TooltipContent side="right" sideOffset={8}>
        {item.label}
      </TooltipContent>
    </Tooltip>
  );
}
