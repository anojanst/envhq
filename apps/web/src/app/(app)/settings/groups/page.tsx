import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { resolveRequestedOrgId, listMyOrgs } from "@/lib/orgs";
import { listGroups } from "@/lib/groups";
import { OrgPicker } from "@/components/org-picker";
import { GroupsManager } from "./groups-manager";

export default async function GroupsPage({
  searchParams,
}: {
  searchParams: Promise<{ org?: string }>;
}) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const { org: requestedOrgId } = await searchParams;
  const orgs = await listMyOrgs(userId);
  // Falls back to the personal org if `?org=` is absent or names an org the
  // caller doesn't belong to — no session-level "active org" to prefer
  // anymore (the sidebar's org switcher is gone).
  const orgId = await resolveRequestedOrgId(userId, requestedOrgId);
  const groups = orgId ? await listGroups(orgId) : [];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Groups</h1>
          <p className="text-sm text-muted-foreground">
            Named sets of org members — a foundation for granting several people access at
            once (not wired into project sharing yet).
          </p>
        </div>
        {orgId ? <OrgPicker orgs={orgs} value={orgId} /> : null}
      </div>
      <GroupsManager
        orgId={orgId}
        initialGroups={groups.map((g) => ({ ...g, createdAt: g.createdAt.toISOString() }))}
      />
    </div>
  );
}
