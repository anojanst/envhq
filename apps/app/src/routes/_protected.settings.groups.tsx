import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

export const Route = createFileRoute("/_protected/settings/groups")({
  validateSearch: z.object({ org: z.string().optional() }),
  component: GroupsStub,
});

function GroupsStub() {
  const { org } = Route.useSearch();
  return (
    <p className="text-sm text-muted-foreground">
      Stub — group management ported in HQ-63. org={org ?? "(none selected)"}
    </p>
  );
}
