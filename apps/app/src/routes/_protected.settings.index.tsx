import { createFileRoute, redirect } from "@tanstack/react-router";

// Today's Next app has no /settings index page at all (only the three tab
// pages) — this redirect is new, small UX improvement, not a straight port.
export const Route = createFileRoute("/_protected/settings/")({
  beforeLoad: () => {
    throw redirect({ to: "/settings/tokens" });
  },
});
