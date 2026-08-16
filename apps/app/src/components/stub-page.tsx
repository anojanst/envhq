import { Link } from "@tanstack/react-router";

const NAV_LINKS = [
  { to: "/dashboard", label: "Dashboard" },
  { to: "/settings/tokens", label: "Settings" },
  { to: "/teams", label: "Teams" },
] as const;

/**
 * Minimal, visibly-placeholder chrome for verifying routing/auth/theme end
 * to end. Deliberately not shadcn/AppShell — the design system port is
 * HQ-60, downstream of this scaffold.
 */
export function StubPage({ title, note }: { title: string; note: string }) {
  return (
    <div className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 p-6">
      <nav className="flex gap-4 border-b border-border pb-4 text-sm">
        {NAV_LINKS.map((link) => (
          <Link
            key={link.to}
            to={link.to}
            className="text-muted-foreground hover:text-foreground"
            activeProps={{ className: "text-foreground font-medium" }}
          >
            {link.label}
          </Link>
        ))}
      </nav>
      <div>
        <h1 className="text-lg font-semibold">{title}</h1>
        <p className="text-sm text-muted-foreground">{note}</p>
      </div>
    </div>
  );
}
