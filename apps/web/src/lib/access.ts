import { and, asc, desc, eq, exists, inArray, isNotNull, isNull, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { projects, environments, envVars, accessGrants, groupMembers, type Project } from "@/db/schema";
import type { TokenScope } from "@/lib/auth";
import { getOrgRole, listMyOrgs, listOrgAdminUserIds } from "@/lib/orgs";
import { timeDb } from "@/lib/perf";

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
 *
 * `getAccessibleEnvironment`/`getAccessibleVar` additionally cap the
 * resolved role per-environment via each grant's `env_scope` (e.g. a group
 * granted Editor project-wide but capped to Viewer in `prod`) — see
 * `capRoleForEnv`. `getAccessibleProject` has no single environment in
 * scope, so it stays uncapped; project-level actions (rename, delete, manage
 * access) aren't env-scoped.
 */

export type Role = "viewer" | "editor" | "admin";

/** A caller's Clerk role in an org, as `lib/orgs.ts` resolves it. */
type OrgRole = "admin" | "member" | null;

/** Per-env role cap on a grant, e.g. `{ prod: "viewer" }` — env names absent from the map are uncapped. */
export type EnvScope = Partial<Record<string, Role>>;

const ROLE_RANK: Record<Role, number> = { viewer: 1, editor: 2, admin: 3 };

export function isRole(value: string): value is Role {
  return value === "viewer" || value === "editor" || value === "admin";
}

function meetsRole(have: Role, need: Role): boolean {
  return ROLE_RANK[have] >= ROLE_RANK[need];
}

/**
 * Parses the `access_grants.env_scope` text column; malformed JSON (shouldn't
 * happen — we control writes) is treated as no restriction — see the
 * "malformed_env_scope" dimension in `access-matrix.fixtures.json` for why
 * that's a deliberate, tested trade-off rather than an oversight: it never
 * lets a grant exceed its own role, but it does mean a corrupted cap
 * silently stops restricting. Logged (not silent) so corruption is at least
 * visible, without changing the access decision. A bare JSON `null` is a
 * distinct, valid "no cap" encoding and does not log.
 */
export function parseEnvScope(raw: string | null): EnvScope | null {
  if (!raw) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    console.error("access.ts: access_grants.env_scope failed to parse as JSON — treating this grant as uncapped", {
      raw,
    });
    return null;
  }

  if (parsed === null) return null;
  if (typeof parsed !== "object") {
    console.error(
      "access.ts: access_grants.env_scope parsed but is not an object — treating this grant as uncapped",
      { raw },
    );
    return null;
  }
  return parsed as EnvScope;
}

