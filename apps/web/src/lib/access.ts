import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { projects, environments, envVars } from "@/db/schema";
import type { TokenScope } from "@/lib/auth";

/**
 * Ownership-scoped lookups. Every read/write path goes through one of these so
 * a user can only ever touch rows that roll up to their own `userId` (v1 is
 * personal-only). Each returns the row or `undefined` if it doesn't exist or
 * isn't owned by the caller — callers treat `undefined` as 404.
 *
 * A `scope` may be passed for project-scoped CLI tokens (PATs): when
 * `scope.projectId` is set, anything outside that project resolves to
 * `undefined` too, so a scoped token 404s on other projects.
 */

/** Restrict a query to a token's project, if the token is project-scoped. */
function projectFilter(scope?: TokenScope) {
  return scope?.projectId ? eq(projects.id, scope.projectId) : undefined;
}

/**
 * Guard for write routes: a read-only token may not mutate. Returns true when
 * the write should be blocked (caller returns 403).
 */
export function isReadOnly(scope?: TokenScope): boolean {
  return scope?.capability === "read";
}

/**
 * Guard for account-level actions (creating projects, managing tokens). Only a
 * web session or a full, unscoped read/write token qualifies — so a leaked
 * project-scoped or read-only PAT can't escalate by minting new tokens.
 */
export function isFullAccess(scope?: TokenScope): boolean {
  return !scope || (!scope.projectId && scope.capability === "write");
}

export async function getOwnedProject(userId: string, projectId: string, scope?: TokenScope) {
  const rows = await db
    .select()
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.userId, userId), projectFilter(scope)))
    .limit(1);
  return rows[0];
}

export async function getOwnedEnvironment(userId: string, environmentId: string, scope?: TokenScope) {
  const rows = await db
    .select({ env: environments, project: projects })
    .from(environments)
    .innerJoin(projects, eq(environments.projectId, projects.id))
    .where(and(eq(environments.id, environmentId), eq(projects.userId, userId), projectFilter(scope)))
    .limit(1);
  return rows[0];
}

export async function getOwnedVar(userId: string, varId: string, scope?: TokenScope) {
  const rows = await db
    .select({ envVar: envVars, environment: environments })
    .from(envVars)
    .innerJoin(environments, eq(envVars.environmentId, environments.id))
    .innerJoin(projects, eq(environments.projectId, projects.id))
    .where(
      and(
        eq(envVars.id, varId),
        isNull(envVars.deletedAt),
        eq(projects.userId, userId),
        projectFilter(scope),
      ),
    )
    .limit(1);
  return rows[0];
}
