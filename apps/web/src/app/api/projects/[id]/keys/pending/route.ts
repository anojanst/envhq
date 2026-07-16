import { getUserId } from "@/lib/auth";
import { getAccessibleProject, listAccessibleUserIds } from "@/lib/access";
import { getProjectKeyUserIds } from "@/lib/project-keys";
import { getUserKeysBatch } from "@/lib/user-keys";
import { json, unauthorized, tokenExpired, notFound } from "@/lib/api";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

/**
 * Users authorized for this project (per `access_grants` / Clerk org role)
 * who don't yet hold a `project_keys` wrap, along with their public key so
 * a client already holding the DEK can seal a copy for them (M6 PR6). Only
 * lists those who've completed ZK onboarding (have a public key to seal
 * to) — anyone else simply reappears here once they do.
 */
export async function GET(req: Request, { params }: Params) {
  const { userId, expired, scope } = await getUserId(req);
  if (expired) return tokenExpired();
  if (!userId) return unauthorized();
  const { id } = await params;

  const owned = await getAccessibleProject(userId, id, "viewer", scope);
  if (!owned) return notFound("Project not found");

  const [accessibleUserIds, haveKeys] = await Promise.all([
    listAccessibleUserIds(owned.project.orgId, id),
    getProjectKeyUserIds(id),
  ]);
  const pendingIds = accessibleUserIds.filter((uid) => !haveKeys.has(uid));
  const publicKeys = await getUserKeysBatch(pendingIds);

  const pending = pendingIds
    .filter((uid) => publicKeys[uid])
    .map((uid) => ({ userId: uid, publicKey: publicKeys[uid]!.publicKey }));

  return json({ pending });
}
