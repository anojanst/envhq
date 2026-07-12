import { getUserId } from "@/lib/auth";
import { resolveRequestedOrgId, getClerkOrgRole } from "@/lib/orgs";
import { getGroup, removeGroupMember } from "@/lib/groups";
import { json, unauthorized, tokenExpired, notFound, forbidden } from "@/lib/api";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string; userId: string }> };

export async function DELETE(req: Request, { params }: Params) {
  const { userId, expired, orgId: activeOrgId } = await getUserId(req);
  if (expired) return tokenExpired();
  if (!userId) return unauthorized();

  const orgId = await resolveRequestedOrgId(userId, activeOrgId);
  if (!orgId || (await getClerkOrgRole(userId, orgId)) !== "admin") return forbidden();

  const { id, userId: memberUserId } = await params;
  const group = await getGroup(orgId, id);
  if (!group) return notFound("Group not found");

  const removed = await removeGroupMember(id, memberUserId);
  if (!removed) return notFound("Member not found in this group");

  return json({ ok: true });
}
