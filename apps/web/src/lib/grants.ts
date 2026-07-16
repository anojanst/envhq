import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { accessGrants } from "@/db/schema";
import { parseEnvScope, type EnvScope, type Role } from "@/lib/access";
import { resolveDisplayNames } from "@/lib/auth";
import { getGroupNames } from "@/lib/groups";

/**
 * `access_grants` CRUD (M5 PR2 direct users, PR3b groups). Kept separate
 * from `access.ts`, which stays the read-path role-resolution module — this
 * is the management/write side, same split as `env-store.ts` vs. the
 * read-heavy parts of `access.ts`.
 */

export type SubjectType = "user" | "group";

export interface GrantRow {
  id: string;
  subjectType: SubjectType;
  subjectId: string;
  role: Role;
  envScope: EnvScope | null;
  createdAt: Date;
}

function toGrantRow(row: typeof accessGrants.$inferSelect): GrantRow {
  return {
    id: row.id,
    subjectType: row.subjectType as SubjectType,
    subjectId: row.subjectId,
    role: row.role as Role,
    envScope: parseEnvScope(row.envScope),
    createdAt: row.createdAt,
  };
}

/** Direct + group grants for a project, oldest first. */
export async function listGrants(projectId: string): Promise<GrantRow[]> {
  const rows = await db
    .select()
    .from(accessGrants)
    .where(eq(accessGrants.projectId, projectId))
    .orderBy(asc(accessGrants.createdAt));
  return rows.map(toGrantRow);
}

/**
 * Grant (or update the role of) a user or group on a project.
 *
 * `envScope` is a separate optional argument, not folded into `role`: pass
 * `undefined` to leave an existing grant's env-scope untouched (e.g. a plain
 * role change from the inline dropdown shouldn't wipe a prod restriction),
 * or an explicit `EnvScope | null` to set/clear it.
 */
export async function upsertGrant(
  orgId: string,
  projectId: string,
  subjectType: SubjectType,
  subjectId: string,
  role: Role,
  envScope?: EnvScope | null,
): Promise<GrantRow> {
  const envScopeText = envScope ? JSON.stringify(envScope) : null;
  const updateSet: Partial<typeof accessGrants.$inferInsert> = { role, updatedAt: new Date() };
  if (envScope !== undefined) updateSet.envScope = envScopeText;

  const [row] = await db
    .insert(accessGrants)
    .values({ orgId, projectId, subjectType, subjectId, role, envScope: envScopeText })
    .onConflictDoUpdate({
      target: [accessGrants.projectId, accessGrants.subjectType, accessGrants.subjectId],
      set: updateSet,
    })
    .returning();
  return toGrantRow(row!);
}

/** Resolve each grant's display name — a Clerk user lookup or a `groups` row, depending on subjectType. Shared by the access API route and the Access page's SSR fetch. */
export async function withGrantNames<G extends GrantRow>(grants: G[]): Promise<(G & { name: string })[]> {
  const userIds = grants.filter((g) => g.subjectType === "user").map((g) => g.subjectId);
  const groupIds = grants.filter((g) => g.subjectType === "group").map((g) => g.subjectId);
  const [userNames, groupNames] = await Promise.all([resolveDisplayNames(userIds), getGroupNames(groupIds)]);
  const names = { ...userNames, ...groupNames };
  return grants.map((g) => ({ ...g, name: names[g.subjectId] ?? g.subjectId }));
}

/** Revoke a grant. Returns whether a row was actually deleted (for a 404 vs. no-op). */
export async function deleteGrant(projectId: string, grantId: string): Promise<boolean> {
  const deleted = await db
    .delete(accessGrants)
    .where(and(eq(accessGrants.id, grantId), eq(accessGrants.projectId, projectId)))
    .returning({ id: accessGrants.id });
  return deleted.length > 0;
}
