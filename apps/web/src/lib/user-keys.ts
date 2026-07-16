import { eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { userKeys, type UserKeys } from "@/db/schema";

/**
 * Store for a user's zero-knowledge identity (M6 PR1). The server only ever
 * handles ciphertext/public material here — wrapping and unwrapping the
 * User Keypair's private key happens client-side via `@envhq/crypto`.
 */

export async function getUserKeys(userId: string): Promise<UserKeys | undefined> {
  const rows = await db.select().from(userKeys).where(eq(userKeys.userId, userId)).limit(1);
  return rows[0];
}

/** Batch public-key lookup (M6 PR6 reconciliation) — only ever exposes public material, never the wrapped private key. */
export async function getUserKeysBatch(userIds: string[]): Promise<Record<string, { publicKey: string }>> {
  const unique = [...new Set(userIds)];
  if (unique.length === 0) return {};
  const rows = await db
    .select({ userId: userKeys.userId, publicKey: userKeys.publicKey })
    .from(userKeys)
    .where(inArray(userKeys.userId, unique));
  return Object.fromEntries(rows.map((r) => [r.userId, { publicKey: r.publicKey }]));
}

export interface CreateUserKeysInput {
  publicKey: string;
  kdfSalt: string;
  kdfT: number;
  kdfM: number;
  kdfP: number;
  wrappedPrivateKey: string;
  wrappedPrivateKeyNonce: string;
  wrappedPrivateKeyByRecovery: string;
  wrappedPrivateKeyByRecoveryNonce: string;
}

/**
 * One-time creation of a user's ZK identity. Throws Postgres `23505` if a
 * row already exists — callers treat that as "already set up" (409), since
 * this table has no update path yet (changing the passphrase or rotating the
 * Recovery Key is a later PR, not part of initial onboarding).
 */
export async function createUserKeys(userId: string, input: CreateUserKeysInput): Promise<UserKeys> {
  const [row] = await db
    .insert(userKeys)
    .values({ userId, ...input })
    .returning();
  return row!;
}
