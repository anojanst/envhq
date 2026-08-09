import { getUserId } from "@/lib/auth";
import { getAccessibleProject, listAccessibleUserIds } from "@/lib/access";
import { getUserKeysBatch } from "@/lib/user-keys";
import { json, unauthorized, tokenExpired, notFound } from "@/lib/api";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

/**
 * Every user currently authorized for this project, with their public key —
 * the exact "who to wrap the new DEK for" list a DEK rotation's finalize
 * step needs. Unlike `/keys/pending`, this isn't filtered to those missing a
 * wrap; a rotation replaces *every* member's wrap regardless of whether they
 * already had one. Admin-only, since only the rotation flow calls this.
 */
export async function GET(req: Request, { params }: Params) {
  const { userId, expired, scope } = await getUserId(req);
  if (expired) return tokenExpired();
  if (!userId) return unauthorized();
  const { id } = await params;

  const owned = await getAccessibleProject(userId, id, "admin", scope);
  if (!owned) return notFound("Project not found");

  const accessibleUserIds = await listAccessibleUserIds(owned.project.orgId, id);
  const publicKeys = await getUserKeysBatch(accessibleUserIds);

  const members = accessibleUserIds
    .filter((uid) => publicKeys[uid])
    .map((uid) => ({ userId: uid, publicKey: publicKeys[uid]!.publicKey }));

  return json({ members, totalAccessible: accessibleUserIds.length });
}