/** Caps `role` down to the grant's env-specific restriction, if `envName` has one. Never escalates. */
function capRoleForEnv(role: Role, envScope: EnvScope | null, envName?: string): Role {
  if (!envName || !envScope) return role;
  const cap = envScope[envName];
  if (!cap) return role;
  return ROLE_RANK[cap] < ROLE_RANK[role] ? cap : role;
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

/**
 * Highest role granted to `userId` on `projectId` via direct or group
 * `access_grants`, or `null`. When `envName` is given, each grant's role is
 * first capped by its own `env_scope` (if it has an entry for that env)
 * before the max is taken — so a group grant capped to viewer-in-prod can't
 * be overridden by an uncapped direct grant unless that direct grant is
 * itself uncapped for `envName`.
 */
async function resolveGrantRole(userId: string, projectId: string, envName?: string): Promise<Role | null> {
  const direct = await db
    .select({ role: accessGrants.role, envScope: accessGrants.envScope })
    .from(accessGrants)
    .where(
      and(
        eq(accessGrants.projectId, projectId),
        eq(accessGrants.subjectType, "user"),
        eq(accessGrants.subjectId, userId),
      ),
    );

  const viaGroup = await db
    .select({ role: accessGrants.role, envScope: accessGrants.envScope })
    .from(accessGrants)
    .innerJoin(
      groupMembers,
      and(eq(groupMembers.userId, userId), sql`${accessGrants.subjectId} = ${groupMembers.groupId}::text`),
    )
    .where(and(eq(accessGrants.projectId, projectId), eq(accessGrants.subjectType, "group")));

  let best: Role | null = null;
  for (const { role, envScope } of [...direct, ...viaGroup]) {
    if (!isRole(role)) continue;
    const effective = capRoleForEnv(role, parseEnvScope(envScope), envName);
    if (!best || ROLE_RANK[effective] > ROLE_RANK[best]) best = effective;
  }
  return best;
}

/** Clerk org admin/owner ⇒ `"admin"` outright (unaffected by env_scope — org admins are always full access); else the highest `access_grants` role for `envName`, or `null`. */
async function resolveRole(userId: string, orgId: string, projectId: string, envName?: string): Promise<Role | null> {
  if ((await getOrgRole(userId, orgId)) === "admin") return "admin";
  return resolveGrantRole(userId, projectId, envName);
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

  const role = await resolveRole(userId, row.project.orgId, row.project.id, row.env.name);
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

  const role = await resolveRole(userId, row.project.orgId, row.project.id, row.environment.name);
  if (!role || !meetsRole(role, requiredRole)) return undefined;
  return { envVar: row.envVar, environment: row.environment, role };
}

/**
 * The single definition of "this caller has a grant on this project" (RM-7).
 *
 * A correlated EXISTS rather than a separate id lookup: it keeps project
 * visibility inside the one query that selects the projects, which is what
 * lets the dashboard stop issuing three queries per org. Direct user grants
 * and group-derived grants are the same two rules as before — the left join
 * to `group_members` resolves the caller's group membership, and
 * `isNotNull(groupMembers.userId)` is what makes a group grant count only
 * when they are actually in that group.
 *
 * `access_grants.subject_id` is text and `group_members.group_id` is uuid,
 * hence the cast — same as the query this replaces.
 *
 * The `orgId` equality is not redundant. A grant row carries its own
 * `org_id`, and the code this replaces required BOTH the grant and the
 * project to match the org being listed. Dropping it here would widen the
 * rule, so it stays, and stays visible.
 */
function grantedToCaller(userId: string) {
  return exists(
    db
      .select({ ok: sql`1` })
      .from(accessGrants)
      .leftJoin(
        groupMembers,
        and(
          eq(groupMembers.userId, userId),
          sql`${accessGrants.subjectId} = ${groupMembers.groupId}::text`,
        ),
      )
      .where(
        and(
          eq(accessGrants.projectId, projects.id),
          eq(accessGrants.orgId, projects.orgId),
          or(
            and(eq(accessGrants.subjectType, "user"), eq(accessGrants.subjectId, userId)),
            and(eq(accessGrants.subjectType, "group"), isNotNull(groupMembers.userId)),
          ),
        ),
      ),
  );
}

/**
 * Which projects *within a single org* the caller can see: everything if they
 * are a Clerk org admin/owner, else only projects they hold a grant on.
 *
 * Always combined with an explicit `projects.orgId` predicate by its callers —
 * this function deliberately does not scope the org itself, so that the org
 * filter is written at each call site where it can be seen, rather than
 * hidden one level down. RM-7's gotcha is that a dropped scoping predicate
 * here leaks another org's projects.
 */
function visibleInOrg(userId: string, orgId: string, role: OrgRole) {
  const inThisOrg = eq(projects.orgId, orgId);
  return role === "admin" ? inThisOrg : and(inThisOrg, grantedToCaller(userId));
}

/** Every project in `orgId` the caller can see: all of them if org admin, else only ones with an `access_grants` row. */
export async function listAccessibleProjects(userId: string, orgId: string, scope?: TokenScope): Promise<Project[]> {
  const role = await getOrgRole(userId, orgId);
  return db
    .select()
    .from(projects)
    .where(and(visibleInOrg(userId, orgId, role), projectFilter(scope)))
    .orderBy(desc(projects.createdAt), asc(projects.id));
}

/**
 * Dashboard-shaped variant of `listAccessibleProjects`: one row per
 * (project, environment) pair, newest project first / oldest env first —
 * matches the shape `app/(app)/dashboard/page.tsx` groups client-side into
 * `ProjectListItem[]`, so that grouping code doesn't need to change.
 */
export async function listAccessibleProjectsWithEnvs(userId: string, orgId: string) {
  const role = await getOrgRole(userId, orgId);
  return db
    .select({
      id: projects.id,
      name: projects.name,
      createdAt: projects.createdAt,
      envName: environments.name,
    })
    .from(projects)
    .leftJoin(environments, eq(environments.projectId, projects.id))
    .where(visibleInOrg(userId, orgId, role))
    .orderBy(desc(projects.createdAt), asc(projects.id), asc(environments.createdAt));
}

/**
 * Every userId with access to a project (M6 PR6): org admins/owners (who
 * bypass `access_grants` entirely per `resolveRole`'s automatic-admin rule,
 * so they don't otherwise show up here) + direct user grants + group
 * members via a group grant. This is the *authorization* view, used only to
 * drive DEK-wrap reconciliation — it says nothing about who currently holds
 * a usable key (`project_keys` is the separate, derived source of truth for
 * that).
 */
export async function listAccessibleUserIds(orgId: string, projectId: string): Promise<string[]> {
  const [admins, direct, viaGroup] = await Promise.all([
    listOrgAdminUserIds(orgId),
    db
      .select({ id: accessGrants.subjectId })
      .from(accessGrants)
      .where(and(eq(accessGrants.projectId, projectId), eq(accessGrants.subjectType, "user"))),
    db
      .select({ id: groupMembers.userId })
      .from(accessGrants)
      .innerJoin(groupMembers, sql`${accessGrants.subjectId} = ${groupMembers.groupId}::text`)
      .where(and(eq(accessGrants.projectId, projectId), eq(accessGrants.subjectType, "group"))),
  ]);
  return [...new Set([...admins, ...direct.map((r) => r.id), ...viaGroup.map((r) => r.id)])];
}

/**
 * Every project the caller can access across every org they belong to — the
 * dashboard's cross-org "all my projects" view.
 *
 * ONE query, regardless of how many orgs the caller belongs to (RM-7). It
 * used to run `listAccessibleProjectsWithEnvs` once per membership, and each
 * of those was itself three queries, so a six-org user paid eighteen; the
 * measured slope was three queries per org (docs/PERF_BASELINE.md).
 *
 * The caller's orgs are split by role first, because the two halves are
 * different rules: in an org where they are a Clerk admin they see every
 * project, and elsewhere they see only what they hold a grant on. Both halves
 * carry their own `projects.orgId` restriction, so a project can only ever be
 * returned via an org this caller is actually in.
 *
 * Org *names* still come from Clerk (`listMyOrgs`) rather than the database —
 * we don't mirror them — which is why the rows are decorated afterwards.
 */
export async function listAccessibleProjectsWithEnvsAcrossOrgs(userId: string) {
  return timeDb("listAccessibleProjectsWithEnvsAcrossOrgs", async () => {
    const orgs = await listMyOrgs(userId);
    if (orgs.length === 0) return [];

    const adminOrgIds = orgs.filter((o) => o.role === "admin").map((o) => o.id);
    const grantOrgIds = orgs.filter((o) => o.role !== "admin").map((o) => o.id);

    const visible = [
      adminOrgIds.length > 0 ? inArray(projects.orgId, adminOrgIds) : undefined,
      grantOrgIds.length > 0
        ? and(inArray(projects.orgId, grantOrgIds), grantedToCaller(userId))
        : undefined,
    ].filter((c) => c !== undefined);

    // Belt and braces. `or()` of nothing is `undefined`, and a `.where(undefined)`
    // is a query with no WHERE clause at all — which on this table would return
    // every project in the system. `orgs.length > 0` already guarantees at least
    // one branch, so this is unreachable; it is here because the failure mode is
    // a cross-tenant leak and "unreachable" is not the same as "impossible".
    //
    // Excluded from coverage rather than left to drag the floor down: there is
    // no input that reaches it, so a test for it would have to be a lie.
    /* v8 ignore next */
    if (visible.length === 0) return [];

    const rows = await db
      .select({
        id: projects.id,
        name: projects.name,
        createdAt: projects.createdAt,
        orgId: projects.orgId,
        envName: environments.name,
      })
      .from(projects)
      .leftJoin(environments, eq(environments.projectId, projects.id))
      .where(or(...visible))
      // `projects.id` breaks ties on `createdAt`: rows inserted in one
      // statement share a `now()`, so without it the dashboard's order is
      // arbitrary between them and tests flake.
      .orderBy(desc(projects.createdAt), asc(projects.id), asc(environments.createdAt));

    // Every returned row's org is one of `orgs` by construction — that is the
    // only thing `visible` lets through — so the lookup cannot miss. Asserted
    // rather than given a fallback that could never fire.
    const orgNameById = new Map(orgs.map((o) => [o.id, o.name]));
    return rows.map((r) => ({ ...r, orgName: orgNameById.get(r.orgId)! }));
  });
}
