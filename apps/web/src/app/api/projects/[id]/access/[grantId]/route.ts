import { getUserId } from "@/lib/auth";
import { getAccessibleProject, isReadOnly } from "@/lib/access";
import { deleteGrant } from "@/lib/grants";
import { deleteProjectKeyForUser, deleteProjectKeysForGroupOnProject } from "@/lib/project-keys";
import { json, unauthorized, tokenExpired, notFound, forbidden } from "@/lib/api";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string; grantId: string }> };

// Revoke a direct user or group grant.
export async function DELETE(req: Request, { params }: Params) {
  const { userId, expired, scope } = await getUserId(req);
  if (expired) return tokenExpired();
  if (!userId) return unauthorized();
  if (isReadOnly(scope)) return forbidden("This token is read-only.");
  const { id, grantId } = await params;

  const owned = await getAccessibleProject(userId, id, "admin", scope);
  if (!owned) return notFound("Project not found");

  const deleted = await deleteGrant(id, grantId);
  if (!deleted) return notFound("Grant not found");

  // M6 PR6: revoking access also revokes decryption capability going
  // forward — best-effort, doesn't block the grant revocation itself.
  if (deleted.subjectType === "user") {
    await deleteProjectKeyForUser(id, deleted.subjectId);
  } else {
    await deleteProjectKeysForGroupOnProject(id, deleted.subjectId);
  }

  return json({ ok: true });
}
