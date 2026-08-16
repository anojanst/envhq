import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_protected/projects/$id/access")({
  component: () => (
    <p className="text-sm text-muted-foreground">
      Stub — access grant management ported in HQ-61/HQ-62.
    </p>
  ),
});
