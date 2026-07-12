import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { projects, environments, envVars, accessGrants, groupMembers, type Project } from "@/db/schema";
import type { TokenScope } from "@/lib/auth";
import { getClerkOrgRole, listMyOrgs } from "@/lib/orgs";

/**
 * Org-role-scoped lookups (M5). Every read/write path goes through one of
 * these so a caller can only ever touch rows in a project they have a role
 * in — resolved via Clerk org admin/owner (automatic full access) or an
 * `access_grants` row (direct or via a group), highest role wins. Each
 * returns the row + resolved role, or `undefined` if the resource doesn't
 * exist OR the caller's role doesn't meet `requiredRole` — callers treat
 * `undefined` as 404 either way, so a Viewer probing something they can see
 * but can't edit doesn't learn more than a stranger would.
 *
 * A `scope` may be passed for project-scoped CLI tokens (PATs): when
 * `scope.projectId` is set, anything outside that project resolves to
 * `undefined` too, so a scoped token 404s on other projects. `isReadOnly`/
 * `isFullAccess` are a separate, orthogonal gate on token *capability*
 * (read vs write), unrelated to org role.
 */

export type Role = "viewer" | "editor" | "admin";

const ROLE_RANK: Record<Role, number> = { viewer: 1, editor: 2, admin: 3 };

function isRole(value: string): value is Role {
  return value === "viewer" || value === "editor" || value === "admin";
}

function meetsRole(have: Role, need: Role): boolean {
  return ROLE_RANK[have] >= ROLE_RANK[need];
}

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

/** Highest role granted to `userId` on `projectId` via direct or group `access_grants`, or `null`. */
async function resolveGrantRole(userId: string, projectId: string): Promise<Role | null> {
  const direct = await db
    .select({ role: accessGrants.role })
    .from(accessGrants)
    .where(
      and(
        eq(accessGrants.projectId, projectId),
        eq(accessGrants.subjectType, "user"),
        eq(accessGrants.subjectId, userId),
      ),
    );

  const viaGroup = await db
    .select({ role: accessGrants.role })
    .from(accessGrants)
    .innerJoin(
      groupMembers,
      and(eq(groupMembers.userId, userId), sql`${accessGrants.subjectId} = ${groupMembers.groupId}::text`),
    )
    .where(and(eq(accessGrants.projectId, projectId), eq(accessGrants.subjectType, "group")));

  let best: Role | null = null;
  for (const { role } of [...direct, ...viaGroup]) {
    if (isRole(role) && (!best || ROLE_RANK[role] > ROLE_RANK[best])) best = role;
  }
  return best;
}

/** Clerk org admin/owner ⇒ `"admin"` outright; else the highest `access_grants` role, or `null`. */
async function resolveRole(userId: string, orgId: string, projectId: string): Promise<Role | null> {
  if ((await getClerkOrgRole(userId, orgId)) === "admin") return "admin";
  return resolveGrantRole(userId, projectId);
}

export async function getAccessibleProject(
  userId: string,
  projectId: string,
  requiredRole: Role = "viewer",
  scope?: TokenScope,
): Promise<{ project: Project; role: Role } | undefined> {
  const rows = await db
    .select()
    .from(projects)
    .where(and(eq(projects.id, projectId), projectFilter(scope)))
    .limit(1);
  const project = rows[0];
  if (!project) return undefined;

  const role = await resolveRole(userId, project.orgId, project.id);
  if (!role || !meetsRole(role, requiredRole)) return undefined;
  return { project, role };
}

export async function getAccessibleEnvironment(
  userId: string,
  environmentId: string,
  requiredRole: Role = "viewer",
  scope?: TokenScope,
) {
  const rows = await db
    .select({ env: environments, project: projects })
    .from(environments)
    .innerJoin(projects, eq(environments.projectId, projects.id))
    .where(and(eq(environments.id, environmentId), projectFilter(scope)))
    .limit(1);
  const row = rows[0];
  if (!row) return undefined;

  const role = await resolveRole(userId, row.project.orgId, row.project.id);
  if (!role || !meetsRole(role, requiredRole)) return undefined;
  return { env: row.env, project: row.project, role };
}

