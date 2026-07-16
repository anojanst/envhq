import { getUserId } from "@/lib/auth";
import { getClerkOrgRole } from "@/lib/orgs";
import { getGroupOrgId, removeGroupMember } from "@/lib/groups";
import { json, unauthorized, tokenExpired, notFound } from "@/lib/api";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string; userId: string }> };

export async function DELETE(req: Request, { params }: Params) {
  const { userId, expired } = await getUserId(req);
  if (expired) return tokenExpired();
  if (!userId) return unauthorized();

  const { id, userId: memberUserId } = await params;
  // The group's own org is the source of truth — not a session-level
  // "active org" (there is none now that the org switcher is gone).
  const orgId = await getGroupOrgId(id);
  if (!orgId || (await getClerkOrgRole(userId, orgId)) !== "admin") return notFound("Group not found");

  const removed = await removeGroupMember(id, memberUserId);
  if (!removed) return notFound("Member not found in this group");

  return json({ ok: true });
}
