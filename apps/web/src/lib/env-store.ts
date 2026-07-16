import { and, eq, isNull, isNotNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { envVars } from "@/db/schema";

/**
 * The env-var storage boundary (M6 PR4). Everything here is ciphertext —
 * the server stores/returns exactly the `{ciphertext, iv}` blob a client
 * gave it and never decrypts. Encrypting/decrypting happens client-side via
 * `@envhq/crypto`, using a project's DEK (unwrapped from `project_keys`).
 * `iv` is an AEAD nonce despite the legacy column name (kept to avoid a
 * rename migration — see schema.ts's `envVars` comment).
 */

export interface EncryptedPair {
  key: string;
  ciphertext: string;
  iv: string;
}

export interface EncryptedVarRow extends EncryptedPair {
  id: string;
  updatedAt: Date;
}

/** All of an environment's active rows (with ids), ciphertext only, ordered by key. */
export async function listVarRows(environmentId: string): Promise<EncryptedVarRow[]> {
  const rows = await db
    .select()
    .from(envVars)
    .where(and(eq(envVars.environmentId, environmentId), isNull(envVars.deletedAt)));

  return rows
    .map((row) => ({
      id: row.id,
      key: row.key,
      ciphertext: row.valueCiphertext,
      iv: row.iv,
      updatedAt: row.updatedAt,
    }))
    .sort((a, b) => a.key.localeCompare(b.key));
}

/** An environment's variables as ciphertext pairs (for CLI export/pull — decrypted client-side). */
export async function listPairs(environmentId: string): Promise<EncryptedPair[]> {
  const rows = await listVarRows(environmentId);
  return rows.map(({ key, ciphertext, iv }) => ({ key, ciphertext, iv }));
}

/** Insert or update a single key from client-supplied ciphertext, returning whether it was created. */
export async function upsertPair(
  environmentId: string,
  key: string,
  ciphertext: string,
  iv: string,
): Promise<{ created: boolean }> {
  const result = await db
    .insert(envVars)
    .values({ environmentId, key, valueCiphertext: ciphertext, iv })
    .onConflictDoUpdate({
      target: [envVars.environmentId, envVars.key],
      targetWhere: sql`${envVars.deletedAt} is null`,
      set: {
        valueCiphertext: ciphertext,
        iv,
        authTag: null,
        updatedAt: new Date(),
      },
    })
    .returning({ createdAt: envVars.createdAt, updatedAt: envVars.updatedAt });

  const row = result[0]!;
  return { created: row.createdAt.getTime() === row.updatedAt.getTime() };
}

/**
 * Upsert/merge a batch of already-encrypted pairs (the paste-a-blob and CLI
 * push behaviour): new keys are inserted, existing keys are updated,
 * untouched keys are kept.
 */
export async function upsertMany(
  environmentId: string,
  pairs: EncryptedPair[],
): Promise<{ created: number; updated: number }> {
  let created = 0;
  let updated = 0;
  for (const { key, ciphertext, iv } of pairs) {
    const res = await upsertPair(environmentId, key, ciphertext, iv);
    if (res.created) created++;
    else updated++;
  }
  return { created, updated };
}

/** Soft-delete a single key from an environment (a no-op if already deleted). */
export async function deletePairByKey(environmentId: string, key: string) {
  await db
    .update(envVars)
    .set({ deletedAt: new Date() })
    .where(
      and(
        eq(envVars.environmentId, environmentId),
        eq(envVars.key, key),
        isNull(envVars.deletedAt),
      ),
    );
}

/**
 * Soft-delete a batch of keys at once (the CLI three-way push's delete step),
 * mirroring `upsertMany`'s loop-and-count pattern.
 */
export async function deleteMany(environmentId: string, keys: string[]): Promise<{ deleted: number }> {
  let deleted = 0;
  for (const key of keys) {
    const result = await db
      .update(envVars)
      .set({ deletedAt: new Date() })
      .where(
        and(
          eq(envVars.environmentId, environmentId),
          eq(envVars.key, key),
          isNull(envVars.deletedAt),
        ),
      )
      .returning({ id: envVars.id });
    if (result.length > 0) deleted++;
  }
  return { deleted };
}

/**
 * Restore one specific trashed row by id (a key can have been soft-deleted
 * more than once, so "restore by key" would be ambiguous — and would try to
 * reactivate every tombstone at once, colliding with itself). Throws (23505)
 * if an active row with the same key already exists in this environment.
 */
export async function restorePair(varId: string) {
  await db
    .update(envVars)
    .set({ deletedAt: null })
    .where(and(eq(envVars.id, varId), isNotNull(envVars.deletedAt)));
}

/** List an environment's soft-deleted vars (trash), ciphertext only, ordered by key. */
export async function listTrash(environmentId: string): Promise<EncryptedVarRow[]> {
  const rows = await db
    .select()
    .from(envVars)
    .where(and(eq(envVars.environmentId, environmentId), isNotNull(envVars.deletedAt)));

  return rows
    .map((row) => ({
      id: row.id,
      key: row.key,
      ciphertext: row.valueCiphertext,
      iv: row.iv,
      updatedAt: row.updatedAt,
    }))
    .sort((a, b) => a.key.localeCompare(b.key));
}

/**
 * Clone every var from one environment into another by copying ciphertext
 * directly — no decrypt/re-encrypt needed since values aren't keyed per-env
 * (the DEK is per-project, see `project_keys`).
 */
export async function cloneVars(fromEnvironmentId: string, toEnvironmentId: string): Promise<number> {
  const rows = await db
    .select()
    .from(envVars)
    .where(and(eq(envVars.environmentId, fromEnvironmentId), isNull(envVars.deletedAt)));
  if (rows.length === 0) return 0;

  await db.insert(envVars).values(
    rows.map((row) => ({
      environmentId: toEnvironmentId,
      key: row.key,
      valueCiphertext: row.valueCiphertext,
      iv: row.iv,
      authTag: row.authTag,
    })),
  );
  return rows.length;
}
