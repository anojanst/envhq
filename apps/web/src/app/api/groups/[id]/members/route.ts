import { getUserId } from "@/lib/auth";
import { getClerkOrgRole } from "@/lib/orgs";
import { getGroupOrgId, listGroupMembers, addGroupMember } from "@/lib/groups";
import { json, badRequest, unauthorized, tokenExpired, notFound } from "@/lib/api";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: Params) {
  const { userId, expired } = await getUserId(req);
  if (expired) return tokenExpired();
  if (!userId) return unauthorized();

  const { id } = await params;
  // The group's own org is the source of truth — not a session-level
  // "active org" (there is none now that the org switcher is gone).
  const orgId = await getGroupOrgId(id);
  if (!orgId || (await getClerkOrgRole(userId, orgId)) !== "admin") return notFound("Group not found");

  const members = await listGroupMembers(id);
  return json({ members });
}

export async function POST(req: Request, { params }: Params) {
  const { userId, expired } = await getUserId(req);
  if (expired) return tokenExpired();
  if (!userId) return unauthorized();

  const { id } = await params;
  const orgId = await getGroupOrgId(id);
  if (!orgId || (await getClerkOrgRole(userId, orgId)) !== "admin") return notFound("Group not found");

  const body = await req.json().catch(() => null);
  const memberUserId = typeof body?.userId === "string" ? body.userId.trim() : "";
  if (!memberUserId) return badRequest("userId is required");

  const memberRole = await getClerkOrgRole(memberUserId, orgId);
  if (!memberRole) return badRequest("That user isn't a member of this org");

  await addGroupMember(id, memberUserId);
  const members = await listGroupMembers(id);
  return json({ members }, 201);
}
