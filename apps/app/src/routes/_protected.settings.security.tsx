import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_protected/settings/security")({
  component: () => (
    <p className="text-sm text-muted-foreground">
      Stub — E2E encryption identity/passphrase management ported in HQ-63.
    </p>
  ),
});
