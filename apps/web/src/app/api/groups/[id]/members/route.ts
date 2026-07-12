import { getUserId } from "@/lib/auth";
import { resolveRequestedOrgId, getClerkOrgRole } from "@/lib/orgs";
import { getGroup, listGroupMembers, addGroupMember } from "@/lib/groups";
import { json, badRequest, unauthorized, tokenExpired, notFound, forbidden } from "@/lib/api";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: Params) {
  const { userId, expired, orgId: activeOrgId } = await getUserId(req);
  if (expired) return tokenExpired();
  if (!userId) return unauthorized();

  const orgId = await resolveRequestedOrgId(userId, activeOrgId);
  if (!orgId || (await getClerkOrgRole(userId, orgId)) !== "admin") return forbidden();

  const { id } = await params;
  const group = await getGroup(orgId, id);
  if (!group) return notFound("Group not found");

  const members = await listGroupMembers(id);
  return json({ members });
}

export async function POST(req: Request, { params }: Params) {
  const { userId, expired, orgId: activeOrgId } = await getUserId(req);
  if (expired) return tokenExpired();
  if (!userId) return unauthorized();

  const orgId = await resolveRequestedOrgId(userId, activeOrgId);
  if (!orgId || (await getClerkOrgRole(userId, orgId)) !== "admin") return forbidden();

  const { id } = await params;
  const group = await getGroup(orgId, id);
  if (!group) return notFound("Group not found");

  const body = await req.json().catch(() => null);
  const memberUserId = typeof body?.userId === "string" ? body.userId.trim() : "";
  if (!memberUserId) return badRequest("userId is required");

  const memberRole = await getClerkOrgRole(memberUserId, orgId);
  if (!memberRole) return badRequest("That user isn't a member of this org");

  await addGroupMember(id, memberUserId);
  const members = await listGroupMembers(id);
  return json({ members }, 201);
}
