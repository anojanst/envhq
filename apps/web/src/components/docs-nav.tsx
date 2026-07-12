"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/docs", label: "Overview", exact: true },
  { href: "/docs/getting-started", label: "Getting started" },
  { href: "/docs/web-app", label: "Using the web app" },
  { href: "/docs/cli", label: "CLI reference" },
  { href: "/docs/security", label: "Security model" },
  { href: "/docs/limitations", label: "Limitations & FAQ" },
];

export function DocsNav() {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col gap-0.5">
      {NAV.map((item) => {
        const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm transition-colors",
              active
                ? "bg-brand/10 font-medium text-brand"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
