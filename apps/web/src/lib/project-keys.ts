import { and, eq, inArray, notInArray, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import { projectKeys, accessGrants, groupMembers, projects, envVars, environments, type ProjectKeys } from "@/db/schema";
import { listAccessibleUserIds } from "@/lib/access";
import { getUserKeysBatch } from "@/lib/user-keys";

/** Flags one or more projects as due for a DEK rotation (a revoke just happened). */
async function markRotationPending(projectIds: string[]): Promise<void> {
  if (projectIds.length === 0) return;
  await db
    .update(projects)
    .set({ keyRotationPending: true })
    .where(inArray(projects.id, projectIds));
}

/**
 * Store for a project's per-member DEK wraps (M6 PR2). The server only ever
 * handles the sealed blob — wrapping/unwrapping happens client-side via
 * `@envhq/crypto`'s `sealToPublicKey`/`unsealWithPrivateKey`.
 */

export async function getProjectKeyForUser(
  projectId: string,
  userId: string,
): Promise<ProjectKeys | undefined> {
  const rows = await db
    .select()
    .from(projectKeys)
    .where(and(eq(projectKeys.projectId, projectId), eq(projectKeys.subjectUserId, userId)))
    .limit(1);
  return rows[0];
}

/**
 * Registers a wrapped DEK for `subjectUserId`. Throws Postgres `23505` if a
 * wrap already exists for that (project, user) pair — callers treat that as
 * "already registered" (409), same one-time-write shape as `createUserKeys`.
 */
export async function createProjectKey(
  projectId: string,
  subjectUserId: string,
  wrappedDek: string,
  wrappedByUserId: string,
): Promise<ProjectKeys> {
  const [row] = await db
    .insert(projectKeys)
    .values({ projectId, subjectUserId, wrappedDek, wrappedByUserId })
    .returning();
  return row!;
}

/**
 * Whether *any* wrap exists for this project, from anyone. `env_vars` can't
 * hold anything without a DEK to encrypt under, so "no wraps at all" means
 * the project is provably empty and safe for any authorized, unlocked user
 * to self-heal by generating the first DEK — as opposed to "a wrap exists
 * for someone else, just not you yet," which is a real pending-share case
 * (`no-key`) that must go through reconciliation, not a fresh DEK.
 */
export async function projectHasAnyKey(projectId: string): Promise<boolean> {
  const rows = await db.select({ id: projectKeys.id }).from(projectKeys).where(eq(projectKeys.projectId, projectId)).limit(1);
  return rows.length > 0;
}

/** userIds that already hold a wrap for this project (M6 PR6 reconciliation). */
export async function getProjectKeyUserIds(projectId: string): Promise<Set<string>> {
  const rows = await db
    .select({ subjectUserId: projectKeys.subjectUserId })
    .from(projectKeys)
    .where(eq(projectKeys.projectId, projectId));
  return new Set(rows.map((r) => r.subjectUserId));
}

/** Revocation (M6 PR6): drop one user's wrap for a project. No-op if they never had one. Unconditional — if they still have access via another path (a group, org-admin), the next reconciliation pass re-wraps them. Marks the project as due for a DEK rotation. */
export async function deleteProjectKeyForUser(projectId: string, userId: string): Promise<void> {
  await db
    .delete(projectKeys)
    .where(and(eq(projectKeys.projectId, projectId), eq(projectKeys.subjectUserId, userId)));
  await markRotationPending([projectId]);
}

/** Revocation: drop one user's wrap on every project a specific group grants access to (they were removed from that group). */
export async function deleteProjectKeysForGroupMember(groupId: string, userId: string): Promise<void> {
  const grantedProjectIds = await db
    .select({ projectId: accessGrants.projectId })
    .from(accessGrants)
    .where(and(eq(accessGrants.subjectType, "group"), eq(accessGrants.subjectId, groupId)));
  if (grantedProjectIds.length === 0) return;

  const projectIds = grantedProjectIds.map((p) => p.projectId);
  await db
    .delete(projectKeys)
    .where(and(inArray(projectKeys.projectId, projectIds), eq(projectKeys.subjectUserId, userId)));
  await markRotationPending(projectIds);
}

/** Revocation: a group's grant on *one specific* project was revoked — drop every current member's wrap on just that project, leaving any of the group's other project grants untouched. */
export async function deleteProjectKeysForGroupOnProject(projectId: string, groupId: string): Promise<void> {
  const members = await db.select({ userId: groupMembers.userId }).from(groupMembers).where(eq(groupMembers.groupId, groupId));
  if (members.length === 0) return;

  await db
    .delete(projectKeys)
    .where(
      and(
        eq(projectKeys.projectId, projectId),
        inArray(
          projectKeys.subjectUserId,
          members.map((m) => m.userId),
        ),
      ),
    );
  await markRotationPending([projectId]);
}

/** Revocation: the group itself was deleted — drop every current member's wrap across every project it granted access to (all of those grants are gone with it). Call before the group's own rows are gone. */
export async function deleteProjectKeysForGroupEverywhere(groupId: string): Promise<void> {
  const [grantedProjectIds, members] = await Promise.all([
    db
      .select({ projectId: accessGrants.projectId })
      .from(accessGrants)
      .where(and(eq(accessGrants.subjectType, "group"), eq(accessGrants.subjectId, groupId))),
    db.select({ userId: groupMembers.userId }).from(groupMembers).where(eq(groupMembers.groupId, groupId)),
  ]);
  if (grantedProjectIds.length === 0 || members.length === 0) return;

  const projectIds = grantedProjectIds.map((p) => p.projectId);
  await db
    .delete(projectKeys)
    .where(
      and(
        inArray(projectKeys.projectId, projectIds),
        inArray(
          projectKeys.subjectUserId,
          members.map((m) => m.userId),
        ),
      ),
    );
  await markRotationPending(projectIds);
}

/**
 * DEK rotation (revoke doesn't rotate the key on its own — see
 * `markRotationPending` above — an admin runs this to actually retire the
 * old DEK). Two-phase to stay correct without multi-statement transactions
 * (`neon-http` has no `db.transaction()`, same constraint as
 * `version-store.ts`'s CAS commit):
 *
 *   1. `migrateVarsBatch` — client decrypts every live `env_vars` value with
 *      the old DEK and re-encrypts with a freshly generated one, then
 *      uploads batches here. Idempotent/resumable: each call is one atomic
 *      bulk `UPDATE`, safe to retry or resume after a partial failure since
 *      rows not yet migrated just stay on the old `keyVersion`. The old DEK
 *      and its wraps are untouched during this phase, so the project keeps
 *      working normally throughout.
 *   2. `finalizeRotation` — the irreversible step. Only proceeds once every
 *      `env_vars` row is confirmed migrated, and only accepts a wrap set
 *      that exactly matches the project's current authorized membership
 *      (computed server-side, not trusted from the client) so a stale or
 *      forged wrap list can't lock someone in or out. New wraps are
 *      upserted *before* stale ones are deleted, so there's no window where
 *      a remaining member has no usable wrap.
 */

/** `projects.keyVersion` + whether a rotation is recommended (a revoke happened since the last one). */
export async function getRotationStatus(
  projectId: string,
): Promise<{ currentKeyVersion: number; rotationPending: boolean } | undefined> {
  const [project] = await db
    .select({ keyVersion: projects.keyVersion, keyRotationPending: projects.keyRotationPending })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);
  if (!project) return undefined;

  return { currentKeyVersion: project.keyVersion, rotationPending: project.keyRotationPending };
}

