import { clerkClient } from "@clerk/nextjs/server";
import { getUserId } from "@/lib/auth";
import { resolveRequestedOrgId, getClerkOrgRole } from "@/lib/orgs";
import { json, unauthorized, tokenExpired, forbidden } from "@/lib/api";

export const runtime = "nodejs";

// Org members picker source for the groups admin page — org-admin gated
// (same gate as the rest of the group-management routes), distinct from
// `api/projects/[id]/access/members` (PR2), which is project-scoped.
export async function GET(req: Request) {
  const { userId, expired, orgId: activeOrgId } = await getUserId(req);
  if (expired) return tokenExpired();
  if (!userId) return unauthorized();

  const orgId = await resolveRequestedOrgId(userId, activeOrgId);
  if (!orgId || (await getClerkOrgRole(userId, orgId)) !== "admin") return forbidden();

  const client = await clerkClient();
  const { data: memberships } = await client.organizations.getOrganizationMembershipList({
    organizationId: orgId,
  });

  const members = memberships
    .filter((m) => m.publicUserData)
    .map((m) => ({
      userId: m.publicUserData!.userId,
      name: m.publicUserData!.firstName || m.publicUserData!.identifier,
      email: m.publicUserData!.identifier,
      imageUrl: m.publicUserData!.imageUrl,
    }));

  return json({ members });
}
