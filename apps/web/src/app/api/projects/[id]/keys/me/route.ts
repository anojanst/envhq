import { getUserId } from "@/lib/auth";
import { getAccessibleProject } from "@/lib/access";
import { getProjectKeyForUser, projectHasAnyKey } from "@/lib/project-keys";
import { json, unauthorized, tokenExpired, apiError } from "@/lib/api";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

/**
 * The caller's own wrapped DEK for a project. A 404 means either they
 * haven't completed ZK onboarding yet, they lack access, or (PR6) a wrap
 * hasn't been reconciled to them yet — the body's `anyKeyExists` lets the
 * client tell that last, real "someone else has the key" case apart from
 * `uninitialized` (nobody does yet, e.g. the project was created before its
 * creator ever unlocked a session — safe to self-heal, since no `env_vars`
 * could exist without a DEK to encrypt under).
 */
export async function GET(req: Request, { params }: Params) {
  const { userId, expired, scope } = await getUserId(req);
  if (expired) return tokenExpired();
  if (!userId) return unauthorized();
  const { id } = await params;

  const owned = await getAccessibleProject(userId, id, "viewer", scope);
  if (!owned) return apiError("Project not found", 404, "not_found");

  const key = await getProjectKeyForUser(id, userId);
  if (!key) {
    const anyKeyExists = await projectHasAnyKey(id);
    return json({ error: "No key registered for you on this project yet", code: "not_found", anyKeyExists }, 404);
  }

  return json({ wrappedDek: key.wrappedDek });
}
