import { getUserId } from "@/lib/auth";
import { getAccessibleProject } from "@/lib/access";
import { listGroups } from "@/lib/groups";
import { json, unauthorized, tokenExpired, notFound } from "@/lib/api";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

/**
 * Groups eligible to be granted access to this project — the Access page's
 * group picker source. Deliberately project-scoped rather than a generic
 * "my org's groups" call: resolving org from `owned.project.orgId` (same
 * pattern as `access/members/route.ts`) means this is always correct
 * regardless of which org context the caller happens to be browsing —
 * `/api/groups` takes its own explicit `orgId`, which a naive reuse here
 * could easily mismatch against the project actually being shared.
 */
export async function GET(req: Request, { params }: Params) {
  const { userId, expired, scope } = await getUserId(req);
  if (expired) return tokenExpired();
  if (!userId) return unauthorized();
  const { id } = await params;

  const owned = await getAccessibleProject(userId, id, "admin", scope);
  if (!owned) return notFound("Project not found");

  const groups = await listGroups(owned.project.orgId);
  return json({ groups });
}
