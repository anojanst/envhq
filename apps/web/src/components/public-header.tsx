"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Shared header for logged-out, public pages (landing, /terms, /docs/**).
 * Always links back home and offers sign-in/sign-up regardless of auth
 * state — these routes are reachable while signed out.
 *
 * The bar is a translucent layer that content scrolls under, with a soft
 * scroll edge below it instead of a hard 1px divider.
 */
export function PublicHeader() {
  const pathname = usePathname();
  const onDocs = pathname?.startsWith("/docs") ?? false;
  // The landing page commits to its own dark surface, so a theme toggle there
  // would be a control with nothing to act on.
  const onLanding = pathname === "/";

  return (
    <header className="sticky top-0 z-30">
      <div className="translucent-chrome bg-background/75 backdrop-blur-xl backdrop-saturate-150">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-4 px-6">
          <Link
            href="/"
            aria-label="EnvHQ home"
            className="rounded-lg outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <Logo />
          </Link>

          <nav className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              className={cn("hidden sm:inline-flex", onDocs && "bg-muted text-foreground")}
              aria-current={onDocs ? "page" : undefined}
              nativeButton={false}
              render={<Link href="/docs" />}
            >
              Docs
            </Button>
            <Button variant="ghost" nativeButton={false} render={<Link href="/sign-in" />}>
              Sign in
            </Button>
            <Button
              className={cn(onLanding && "notch focus-visible:ring-inset")}
              nativeButton={false}
              render={<Link href="/sign-up" />}
            >
              Start free
            </Button>
          </nav>
        </div>
      </div>

      {/* Scroll edge: a short fade where content passes under the bar. */}
      <div
        aria-hidden
        className="pointer-events-none h-4 bg-linear-to-b from-background/75 to-transparent"
      />
    </header>
  );
}
