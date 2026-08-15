import { getUserId } from "@/lib/auth";
import { getUserKeys, createUserKeys } from "@/lib/user-keys";
import { json, badRequest, unauthorized, tokenExpired, notFound, conflict } from "@/lib/api";
import { isUniqueViolation } from "@/lib/db-errors";

export const runtime = "nodejs";

/**
 * A caller's own zero-knowledge identity (M6 PR1) — public key + wrapped
 * private key material, needed client-side to unlock. Never exposes another
 * user's wrapped material; a future `/api/users/[id]/public-key` (for
 * sealing a DEK to someone else) returns the public key only.
 */

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.length > 0;
}

function isPositiveInt(v: unknown): v is number {
  return typeof v === "number" && Number.isInteger(v) && v > 0;
}

// Whoami for ZK setup: 404 if the caller hasn't completed onboarding yet.
export async function GET(req: Request) {
  const { userId, expired } = await getUserId(req);
  if (expired) return tokenExpired();
  if (!userId) return unauthorized();

  const keys = await getUserKeys(userId);
  if (!keys) return notFound("Zero-knowledge identity not set up");

  return json({
    publicKey: keys.publicKey,
    kdfSalt: keys.kdfSalt,
    kdfT: keys.kdfT,
    kdfM: keys.kdfM,
    kdfP: keys.kdfP,
    wrappedPrivateKey: keys.wrappedPrivateKey,
    wrappedPrivateKeyNonce: keys.wrappedPrivateKeyNonce,
    wrappedPrivateKeyByRecovery: keys.wrappedPrivateKeyByRecovery,
    wrappedPrivateKeyByRecoveryNonce: keys.wrappedPrivateKeyByRecoveryNonce,
    createdAt: keys.createdAt,
  });
}

// One-time ZK onboarding: everything here is already client-derived/wrapped — the server just stores it.
export async function POST(req: Request) {
  const { userId, expired } = await getUserId(req);
  if (expired) return tokenExpired();
  if (!userId) return unauthorized();

  const body = await req.json().catch(() => null);
  const fields = {
    publicKey: body?.publicKey,
    kdfSalt: body?.kdfSalt,
    kdfT: body?.kdfT,
    kdfM: body?.kdfM,
    kdfP: body?.kdfP,
    wrappedPrivateKey: body?.wrappedPrivateKey,
    wrappedPrivateKeyNonce: body?.wrappedPrivateKeyNonce,
    wrappedPrivateKeyByRecovery: body?.wrappedPrivateKeyByRecovery,
    wrappedPrivateKeyByRecoveryNonce: body?.wrappedPrivateKeyByRecoveryNonce,
  };

  if (
    !isNonEmptyString(fields.publicKey) ||
    !isNonEmptyString(fields.kdfSalt) ||
    !isPositiveInt(fields.kdfT) ||
    !isPositiveInt(fields.kdfM) ||
    !isPositiveInt(fields.kdfP) ||
    !isNonEmptyString(fields.wrappedPrivateKey) ||
    !isNonEmptyString(fields.wrappedPrivateKeyNonce) ||
    !isNonEmptyString(fields.wrappedPrivateKeyByRecovery) ||
    !isNonEmptyString(fields.wrappedPrivateKeyByRecoveryNonce)
  ) {
    return badRequest("Missing or invalid key material");
  }

  if (await getUserKeys(userId)) {
    return conflict("Zero-knowledge identity already set up");
  }

  try {
    await createUserKeys(userId, fields);
  } catch (err) {
    // Race: two concurrent setup attempts both passed the pre-check above.
    if (isUniqueViolation(err)) {
      return conflict("Zero-knowledge identity already set up");
    }
    throw err;
  }

  return json({ ok: true }, 201);
}
