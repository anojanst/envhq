import { getUserId } from "@/lib/auth";
import { getAccessibleEnvironment } from "@/lib/access";
import { listPairs } from "@/lib/env-store";
import { json, unauthorized, tokenExpired, notFound } from "@/lib/api";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

/**
 * Copy-all / CLI pull: return the environment's ciphertext pairs. The
 * server can no longer serialize a `.env` blob itself (that requires
 * decrypting) — the caller decrypts each pair with the project DEK and
 * calls `@envhq/parser`'s `serializeEnv` client-side.
 */
export async function GET(req: Request, { params }: Params) {
  const { userId, expired, scope } = await getUserId(req);
  if (expired) return tokenExpired();
  if (!userId) return unauthorized();
  const { id } = await params;

  const owned = await getAccessibleEnvironment(userId, id, "viewer", scope);
  if (!owned) return notFound("Environment not found");

  const pairs = await listPairs(id);
  return json({ pairs, count: pairs.length, version: owned.env.version });
}
