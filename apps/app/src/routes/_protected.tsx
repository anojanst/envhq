import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { AppShell } from "../components/app-shell";

/**
 * Client-side equivalent of today's Next `middleware.ts` + per-page
 * `auth()` redirect checks. By the time any route's `beforeLoad` runs here,
 * main.tsx has already waited for Clerk's `isLoaded` to be true before
 * mounting `<RouterProvider>` at all (see `InnerApp` in main.tsx), so
 * `context.auth.isSignedIn` is always trustworthy — no separate
 * `isLoaded` check is needed here.
 */
export const Route = createFileRoute("/_protected")({
  beforeLoad: ({ context }) => {
    if (!context.auth.isSignedIn) {
      throw redirect({ to: "/sign-in" });
    }
  },
  component: () => (
    <AppShell defaultOpen={getSidebarDefaultOpen()}>
      <Outlet />
    </AppShell>
  ),
});

/**
 * Client-side equivalent of Next's server-side `cookies()` read for
 * `sidebar_state` (see apps/web's `(app)/layout.tsx`) — there's no server
 * here, so read the cookie directly. No SSR-flash concern: the whole SPA
 * mounts at once, there's no server-rendered markup to mismatch against.
 */
function getSidebarDefaultOpen(): boolean {
  const match = document.cookie.match(/(?:^|;\s*)sidebar_state=([^;]*)/);
  return match ? match[1] !== "false" : true;
}
