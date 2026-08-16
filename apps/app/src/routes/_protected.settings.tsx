import { createFileRoute, Link, Outlet } from "@tanstack/react-router";

const TABS = [
  { to: "/settings/tokens", label: "Tokens" },
  { to: "/settings/groups", label: "Groups" },
  { to: "/settings/security", label: "Security" },
] as const;

export const Route = createFileRoute("/_protected/settings")({
  component: SettingsLayout,
});

function SettingsLayout() {
  return (
    <div className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 p-6">
      <nav className="flex gap-4 border-b border-border pb-4 text-sm">
        {TABS.map((tab) => (
          <Link
            key={tab.to}
            to={tab.to}
            className="text-muted-foreground hover:text-foreground"
            activeProps={{ className: "text-foreground font-medium" }}
          >
            {tab.label}
          </Link>
        ))}
      </nav>
      <Outlet />
    </div>
  );
}
