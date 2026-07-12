import { getUserId, resolveDisplayNames } from "@/lib/auth";
import { getAccessibleProject, isReadOnly, type Role } from "@/lib/access";
import { getClerkOrgRole } from "@/lib/orgs";
import { getGroup, getGroupNames } from "@/lib/groups";
import { listGrants, upsertGrant, type SubjectType } from "@/lib/grants";
import { json, badRequest, unauthorized, tokenExpired, notFound, forbidden } from "@/lib/api";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

const ROLES: Role[] = ["viewer", "editor", "admin"];

/** Resolve each grant's display name — a Clerk user lookup or a `groups` row, depending on subjectType. */
async function withNames(grants: Awaited<ReturnType<typeof listGrants>>) {
  const userIds = grants.filter((g) => g.subjectType === "user").map((g) => g.subjectId);
  const groupIds = grants.filter((g) => g.subjectType === "group").map((g) => g.subjectId);
  const [userNames, groupNames] = await Promise.all([resolveDisplayNames(userIds), getGroupNames(groupIds)]);
  const names = { ...userNames, ...groupNames };
  return grants.map((g) => ({ ...g, name: names[g.subjectId] ?? g.subjectId }));
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

  const grants = await listGrants(id);
  return json({ grants: await withNames(grants) });
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

  const grant = await upsertGrant(owned.project.orgId, id, subjectType, subjectId, role as Role);
  const [named] = await withNames([grant]);
  return json({ grant: named }, 201);
}
