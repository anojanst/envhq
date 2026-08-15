import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { projects, environments } from "@/db/schema";
import { getUserId } from "@/lib/auth";
import { isFullAccess, isRole, listAccessibleProjects, type Role } from "@/lib/access";
import { resolveRequestedOrgId, getClerkOrgRole } from "@/lib/orgs";
import { getGroup } from "@/lib/groups";
import { upsertGrant, type SubjectType } from "@/lib/grants";
import { json, badRequest, unauthorized, tokenExpired, forbidden, conflict } from "@/lib/api";
import { isUniqueViolation } from "@/lib/db-errors";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const { userId, expired, scope } = await getUserId(req);
  if (expired) return tokenExpired();
  if (!userId) return unauthorized();

  // CLI-only route (the web dashboard reads projects via lib/access.ts
  // directly, not this endpoint) — an explicit ?orgId= names which org
  // (the CLI's `--org` flag, M5 PR5), else the personal-org default. No
  // session-level "active org" to prefer anymore.
  const requestedOrgId = new URL(req.url).searchParams.get("orgId");
  const orgId = await resolveRequestedOrgId(userId, requestedOrgId);
  if (!orgId) return forbidden("You're not a member of that org.");

  const rows = await listAccessibleProjects(userId, orgId, scope);

  return json({ projects: rows });
}

export async function POST(req: Request) {
  const { userId, expired, scope } = await getUserId(req);
  if (expired) return tokenExpired();
  if (!userId) return unauthorized();
  if (!isFullAccess(scope)) return forbidden("This token can't create projects.");

  const body = await req.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  if (!name) return badRequest("name is required");

  // An explicit body orgId names which org — the "New project" dialog always
  // sends one (the user picks explicitly rather than it being silently
  // assigned from whatever org happened to be active); the personal-org
  // default only really applies to the CLI omitting `--org`.
  const requestedOrgId = typeof body?.orgId === "string" ? body.orgId : null;
  const orgId = await resolveRequestedOrgId(userId, requestedOrgId);
  if (!orgId) return forbidden("You're not a member of that org.");

  // Optional grants to issue alongside creation — the "New project" dialog's
  // collapsible "Add people" section. Validated up front (same rules as
  // POST /api/projects/[id]/access: subject must actually belong to the
  // org) so a bad entry fails before the project is created, not after.
  const rawGrants = Array.isArray(body?.grants) ? body.grants : [];
  const grantInputs: { subjectType: SubjectType; subjectId: string; role: Role }[] = [];
  for (const g of rawGrants as unknown[]) {
    const grant = g as { subjectType?: unknown; subjectId?: unknown; role?: unknown } | null;
    const subjectType: SubjectType = grant?.subjectType === "group" ? "group" : "user";
    const subjectId = typeof grant?.subjectId === "string" ? grant.subjectId.trim() : "";
    const role = typeof grant?.role === "string" ? grant.role : "";
    if (!subjectId || !isRole(role)) return badRequest("Each grant needs a subjectId and a valid role");
    if (subjectType === "user") {
      if (!(await getClerkOrgRole(subjectId, orgId))) return badRequest("A granted user isn't a member of this org");
    } else {
      if (!(await getGroup(orgId, subjectId))) return badRequest("A granted group doesn't belong to this org");
    }
    grantInputs.push({ subjectType, subjectId, role });
  }

  // Default a new project to a single "dev" environment; callers (e.g. the CLI)
  // may pass an explicit list. An empty array opts out entirely.
  const envNames: string[] = Array.isArray(body?.environments)
    ? Array.from(
        new Set(
          (body.environments as unknown[]).map((e) => String(e).trim()).filter(Boolean),
        ),
      )
    : ["dev"];

  const existing = await db
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.orgId, orgId), eq(projects.name, name)))
    .limit(1);
  if (existing.length > 0) return conflict(`A project named "${name}" already exists.`);

  let project;
  try {
    [project] = await db.insert(projects).values({ userId, orgId, name }).returning();
  } catch (err) {
    if (isUniqueViolation(err)) {
      return conflict(`A project named "${name}" already exists.`);
    }
    throw err;
  }

  const createdEnvs =
    envNames.length > 0
      ? await db
          .insert(environments)
          .values(envNames.map((envName) => ({ projectId: project.id, name: envName })))
          .returning()
      : [];

  // The creator always gets an explicit admin grant — without it, a caller
  // who isn't a Clerk org admin (any regular org "member") would have zero
  // access to the project they just created, since role resolution has
  // nothing else to fall back on.
  await Promise.all([
    upsertGrant(orgId, project.id, "user", userId, "admin"),
    ...grantInputs.map((g) => upsertGrant(orgId, project.id, g.subjectType, g.subjectId, g.role)),
  ]);

  return json({ project, environments: createdEnvs }, 201);
}
