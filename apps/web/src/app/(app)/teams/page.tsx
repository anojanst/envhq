import { requireSessionUserId } from "@/lib/identity";
import { getOrCreatePersonalOrg, listMyOrgs, listOrgMembers } from "@/lib/orgs";
import { readOrg } from "@/lib/org-store";
import { listPendingInvites } from "@/lib/org-admin";
import { describeMembers } from "@/lib/user-profiles";
import { OrgPicker } from "@/components/org-picker";
import { PageHeader } from "@/components/page-header";
import { NewTeamButton, TeamManager } from "./team-manager";

/**
 * EnvHQ's own team management (self-hosting phase 4) — orgs live only in
 * Postgres and change only through `lib/org-admin.ts`, whatever identity
 * provider signed the user in. `?org=` picks the org; without it, the first
 * team the user belongs to, else their personal workspace.
 */
export default async function TeamsPage({ searchParams }: { searchParams: Promise<{ org?: string }> }) {
  const userId = await requireSessionUserId();
  const personalOrgId = await getOrCreatePersonalOrg(userId);
  const memberships = await listMyOrgs(userId);

  const { org: requested } = await searchParams;
  const selected =
    memberships.find((m) => m.id === requested) ??
    memberships.find((m) => m.id !== personalOrgId) ??
    memberships.find((m) => m.id === personalOrgId);

  const org = selected ? await readOrg(selected.id) : null;
  const isAdmin = selected?.role === "admin";
  const members = org ? await listOrgMembers(org.id) : [];
  const described = await describeMembers(members);
  const invites = org && isAdmin && !org.personal ? await listPendingInvites(org.id) : [];

  const pickerOrgs = memberships.map((m) => ({ id: m.id, name: m.id === personalOrgId ? "Personal" : m.name }));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Teams"
        description="Who you share projects with. Team admins can manage every project in the team."
        actions={
          <>
            {selected ? <OrgPicker orgs={pickerOrgs} value={selected.id} /> : null}
            <NewTeamButton />
          </>
        }
      />

      {org && selected ? (
        <TeamManager
          key={org.id}
          org={{ id: org.id, name: org.name, personal: org.personal }}
          role={selected.role}
          currentUserId={userId}
          members={described.map((d, i) => ({ ...d, role: members[i]!.role }))}
          invites={invites.map((i) => ({
            id: i.id,
            role: i.role,
            createdAt: i.createdAt.toISOString(),
            expiresAt: i.expiresAt.toISOString(),
          }))}
          isAdmin={isAdmin}
        />
      ) : (
        <p className="rounded-lg border border-dashed py-10 text-center text-sm text-muted-foreground">
          You&rsquo;re not in any team yet.
        </p>
      )}
    </div>
  );
}
