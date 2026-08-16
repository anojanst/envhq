import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_protected/projects/$id/")({
  component: () => (
    <p className="text-sm text-muted-foreground">
      Stub — project overview and environment list ported in HQ-61.
    </p>
  ),
});
