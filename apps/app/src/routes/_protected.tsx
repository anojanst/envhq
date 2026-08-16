import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

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
  component: () => <Outlet />,
});
