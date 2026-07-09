import { and, eq } from "drizzle-orm";
import type { EnvPair } from "@env-sync/parser";
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
    .where(eq(envVars.environmentId, environmentId));

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

/** Delete a single key from an environment. */
export async function deletePairByKey(environmentId: string, key: string) {
  await db
    .delete(envVars)
    .where(and(eq(envVars.environmentId, environmentId), eq(envVars.key, key)));
}
