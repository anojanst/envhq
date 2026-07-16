import { getUserId } from "@/lib/auth";
import { resolveRequestedOrgId, getClerkOrgRole } from "@/lib/orgs";
import { listGroups, createGroup } from "@/lib/groups";
import { json, badRequest, unauthorized, tokenExpired, forbidden, conflict } from "@/lib/api";

export const runtime = "nodejs";

/** Postgres unique_violation error code. */
const UNIQUE_VIOLATION = "23505";

// Groups are org-level; every route in this file/subtree is gated on Clerk
// org admin, not a project role — there's no project in scope. An explicit
// orgId (query param for GET, body for POST) names which org; omitting it
// falls back to the personal org — same pattern as api/projects/route.ts.
// There's no session-level "active org" to fall back to first anymore (the
// web sidebar's org switcher was removed — Settings > Groups now sends its
// own page-local `?org=` selection through explicitly).
export async function GET(req: Request) {
  const { userId, expired } = await getUserId(req);
  if (expired) return tokenExpired();
  if (!userId) return unauthorized();

  const requestedOrgId = new URL(req.url).searchParams.get("orgId");
  const orgId = await resolveRequestedOrgId(userId, requestedOrgId);
  if (!orgId || (await getClerkOrgRole(userId, orgId)) !== "admin") return forbidden();

  const groups = await listGroups(orgId);
  return json({ groups });
}

export async function POST(req: Request) {
  const { userId, expired } = await getUserId(req);
  if (expired) return tokenExpired();
  if (!userId) return unauthorized();

  const body = await req.json().catch(() => null);
  const requestedOrgId = typeof body?.orgId === "string" ? body.orgId : null;
  const orgId = await resolveRequestedOrgId(userId, requestedOrgId);
  if (!orgId || (await getClerkOrgRole(userId, orgId)) !== "admin") return forbidden();

  const name = typeof body?.name === "string" ? body.name.trim() : "";
  if (!name) return badRequest("name is required");

  try {
    const group = await createGroup(orgId, name);
    return json({ group }, 201);
  } catch (err) {
    if (typeof err === "object" && err !== null && "code" in err && err.code === UNIQUE_VIOLATION) {
      return conflict(`A group named "${name}" already exists.`);
    }
    throw err;
  }
}