export async function getAccessibleVar(
  userId: string,
  varId: string,
  requiredRole: Role = "viewer",
  scope?: TokenScope,
) {
  const rows = await db
    .select({ envVar: envVars, environment: environments, project: projects })
    .from(envVars)
    .innerJoin(environments, eq(envVars.environmentId, environments.id))
    .innerJoin(projects, eq(environments.projectId, projects.id))
    .where(and(eq(envVars.id, varId), isNull(envVars.deletedAt), projectFilter(scope)))
    .limit(1);
  const row = rows[0];
  if (!row) return undefined;

  const role = await resolveRole(userId, row.project.orgId, row.project.id);
  if (!role || !meetsRole(role, requiredRole)) return undefined;
  return { envVar: row.envVar, environment: row.environment, role };
}

/**
 * Resolves which project ids in `orgId` the caller can see: `"all"` if
 * they're a Clerk org admin/owner, else the explicit list of projects with a
 * direct or group `access_grants` row. Shared by `listAccessibleProjects`
 * and `listAccessibleProjectsWithEnvs` so both apply the same visibility
 * rule without duplicating the admin/grant resolution.
 */
async function resolveAccessibleProjectIds(userId: string, orgId: string): Promise<"all" | string[]> {
  if ((await getClerkOrgRole(userId, orgId)) === "admin") return "all";

  const direct = db
    .select({ id: accessGrants.projectId })
    .from(accessGrants)
    .where(and(eq(accessGrants.orgId, orgId), eq(accessGrants.subjectType, "user"), eq(accessGrants.subjectId, userId)));
  const viaGroup = db
    .select({ id: accessGrants.projectId })
    .from(accessGrants)
    .innerJoin(
      groupMembers,
      and(eq(groupMembers.userId, userId), sql`${accessGrants.subjectId} = ${groupMembers.groupId}::text`),
    )
    .where(and(eq(accessGrants.orgId, orgId), eq(accessGrants.subjectType, "group")));

  const [directRows, groupRows] = await Promise.all([direct, viaGroup]);
  return [...new Set([...directRows, ...groupRows].map((r) => r.id))];
}

/** Every project in `orgId` the caller can see: all of them if org admin, else only ones with an `access_grants` row. */
export async function listAccessibleProjects(userId: string, orgId: string, scope?: TokenScope): Promise<Project[]> {
  const ids = await resolveAccessibleProjectIds(userId, orgId);
  if (ids !== "all" && ids.length === 0) return [];

  return db
    .select()
    .from(projects)
    .where(
      and(eq(projects.orgId, orgId), ids === "all" ? undefined : inArray(projects.id, ids), projectFilter(scope)),
    )
    .orderBy(desc(projects.createdAt));
}

/**
 * Dashboard-shaped variant of `listAccessibleProjects`: one row per
 * (project, environment) pair, newest project first / oldest env first —
 * matches the shape `app/(app)/dashboard/page.tsx` groups client-side into
 * `ProjectListItem[]`, so that grouping code doesn't need to change.
 */
export async function listAccessibleProjectsWithEnvs(userId: string, orgId: string) {
  const ids = await resolveAccessibleProjectIds(userId, orgId);
  if (ids !== "all" && ids.length === 0) return [];

  return db
    .select({
      id: projects.id,
      name: projects.name,
      createdAt: projects.createdAt,
      envName: environments.name,
    })
    .from(projects)
    .leftJoin(environments, eq(environments.projectId, projects.id))
    .where(and(eq(projects.orgId, orgId), ids === "all" ? undefined : inArray(projects.id, ids)))
    .orderBy(desc(projects.createdAt), asc(environments.createdAt));
}

/**
 * Every project the caller can access across every org they belong to —
 * the dashboard's cross-org "all my projects" view. Orchestrates
 * `listAccessibleProjectsWithEnvs` once per org membership (no new query
 * shape, just run per org and merged) and tags each row with its org's id
 * + name so same-named projects across orgs stay distinguishable.
 */
export async function listAccessibleProjectsWithEnvsAcrossOrgs(userId: string) {
  const orgs = await listMyOrgs(userId);
  const perOrg = await Promise.all(
    orgs.map(async (org) => {
      const rows = await listAccessibleProjectsWithEnvs(userId, org.id);
      return rows.map((r) => ({ ...r, orgId: org.id, orgName: org.name }));
    }),
  );
  return perOrg.flat().sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}