/**
 * How many `env_vars` rows (project-wide) are *not yet* at `targetKeyVersion`
 * — the in-progress-rotation gate `finalizeRotation` uses. Deliberately
 * independent of `projects.keyVersion`, which only bumps at finalize itself:
 * comparing against the live column would always read 0 mid-rotation (an
 * un-migrated row sits *at* the old current version, not below it), letting
 * finalize proceed before any row was actually re-encrypted.
 */
async function countVarsBelowVersion(projectId: string, targetKeyVersion: number): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(envVars)
    .innerJoin(environments, eq(envVars.environmentId, environments.id))
    .where(and(eq(environments.projectId, projectId), lt(envVars.keyVersion, targetKeyVersion)));
  return row?.count ?? 0;
}

/**
 * Re-encrypts a batch of `env_vars` rows in one atomic statement (a
 * multi-row `UPDATE ... FROM (VALUES ...)`, since drizzle's query builder
 * can't set different values per matched row). Rows are scoped to this
 * project via a subquery on `environments` so a caller can't smuggle in an
 * id from another project.
 */
export async function migrateVarsBatch(
  projectId: string,
  targetKeyVersion: number,
  rows: { id: string; ciphertext: string; iv: string }[],
): Promise<void> {
  if (rows.length === 0) return;
  const values = sql.join(
    rows.map((r) => sql`(${r.id}::uuid, ${r.ciphertext}::text, ${r.iv}::text)`),
    sql`, `,
  );
  await db.execute(sql`
    UPDATE env_vars AS ev
    SET value_ciphertext = v.ciphertext, iv = v.iv, key_version = ${targetKeyVersion}, updated_at = now()
    FROM (VALUES ${values}) AS v(id, ciphertext, iv)
    WHERE ev.id = v.id
      AND ev.environment_id IN (SELECT id FROM environments WHERE project_id = ${projectId}::uuid)
  `);
}

