import { getUserId } from "@/lib/auth";
import { getAccessibleEnvironment, isReadOnly } from "@/lib/access";
import { upsertMany, type EncryptedPair } from "@/lib/env-store";
import { commitVersion } from "@/lib/version-store";
import { json, badRequest, unauthorized, tokenExpired, notFound, forbidden, versionConflict } from "@/lib/api";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

/**
 * Paste-a-blob (web UI): the client parses the pasted `.env` text
 * (`@envhq/parser`) and encrypts each value under the project DEK before
 * sending — this route just upsert-merges already-encrypted pairs.
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
  const pairs: EncryptedPair[] = Array.isArray(body?.pairs)
    ? body.pairs.filter(
        (p: unknown): p is EncryptedPair =>
          !!p &&
          typeof (p as EncryptedPair).key === "string" &&
          typeof (p as EncryptedPair).ciphertext === "string" &&
          typeof (p as EncryptedPair).iv === "string",
      )
    : [];
  if (pairs.length === 0) return badRequest("pairs is required");

  const outcome = await commitVersion(
    id,
    owned.env.version,
    userId,
    `Pasted ${pairs.length} variable(s) via web`,
    () => upsertMany(id, pairs),
  );
  if (outcome.conflict) return versionConflict();

  return json({ ...outcome.result, total: pairs.length });
}
