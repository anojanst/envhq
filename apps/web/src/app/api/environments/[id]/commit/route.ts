import { eq, and, sql, isNull } from "drizzle-orm";
import type { EnvPair } from "@envhq/parser";
import { db } from "@/db";
import { environments, envVars, environmentVersions } from "@/db/schema";
import { getUserId } from "@/lib/auth";
import { getOwnedEnvironment, isReadOnly } from "@/lib/access";
import { upsertMany, deleteMany, listPairs } from "@/lib/env-store";
import { json, badRequest, unauthorized, tokenExpired, notFound, forbidden } from "@/lib/api";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

/**
 * Atomic three-way "commit" (M4): applies an upsert/delete batch and bumps
 * the environment's version, or 409s with the live server state for the
 * keys involved if `baseVersion` is stale. The CAS is a single
 * `UPDATE ... WHERE version = $baseVersion RETURNING version` — the neon-http
 * driver this app uses has no `db.transaction()` support (no persistent
 * session across statements), so that single atomic statement is the
 * linearization point: whoever's WHERE clause matches is the sole winner for
 * that version, and only the winner proceeds to apply changes + snapshot.
 */
export async function POST(req: Request, { params }: Params) {
  const { userId, expired, scope } = await getUserId(req);
  if (expired) return tokenExpired();
  if (!userId) return unauthorized();
  if (isReadOnly(scope)) return forbidden("This token is read-only.");
  const { id } = await params;

  const owned = await getOwnedEnvironment(userId, id, scope);
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

  const bumped = await db
    .update(environments)
    .set({ version: sql`${environments.version} + 1`, updatedAt: new Date() })
    .where(and(eq(environments.id, id), eq(environments.version, baseVersion)))
    .returning({ version: environments.version });

  if (bumped.length === 0) {
    const currentVersion = (
      await db.select({ version: environments.version }).from(environments).where(eq(environments.id, id))
    )[0]!.version;

    const requestedKeys = new Set([...upsert.map((p) => p.key), ...del]);
    const serverPairs = (await listPairs(id)).filter((p) => requestedKeys.has(p.key));

    return json({ error: "version_conflict", currentVersion, serverPairs }, 409);
  }

  const newVersion = bumped[0]!.version;

  const upsertResult = upsert.length > 0 ? await upsertMany(id, upsert) : { created: 0, updated: 0 };
  const deleteResult = del.length > 0 ? await deleteMany(id, del) : { deleted: 0 };

  const activeRows = await db
    .select()
    .from(envVars)
    .where(and(eq(envVars.environmentId, id), isNull(envVars.deletedAt)));

  await db.insert(environmentVersions).values({
    environmentId: id,
    version: newVersion,
    message,
    snapshot: activeRows.map((row) => ({
      key: row.key,
      valueCiphertext: row.valueCiphertext,
      iv: row.iv,
      authTag: row.authTag,
    })),
    createdBy: userId,
  });

  return json({
    version: newVersion,
    created: upsertResult.created,
    updated: upsertResult.updated,
    deleted: deleteResult.deleted,
  });
}
