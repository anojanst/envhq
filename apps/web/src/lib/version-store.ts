import { and, eq, sql, isNull, desc } from "drizzle-orm";
import { db } from "@/db";
import { environments, envVars, environmentVersions, type VersionSnapshotEntry } from "@/db/schema";
import { deleteMany } from "./env-store";

export type CommitOutcome<T> =
  | { conflict: true; currentVersion: number }
  | { conflict: false; version: number; result: T };

/**
 * Atomic CAS commit (M4): bumps `environments.version` via a single
 * `UPDATE ... WHERE version = $baseVersion RETURNING version` — the
 * neon-http driver has no `db.transaction()` support (no persistent session
 * across statements), so that single atomic statement is the linearization
 * point. Only the winner runs `applyChanges`, then a full snapshot of the
 * resulting active `env_vars` is written as the new version. Shared by the
 * plain upsert/delete commit route and rollback (same CAS+snapshot shape,
 * different mutation in between).
 */
export async function commitVersion<T>(
  environmentId: string,
  baseVersion: number,
  userId: string,
  message: string | null,
  applyChanges: () => Promise<T>,
): Promise<CommitOutcome<T>> {
  const bumped = await db
    .update(environments)
    .set({ version: sql`${environments.version} + 1`, updatedAt: new Date() })
    .where(and(eq(environments.id, environmentId), eq(environments.version, baseVersion)))
    .returning({ version: environments.version });

  if (bumped.length === 0) {
    const currentVersion = (
      await db
        .select({ version: environments.version })
        .from(environments)
        .where(eq(environments.id, environmentId))
    )[0]!.version;
    return { conflict: true, currentVersion };
  }

  const newVersion = bumped[0]!.version;
  const result = await applyChanges();

  const activeRows = await db
    .select()
    .from(envVars)
    .where(and(eq(envVars.environmentId, environmentId), isNull(envVars.deletedAt)));

  await db.insert(environmentVersions).values({
    environmentId,
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

  return { conflict: false, version: newVersion, result };
}

/** Version history for an environment, newest first, no snapshot content. */
export async function listVersions(environmentId: string) {
  return db
    .select({
      version: environmentVersions.version,
      message: environmentVersions.message,
      createdBy: environmentVersions.createdBy,
      createdAt: environmentVersions.createdAt,
    })
    .from(environmentVersions)
    .where(eq(environmentVersions.environmentId, environmentId))
    .orderBy(desc(environmentVersions.version));
}

/** One version's raw snapshot entries, or `null` if that version doesn't exist for this environment. */
export async function getVersionSnapshot(
  environmentId: string,
  version: number,
): Promise<VersionSnapshotEntry[] | null> {
  const rows = await db
    .select({ snapshot: environmentVersions.snapshot })
    .from(environmentVersions)
    .where(and(eq(environmentVersions.environmentId, environmentId), eq(environmentVersions.version, version)))
    .limit(1);
  return rows[0]?.snapshot ?? null;
}

/**
 * Make active `env_vars` match a historical snapshot exactly — ciphertext is
 * copied directly (same pattern as `cloneVars`, no decrypt/re-encrypt).
 * Currently-active keys not in the snapshot are soft-deleted; everything in
 * the snapshot is upserted with its stored ciphertext.
 */
export async function restoreSnapshot(environmentId: string, snapshot: VersionSnapshotEntry[]) {
  const targetKeys = new Set(snapshot.map((e) => e.key));
  const current = await db
    .select({ key: envVars.key })
    .from(envVars)
    .where(and(eq(envVars.environmentId, environmentId), isNull(envVars.deletedAt)));

  const toDelete = current.map((r) => r.key).filter((k) => !targetKeys.has(k));
  if (toDelete.length > 0) {
    await deleteMany(environmentId, toDelete);
  }

  for (const entry of snapshot) {
    await db
      .insert(envVars)
      .values({
        environmentId,
        key: entry.key,
        valueCiphertext: entry.valueCiphertext,
        iv: entry.iv,
        authTag: entry.authTag,
      })
      .onConflictDoUpdate({
        target: [envVars.environmentId, envVars.key],
        targetWhere: sql`${envVars.deletedAt} is null`,
        set: {
          valueCiphertext: entry.valueCiphertext,
          iv: entry.iv,
          authTag: entry.authTag,
          updatedAt: new Date(),
        },
      });
  }
}
