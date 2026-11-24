import { requireSessionUserId } from "@/lib/identity";
import { getOrCreatePersonalOrg, resolveRequestedOrgId, listMyOrgs } from "@/lib/orgs";
import { listGroups } from "@/lib/groups";
import { OrgPicker } from "@/components/org-picker";
import { GroupsManager } from "./groups-manager";

export default async function GroupsPage({
  searchParams,
}: {
  searchParams: Promise<{ org?: string }>;
}) {
  const userId = await requireSessionUserId();

  const { org: requestedOrgId } = await searchParams;
  const personalOrgId = await getOrCreatePersonalOrg(userId);
  const orgs = (await listMyOrgs(userId)).map((o) => (o.id === personalOrgId ? { ...o, name: "Personal" } : o));
  // Falls back to the personal org if `?org=` is absent or names an org the
  // caller doesn't belong to — no session-level "active org" to prefer
  // anymore (the sidebar's org switcher is gone).
  const orgId = await resolveRequestedOrgId(userId, requestedOrgId);
  const groups = orgId ? await listGroups(orgId) : [];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <p className="max-w-2xl text-sm text-muted-foreground">
          A group is a named set of people in a team. Give a group a role on a project (its Access
          tab) and everyone in it gets that role.
        </p>
        {orgId ? <OrgPicker orgs={orgs} value={orgId} /> : null}
      </div>
      <GroupsManager
        orgId={orgId}
        initialGroups={groups.map((g) => ({ ...g, createdAt: g.createdAt.toISOString() }))}
      />
    </div>
  );
}
