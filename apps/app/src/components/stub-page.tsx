import { Link } from "@tanstack/react-router";
import { useTheme } from "./theme-provider";

const NAV_LINKS = [
  { to: "/dashboard", label: "Dashboard" },
  { to: "/settings/tokens", label: "Settings" },
  { to: "/teams", label: "Teams" },
] as const;

/**
 * Minimal, visibly-placeholder chrome for verifying routing/auth/theme end
 * to end. Deliberately not shadcn/AppShell — the design system port is
 * HQ-60, downstream of this scaffold. The theme toggle here exists purely
 * to make "dark and light themes work" (acceptance criterion) checkable —
 * HQ-60 replaces it with a real one.
 */
export function StubPage({ title, note }: { title: string; note: string }) {
  const { theme, setTheme } = useTheme();

  return (
    <div className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 p-6">
      <nav className="flex items-center gap-4 border-b border-border pb-4 text-sm">
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
        <button
          type="button"
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          className="ml-auto rounded-md border border-input px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
        >
          {theme === "dark" ? "Light mode" : "Dark mode"}
        </button>
      </nav>
      <div>
        <h1 className="text-lg font-semibold">{title}</h1>
        <p className="text-sm text-muted-foreground">{note}</p>
      </div>
    </div>
  );
}
