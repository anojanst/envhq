import { getUserId } from "@/lib/auth";
import { getClerkOrgRole } from "@/lib/orgs";
import { deleteGroup, getGroupOrgId } from "@/lib/groups";
import { deleteProjectKeysForGroupEverywhere } from "@/lib/project-keys";
import { json, unauthorized, tokenExpired, notFound } from "@/lib/api";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

export async function DELETE(req: Request, { params }: Params) {
  const { userId, expired } = await getUserId(req);
  if (expired) return tokenExpired();
  if (!userId) return unauthorized();

  const { id } = await params;
  // The group's own org is the source of truth for which org to check the
  // caller's role against — not a session-level "active org." Doesn't-exist
  // and not-admin-of-its-org both 404 (not 403), same "don't reveal whether
  // it exists" convention as the project access layer.
  const orgId = await getGroupOrgId(id);
  if (!orgId || (await getClerkOrgRole(userId, orgId)) !== "admin") return notFound("Group not found");

  // M6 PR6: read members/grants and clean up project_keys *before* deleting
  // the group — deleteGroup cascades group_members away, and this needs
  // them to know whose wraps to drop.
  await deleteProjectKeysForGroupEverywhere(id);

  const deleted = await deleteGroup(orgId, id);
  if (!deleted) return notFound("Group not found");

  return json({ ok: true });
}
