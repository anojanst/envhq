import { getUserId } from "@/lib/auth";
import { getAccessibleProject, isReadOnly } from "@/lib/access";
import { getProjectKeyForUser, createProjectKey } from "@/lib/project-keys";
import { json, badRequest, unauthorized, tokenExpired, notFound, forbidden, conflict } from "@/lib/api";
import { isUniqueViolation } from "@/lib/db-errors";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

/**
 * Registers a wrapped DEK. Two shapes (M6 PR2 + PR6):
 *   - Self-registration (`subjectUserId` omitted): right after project
 *     creation, while the caller's own crypto session is unlocked. Only
 *     needs project access.
 *   - Wrap-for-another-member (`subjectUserId` set, PR6 sharing /
 *     reconciliation): the caller already holds the DEK (implied — they can
 *     only have sealed it client-side if they did) and is delivering a copy
 *     to someone else who's authorized but keyless. Requires the caller to
 *     be at least an editor, and the target to actually be authorized for
 *     the project (checked server-side so a grant can't be forged for an
 *     outsider).
 */
export async function POST(req: Request, { params }: Params) {
  const { userId, expired, scope } = await getUserId(req);
  if (expired) return tokenExpired();
  if (!userId) return unauthorized();
  if (isReadOnly(scope)) return forbidden("This token is read-only.");
  const { id } = await params;

  const body = await req.json().catch(() => null);
  const wrappedDek = typeof body?.wrappedDek === "string" ? body.wrappedDek : "";
  if (!wrappedDek) return badRequest("wrappedDek is required");
  const subjectUserId =
    typeof body?.subjectUserId === "string" && body.subjectUserId ? body.subjectUserId : userId;

  const requiredRole = subjectUserId === userId ? "viewer" : "editor";
  const owned = await getAccessibleProject(userId, id, requiredRole, scope);
  if (!owned) return notFound("Project not found");

  if (subjectUserId !== userId) {
    const targetAccess = await getAccessibleProject(subjectUserId, id, "viewer");
    if (!targetAccess) return forbidden("That user doesn't have access to this project");
  }

  if (await getProjectKeyForUser(id, subjectUserId)) {
    return conflict("A key is already registered for that user on this project");
  }

  try {
    await createProjectKey(id, subjectUserId, wrappedDek, userId);
  } catch (err) {
    // Race: two concurrent registration attempts both passed the pre-check above.
    if (isUniqueViolation(err)) {
      return conflict("A key is already registered for that user on this project");
    }
    throw err;
  }

  return json({ ok: true }, 201);
}
