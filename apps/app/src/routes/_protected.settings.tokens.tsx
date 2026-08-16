import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_protected/settings/tokens")({
  component: () => (
    <p className="text-sm text-muted-foreground">
      Stub — CLI token management ported in HQ-63.
    </p>
  ),
});
