import Link from "next/link";
import { Logo } from "@/components/brand";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";

/**
 * Shared header for logged-out, public pages (landing, /terms, /docs/**).
 * Always links back home and offers sign-in/sign-up regardless of auth
 * state — these routes are reachable while signed out.
 */
export function PublicHeader() {
  return (
    <header className="flex items-center justify-between px-6 py-4 border-b">
      <Link href="/">
        <Logo />
      </Link>
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="sm" render={<Link href="/docs" />}>
          Docs
        </Button>
        <ThemeToggle />
        <Button variant="ghost" render={<Link href="/sign-in" />}>
          Sign in
        </Button>
        <Button render={<Link href="/sign-up" />}>Get started</Button>
      </div>
    </header>
  );
}