export type FinalizeRotationResult =
  | { ok: true }
  | { ok: false; reason: "pending"; pendingVarCount: number }
  | { ok: false; reason: "membership_mismatch"; expected: string[]; got: string[] };

/** The irreversible step of a rotation — see the doc comment above. */
export async function finalizeRotation(
  projectId: string,
  targetKeyVersion: number,
  wraps: { subjectUserId: string; wrappedDek: string }[],
  wrappedByUserId: string,
): Promise<FinalizeRotationResult> {
  const [project] = await db
    .select({ orgId: projects.orgId })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);
  if (!project) throw new Error("Project not found");

  const pendingVarCount = await countVarsBelowVersion(projectId, targetKeyVersion);
  if (pendingVarCount > 0) {
    return { ok: false, reason: "pending", pendingVarCount };
  }

  // Only require a wrap for accessible members who've actually completed ZK
  // onboarding — someone with project access but no public key yet has never
  // been able to decrypt anything anyway (same "pending" state as initial
  // sharing), so their absence here isn't rotation-specific and shouldn't
  // block it.
  const accessibleUserIds = await listAccessibleUserIds(project.orgId, projectId);
  const onboarded = await getUserKeysBatch(accessibleUserIds);
  const expected = new Set(accessibleUserIds.filter((id) => onboarded[id]));
  const got = new Set(wraps.map((w) => w.subjectUserId));
  if (expected.size !== got.size || [...expected].some((id) => !got.has(id))) {
    return { ok: false, reason: "membership_mismatch", expected: [...expected], got: [...got] };
  }

  if (wraps.length > 0) {
    await db
      .insert(projectKeys)
      .values(
        wraps.map((w) => ({
          projectId,
          subjectUserId: w.subjectUserId,
          wrappedDek: w.wrappedDek,
          wrappedByUserId,
          keyVersion: targetKeyVersion,
        })),
      )
      .onConflictDoUpdate({
        target: [projectKeys.projectId, projectKeys.subjectUserId],
        set: { wrappedDek: sql`excluded.wrapped_dek`, wrappedByUserId, keyVersion: targetKeyVersion },
      });
  }

  const keepSubjectIds = wraps.map((w) => w.subjectUserId);
  await db
    .delete(projectKeys)
    .where(
      keepSubjectIds.length > 0
        ? and(eq(projectKeys.projectId, projectId), notInArray(projectKeys.subjectUserId, keepSubjectIds))
        : eq(projectKeys.projectId, projectId),
    );

  await db
    .update(projects)
    .set({ keyVersion: targetKeyVersion, keyRotationPending: false })
    .where(eq(projects.id, projectId));

  return { ok: true };
}
