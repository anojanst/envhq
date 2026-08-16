import { Link } from "@tanstack/react-router"
import { Logo } from "@/components/brand"

/**
 * Branded frame for the auth pages. Ported from apps/web unwired — it relies
 * on the `.public-dark` token scope (committed dark, matching the logged-out
 * marketing site), which isn't in apps/app's globals.css: that scope is
 * marketing-only and stays with the future apps/site, per ADR-005. Wiring
 * this into sign-in/sign-up now would either silently drop the dark
 * treatment or require pulling in out-of-scope tokens, so it's left ported
 * but unused until the SPA's auth-page treatment is decided.
 */
export function AuthShell({
  title,
  subtitle,
  children,
}: {
  title: string
  subtitle?: string
  children: React.ReactNode
}) {
  return (
    <main className="public-dark flex flex-1 flex-col bg-background text-foreground">
      <header className="flex items-center px-6 py-4">
        <Link to="/">
          <Logo />
        </Link>
      </header>

      <div className="flex flex-1 flex-col items-center justify-center gap-6 px-6 pb-16">
        <div className="flex flex-col items-center gap-1.5 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          {subtitle ? (
            <p className="max-w-sm text-sm text-muted-foreground text-pretty">
              {subtitle}
            </p>
          ) : null}
        </div>
        {children}
      </div>
    </main>
  )
}
