import Link from "next/link";
import { BrandMark } from "@/components/brand";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Not found" };

/**
 * One page for "doesn't exist" and "you can't see it": the access rules
 * answer both with a 404 on purpose (CLAUDE.md, "undefined means 404"), so
 * this mustn't hint at which. Static: no session read, so it stays off the
 * function path for every mistyped URL.
 */
export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 px-6 text-center">
      <Link href="/" aria-label="EnvHQ home" className="flex items-center gap-2">
        <BrandMark className="size-8" />
        <span className="font-semibold tracking-tight">
          env<span className="text-brand">HQ</span>
        </span>
      </Link>
      <div className="flex flex-col gap-2">
        <p className="font-mono text-sm text-muted-foreground">404</p>
        <h1 className="text-2xl font-semibold tracking-tight">Nothing here</h1>
        <p className="max-w-sm text-sm text-muted-foreground">
          This page doesn&rsquo;t exist, or it isn&rsquo;t shared with you.
        </p>
      </div>
      <div className="flex gap-2">
        <Button render={<Link href="/dashboard" />} nativeButton={false}>
          Your projects
        </Button>
        <Button variant="outline" render={<Link href="/docs" />} nativeButton={false}>
          Docs
        </Button>
      </div>
    </main>
  );
}
