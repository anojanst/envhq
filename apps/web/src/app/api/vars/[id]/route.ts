import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { envVars } from "@/db/schema";
import { getUserId } from "@/lib/auth";
import { getOwnedVar, isReadOnly } from "@/lib/access";
import { encrypt } from "@/lib/crypto";
import { commitVersion } from "@/lib/version-store";
import {
  json,
  badRequest,
  unauthorized,
  tokenExpired,
  notFound,
  conflict,
  forbidden,
  versionConflict,
} from "@/lib/api";

export const runtime = "nodejs";

const KEY_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Params) {
  const { userId, expired, scope } = await getUserId(req);
  if (expired) return tokenExpired();
  if (!userId) return unauthorized();
  if (isReadOnly(scope)) return forbidden("This token is read-only.");
  const { id } = await params;

  const owned = await getOwnedVar(userId, id, scope);
  if (!owned) return notFound("Variable not found");

  const body = await req.json().catch(() => null);
  const set: Record<string, unknown> = { updatedAt: new Date() };

  const originalKey = owned.envVar.key;

  if (typeof body?.key === "string") {
    const key = body.key.trim();
    if (!KEY_RE.test(key)) return badRequest("Invalid key format");
    if (key !== originalKey) {
      // Pre-check the rename collision rather than letting the DB throw
      // inside commitVersion's applyChanges — a throw there would still
      // burn a version number (the CAS bump already committed) with no
      // matching snapshot, since there's no transaction to roll it back.
      const existing = await db
        .select({ id: envVars.id })
        .from(envVars)
        .where(and(eq(envVars.environmentId, owned.environment.id), eq(envVars.key, key), isNull(envVars.deletedAt)))
        .limit(1);
      if (existing.length > 0) {
        return conflict("A variable with that key already exists in this environment");
      }
    }
    set.key = key;
  }
  if (typeof body?.value === "string") {
    const enc = encrypt(body.value);
    set.valueCiphertext = enc.ciphertext;
    set.iv = enc.iv;
    set.authTag = enc.authTag;
  }
  if (Object.keys(set).length === 1) return badRequest("Nothing to update");

  const outcome = await commitVersion(
    owned.environment.id,
    owned.environment.version,
    userId,
    `Updated ${originalKey} via web`,
    async () => {
      const [updated] = await db
        .update(envVars)
        .set(set)
        .where(eq(envVars.id, id))
        .returning({ id: envVars.id, key: envVars.key });
      return updated;
    },
  );
  if (outcome.conflict) return versionConflict();
  return json({ variable: outcome.result });
}

export async function DELETE(req: Request, { params }: Params) {
  const { userId, expired, scope } = await getUserId(req);
  if (expired) return tokenExpired();
  if (!userId) return unauthorized();
  if (isReadOnly(scope)) return forbidden("This token is read-only.");
  const { id } = await params;

  const owned = await getOwnedVar(userId, id, scope);
  if (!owned) return notFound("Variable not found");

  const outcome = await commitVersion(
    owned.environment.id,
    owned.environment.version,
    userId,
    `Deleted ${owned.envVar.key} via web`,
    () => db.update(envVars).set({ deletedAt: new Date() }).where(eq(envVars.id, id)),
  );
  if (outcome.conflict) return versionConflict();

  return json({ ok: true });
}
