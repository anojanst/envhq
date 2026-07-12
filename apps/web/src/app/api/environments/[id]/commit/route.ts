import type { EnvPair } from "@envhq/parser";
import { getUserId } from "@/lib/auth";
import { getAccessibleEnvironment, isReadOnly } from "@/lib/access";
import { upsertMany, deleteMany, listPairs } from "@/lib/env-store";
import { commitVersion } from "@/lib/version-store";
import { json, badRequest, unauthorized, tokenExpired, notFound, forbidden } from "@/lib/api";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

/**
 * Atomic three-way "commit" (M4): applies an upsert/delete batch and bumps
 * the environment's version via `commitVersion` (see version-store.ts for
 * the CAS + snapshot mechanics), or 409s with the live server state for the
 * keys involved if `baseVersion` is stale.
 */
export async function POST(req: Request, { params }: Params) {
  const { userId, expired, scope } = await getUserId(req);
  if (expired) return tokenExpired();
  if (!userId) return unauthorized();
  if (isReadOnly(scope)) return forbidden("This token is read-only.");
  const { id } = await params;

  const owned = await getAccessibleEnvironment(userId, id, "editor", scope);
  if (!owned) return notFound("Environment not found");

  const body = await req.json().catch(() => null);
  const baseVersion = typeof body?.baseVersion === "number" ? body.baseVersion : null;
  if (baseVersion === null) return badRequest("baseVersion is required");

  const upsert: EnvPair[] = Array.isArray(body?.upsert)
    ? body.upsert.filter(
        (p: unknown): p is EnvPair =>
          !!p && typeof (p as EnvPair).key === "string" && typeof (p as EnvPair).value === "string",
      )
    : [];
  const del: string[] = Array.isArray(body?.delete)
    ? body.delete.filter((k: unknown): k is string => typeof k === "string")
    : [];
  const message = typeof body?.message === "string" ? body.message : null;

  const outcome = await commitVersion(id, baseVersion, userId, message, async () => {
    const upsertResult = upsert.length > 0 ? await upsertMany(id, upsert) : { created: 0, updated: 0 };
    const deleteResult = del.length > 0 ? await deleteMany(id, del) : { deleted: 0 };
    return { ...upsertResult, ...deleteResult };
  });

  if (outcome.conflict) {
    const requestedKeys = new Set([...upsert.map((p) => p.key), ...del]);
    const serverPairs = (await listPairs(id)).filter((p) => requestedKeys.has(p.key));
    return json({ error: "version_conflict", currentVersion: outcome.currentVersion, serverPairs }, 409);
  }

  return json({
    version: outcome.version,
    created: outcome.result.created,
    updated: outcome.result.updated,
    deleted: outcome.result.deleted,
  });
}
