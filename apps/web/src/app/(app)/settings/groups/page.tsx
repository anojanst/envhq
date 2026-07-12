import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { resolveRequestedOrgId } from "@/lib/orgs";
import { listGroups } from "@/lib/groups";
import { GroupsManager } from "./groups-manager";

export default async function GroupsPage() {
  const { userId, orgId: activeOrgId } = await auth();
  if (!userId) redirect("/sign-in");

  // Prefer whichever org is active in the sidebar switcher (M5 PR4);
  // falls back to the personal org if none is active yet.
  const orgId = await resolveRequestedOrgId(userId, activeOrgId);
  const groups = orgId ? await listGroups(orgId) : [];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Groups</h1>
        <p className="text-sm text-muted-foreground">
          Named sets of org members — a foundation for granting several people access at
          once (not wired into project sharing yet).
        </p>
      </div>
      <GroupsManager
        initialGroups={groups.map((g) => ({ ...g, createdAt: g.createdAt.toISOString() }))}
      />
    </div>
  );
}
