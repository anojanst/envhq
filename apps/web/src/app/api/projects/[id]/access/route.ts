import { eq } from "drizzle-orm";
import { db } from "@/db";
import { environments } from "@/db/schema";
import { getUserId } from "@/lib/auth";
import { getAccessibleProject, isReadOnly, isRole, type EnvScope, type Role } from "@/lib/access";
import { getClerkOrgRole } from "@/lib/orgs";
import { getGroup } from "@/lib/groups";
import { listGrants, upsertGrant, withGrantNames, type SubjectType } from "@/lib/grants";
import { json, badRequest, unauthorized, tokenExpired, notFound, forbidden } from "@/lib/api";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

const ROLES: Role[] = ["viewer", "editor", "admin"];
const ROLE_RANK: Record<Role, number> = { viewer: 1, editor: 2, admin: 3 };

const INVALID_ENV_SCOPE = Symbol("invalid-env-scope");

/**
 * Validates a *present* `envScope` field's value against the grant's own
 * `role` and the project's actual environment names. `null` or `{}` both
 * mean "no restriction" (returned as `null`, an explicit clear); anything
 * else must be a `{ [envName]: Role }` map where every name is real and every
 * cap role is ≤ the grant's own role. Presence-vs-absence of the field
 * itself is the caller's job — this only interprets a value it's already
 * decided to look at.
 */
function parseRequestEnvScope(
  value: unknown,
  role: Role,
  envNames: Set<string>,
): EnvScope | null | typeof INVALID_ENV_SCOPE {
  if (value === null) return null;
  if (typeof value !== "object" || Array.isArray(value)) return INVALID_ENV_SCOPE;
  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length === 0) return null;

  const scope: EnvScope = {};
  for (const [envName, cap] of entries) {
    if (!envNames.has(envName) || typeof cap !== "string" || !isRole(cap)) return INVALID_ENV_SCOPE;
    if (ROLE_RANK[cap] > ROLE_RANK[role]) return INVALID_ENV_SCOPE; // a cap can't exceed the grant's own role
    scope[envName] = cap;
  }
  return scope;
}

// List who has direct access to this project (admin-only — this is the
// "manage access" view, not something a Viewer/Editor needs to see).
export async function GET(req: Request, { params }: Params) {
  const { userId, expired, scope } = await getUserId(req);
  if (expired) return tokenExpired();
  if (!userId) return unauthorized();
  const { id } = await params;

  const owned = await getAccessibleProject(userId, id, "admin", scope);
  if (!owned) return notFound("Project not found");

  const [grants, envs] = await Promise.all([
    listGrants(id),
    db.select({ id: environments.id, name: environments.name }).from(environments).where(eq(environments.projectId, id)),
  ]);
  return json({ grants: await withGrantNames(grants), environments: envs });
}

// Grant (or update the role of) an existing org member or an org group.
export async function POST(req: Request, { params }: Params) {
  const { userId, expired, scope } = await getUserId(req);
  if (expired) return tokenExpired();
  if (!userId) return unauthorized();
  if (isReadOnly(scope)) return forbidden("This token is read-only.");
  const { id } = await params;

  const owned = await getAccessibleProject(userId, id, "admin", scope);
  if (!owned) return notFound("Project not found");

  const body = await req.json().catch(() => null);
  const subjectType: SubjectType = body?.subjectType === "group" ? "group" : "user";
  const subjectId = typeof body?.subjectId === "string" ? body.subjectId.trim() : "";
  const role = typeof body?.role === "string" ? body.role : "";
  if (!subjectId) return badRequest("subjectId is required");
  if (!ROLES.includes(role as Role)) return badRequest("role must be one of viewer, editor, admin");

  if (subjectType === "user") {
    const memberRole = await getClerkOrgRole(subjectId, owned.project.orgId);
    if (!memberRole) return badRequest("That user isn't a member of this project's org");
  } else {
    const group = await getGroup(owned.project.orgId, subjectId);
    if (!group) return badRequest("That group doesn't belong to this project's org");
  }

  // envScope is optional: absent/omitted from the body leaves an existing
  // grant's restriction untouched (see upsertGrant's doc comment).
  let envScope: EnvScope | null | undefined;
  if (body && typeof body === "object" && "envScope" in body) {
    const envs = await db.select({ name: environments.name }).from(environments).where(eq(environments.projectId, id));
    const parsed = parseRequestEnvScope(body.envScope, role as Role, new Set(envs.map((e) => e.name)));
    if (parsed === INVALID_ENV_SCOPE) {
      return badRequest("envScope must map real environment names to a role no higher than the grant's own role");
    }
    envScope = parsed;
  }

  const grant = await upsertGrant(owned.project.orgId, id, subjectType, subjectId, role as Role, envScope);
  const [named] = await withGrantNames([grant]);
  return json({ grant: named }, 201);
}
