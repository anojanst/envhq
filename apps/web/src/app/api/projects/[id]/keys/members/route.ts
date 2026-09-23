import { getUserId } from "@/lib/auth";
import { getAccessibleProject, listAccessibleUserIds } from "@/lib/access";
import { getUserKeysBatch } from "@/lib/user-keys";
import { listActiveDeployKeysForRotation } from "@/lib/deploy-keys";
import { json, unauthorized, tokenExpired, notFound } from "@/lib/api";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

/**
 * Every subject currently authorized to hold this project's DEK, with the
 * public key to seal it to — the exact "who to wrap the new DEK for" list a
 * rotation's finalize step needs. Unlike `/keys/pending`, this isn't
 * filtered to those missing a wrap; a rotation replaces *every* wrap
 * regardless. Admin-only, since only the rotation flow calls this.
 *
 * `deployKeys` is returned separately from `members` (RM-11) rather than
 * merged into it: they are different kinds of subject with different
 * lifecycles, and the client shows them differently. Both must be sealed to,
 * or `finalizeRotation` rejects the submission — active deploy keys are part
 * of the expected wrap set (ADR-020), and a rotation that skipped them would
 * delete their wraps and break every pipeline on the project.
 */
export async function GET(req: Request, { params }: Params) {
  const { userId, expired, scope } = await getUserId(req);
  if (expired) return tokenExpired();
  if (!userId) return unauthorized();
  const { id } = await params;

  const owned = await getAccessibleProject(userId, id, "admin", scope);
  if (!owned) return notFound("Project not found");

  const accessibleUserIds = await listAccessibleUserIds(owned.project.orgId, id);
  const [publicKeys, deployKeys] = await Promise.all([
    getUserKeysBatch(accessibleUserIds),
    listActiveDeployKeysForRotation(id),
  ]);

  const members = accessibleUserIds
    .filter((uid) => publicKeys[uid])
    .map((uid) => ({ userId: uid, publicKey: publicKeys[uid]!.publicKey }));

  return json({ members, deployKeys, totalAccessible: accessibleUserIds.length });
}
