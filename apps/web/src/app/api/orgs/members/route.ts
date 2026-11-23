import { getUserId } from "@/lib/auth";
import { resolveRequestedOrgId, getOrgRole, listOrgMembers } from "@/lib/orgs";
import { describeMembers } from "@/lib/user-profiles";
import { json, unauthorized, tokenExpired, forbidden } from "@/lib/api";

export const runtime = "nodejs";

// Org members picker source for the groups admin page — org-admin gated
// (same gate as the rest of the group-management routes), distinct from
// `api/projects/[id]/access/members` (PR2), which is project-scoped. Takes
// an explicit `?orgId=` (no session-level "active org" anymore — Settings >
// Groups sends its page-local `?org=` selection through explicitly).
export async function GET(req: Request) {
  const { userId, expired } = await getUserId(req);
  if (expired) return tokenExpired();
  if (!userId) return unauthorized();

  const requestedOrgId = new URL(req.url).searchParams.get("orgId");
  const orgId = await resolveRequestedOrgId(userId, requestedOrgId);
  if (!orgId || (await getOrgRole(userId, orgId)) !== "admin") return forbidden();

  const members = await describeMembers(await listOrgMembers(orgId));

  return json({ members });
}
