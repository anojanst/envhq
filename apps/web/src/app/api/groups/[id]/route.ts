import { getUserId } from "@/lib/auth";
import { resolveRequestedOrgId, getClerkOrgRole } from "@/lib/orgs";
import { deleteGroup } from "@/lib/groups";
import { json, unauthorized, tokenExpired, notFound, forbidden } from "@/lib/api";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

export async function DELETE(req: Request, { params }: Params) {
  const { userId, expired, orgId: activeOrgId } = await getUserId(req);
  if (expired) return tokenExpired();
  if (!userId) return unauthorized();

  const orgId = await resolveRequestedOrgId(userId, activeOrgId);
  if (!orgId || (await getClerkOrgRole(userId, orgId)) !== "admin") return forbidden();

  const { id } = await params;
  const deleted = await deleteGroup(orgId, id);
  if (!deleted) return notFound("Group not found");

  return json({ ok: true });
}
