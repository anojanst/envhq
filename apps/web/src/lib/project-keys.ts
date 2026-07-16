import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { projectKeys, accessGrants, groupMembers, type ProjectKeys } from "@/db/schema";

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

/** Revocation (M6 PR6): drop one user's wrap for a project. No-op if they never had one. Unconditional — if they still have access via another path (a group, org-admin), the next reconciliation pass re-wraps them. */
export async function deleteProjectKeyForUser(projectId: string, userId: string): Promise<void> {
  await db
    .delete(projectKeys)
    .where(and(eq(projectKeys.projectId, projectId), eq(projectKeys.subjectUserId, userId)));
}

/** Revocation: drop one user's wrap on every project a specific group grants access to (they were removed from that group). */
export async function deleteProjectKeysForGroupMember(groupId: string, userId: string): Promise<void> {
  const grantedProjectIds = await db
    .select({ projectId: accessGrants.projectId })
    .from(accessGrants)
    .where(and(eq(accessGrants.subjectType, "group"), eq(accessGrants.subjectId, groupId)));
  if (grantedProjectIds.length === 0) return;

  await db
    .delete(projectKeys)
    .where(
      and(
        inArray(
          projectKeys.projectId,
          grantedProjectIds.map((p) => p.projectId),
        ),
        eq(projectKeys.subjectUserId, userId),
      ),
    );
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

  await db
    .delete(projectKeys)
    .where(
      and(
        inArray(
          projectKeys.projectId,
          grantedProjectIds.map((p) => p.projectId),
        ),
        inArray(
          projectKeys.subjectUserId,
          members.map((m) => m.userId),
        ),
      ),
    );
}
