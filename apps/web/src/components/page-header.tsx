import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export interface Crumb {
  label: string;
  href?: string;
}

/**
 * The one page-header shape in the app: optional breadcrumb, a title (with
 * an optional leading visual), one line of context, and the page's actions
 * on the right. Every page uses it, so the eye always finds the same things
 * in the same place.
 */
export function PageHeader({
  crumbs,
  title,
  leading,
  description,
  actions,
  className,
  children,
}: {
  crumbs?: Crumb[];
  title: React.ReactNode;
  leading?: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
  /** Rendered under the title row, full width: tabs, a filter bar. */
  children?: React.ReactNode;
}) {
  return (
    <header className={cn("flex flex-col gap-4", className)}>
      {crumbs && crumbs.length > 0 && (
        <nav aria-label="Breadcrumb" className="-mb-1">
          <ol className="flex flex-wrap items-center gap-1 text-sm text-muted-foreground">
            {crumbs.map((c, i) => (
              <li key={`${c.label}-${i}`} className="flex items-center gap-1">
                {c.href ? (
                  <Link href={c.href} className="rounded-sm hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring">
                    {c.label}
                  </Link>
                ) : (
                  <span aria-current="page" className="text-foreground">
                    {c.label}
                  </span>
                )}
                {i < crumbs.length - 1 && <ChevronRight className="size-3.5 opacity-60" aria-hidden />}
              </li>
            ))}
          </ol>
        </nav>
      )}
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <div className="flex min-w-0 items-center gap-3">
          {leading}
          <div className="flex min-w-0 flex-col gap-1">
            <h1 className="truncate text-xl font-semibold tracking-tight sm:text-2xl">{title}</h1>
            {description && <p className="max-w-2xl text-sm text-muted-foreground">{description}</p>}
          </div>
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {children}
    </header>
  );
}

/** Underlined section tabs that sit under a `PageHeader`. Links, not buttons: each tab is a URL. */
export function HeaderTabs({
  tabs,
}: {
  tabs: { label: string; href: string; active: boolean; count?: number }[];
}) {
  return (
    <nav aria-label="Sections" className="-mb-px flex gap-1 overflow-x-auto border-b">
      {tabs.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          aria-current={t.active ? "page" : undefined}
          className={cn(
            "flex shrink-0 items-center gap-1.5 border-b-2 px-3 pb-2.5 text-sm font-medium transition-colors outline-none focus-visible:text-foreground",
            t.active
              ? "border-brand text-foreground"
              : "border-transparent text-muted-foreground hover:border-border hover:text-foreground",
          )}
        >
          {t.label}
          {t.count !== undefined && (
            <span className="rounded-full bg-muted px-1.5 text-xs text-muted-foreground tabular-nums">{t.count}</span>
          )}
        </Link>
      ))}
    </nav>
  );
}
