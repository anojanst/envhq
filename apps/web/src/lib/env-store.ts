import { and, eq, isNull, isNotNull, sql } from "drizzle-orm";
import type { EnvPair } from "@envhq/parser";
import { db } from "@/db";
import { envVars } from "@/db/schema";
import { encrypt, decrypt } from "./crypto";

/**
 * The encryption boundary for env values. Everything above this layer works in
 * plaintext pairs; everything below (the DB) only ever sees ciphertext.
 */

export interface EnvVarRow extends EnvPair {
  id: string;
}

/** Decrypt all of an environment's rows (with ids), ordered by key. */
export async function listVarRows(environmentId: string): Promise<EnvVarRow[]> {
  const rows = await db
    .select()
    .from(envVars)
    .where(and(eq(envVars.environmentId, environmentId), isNull(envVars.deletedAt)));

  return rows
    .map((row) => ({
      id: row.id,
      key: row.key,
      value: decrypt({
        ciphertext: row.valueCiphertext,
        iv: row.iv,
        authTag: row.authTag,
      }),
    }))
    .sort((a, b) => a.key.localeCompare(b.key));
}

/** Return an environment's variables as decrypted pairs (for export/CLI). */
export async function listPairs(environmentId: string): Promise<EnvPair[]> {
  const rows = await listVarRows(environmentId);
  return rows.map(({ key, value }) => ({ key, value }));
}

/** Insert or update a single key, returning whether it was created. */
export async function upsertPair(
  environmentId: string,
  key: string,
  value: string,
): Promise<{ created: boolean }> {
  const enc = encrypt(value);
  const result = await db
    .insert(envVars)
    .values({
      environmentId,
      key,
      valueCiphertext: enc.ciphertext,
      iv: enc.iv,
      authTag: enc.authTag,
    })
    .onConflictDoUpdate({
      target: [envVars.environmentId, envVars.key],
      targetWhere: sql`${envVars.deletedAt} is null`,
      set: {
        valueCiphertext: enc.ciphertext,
        iv: enc.iv,
        authTag: enc.authTag,
        updatedAt: new Date(),
      },
    })
    .returning({ createdAt: envVars.createdAt, updatedAt: envVars.updatedAt });

  const row = result[0]!;
  return { created: row.createdAt.getTime() === row.updatedAt.getTime() };
}

/**
 * Upsert/merge a batch of pairs (the paste-a-blob and CLI push behaviour):
 * new keys are inserted, existing keys are updated, untouched keys are kept.
 */
export async function upsertMany(
  environmentId: string,
  pairs: EnvPair[],
): Promise<{ created: number; updated: number }> {
  let created = 0;
  let updated = 0;
  for (const { key, value } of pairs) {
    const res = await upsertPair(environmentId, key, value);
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

/** List an environment's soft-deleted vars (trash), decrypted, ordered by key. */
export async function listTrash(environmentId: string): Promise<EnvVarRow[]> {
  const rows = await db
    .select()
    .from(envVars)
    .where(and(eq(envVars.environmentId, environmentId), isNotNull(envVars.deletedAt)));

  return rows
    .map((row) => ({
      id: row.id,
      key: row.key,
      value: decrypt({
        ciphertext: row.valueCiphertext,
        iv: row.iv,
        authTag: row.authTag,
      }),
    }))
    .sort((a, b) => a.key.localeCompare(b.key));
}

/**
 * Clone every var from one environment into another by copying ciphertext
 * directly — no decrypt/re-encrypt needed since values aren't keyed per-env.
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
