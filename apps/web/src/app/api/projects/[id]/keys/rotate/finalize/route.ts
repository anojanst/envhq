import { getUserId } from "@/lib/auth";
import { getAccessibleProject } from "@/lib/access";
import { finalizeRotation } from "@/lib/project-keys";
import { json, badRequest, unauthorized, tokenExpired, notFound, conflict } from "@/lib/api";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

/**
 * The irreversible step of a DEK rotation: swaps every `project_keys` wrap
 * to the new DEK and bumps `projects.keyVersion`. Only proceeds once every
 * `env_vars` row is confirmed re-encrypted and the supplied wrap set exactly
 * matches the project's real current membership (computed server-side) —
 * see `lib/project-keys.ts`'s `finalizeRotation`.
 */
export async function POST(req: Request, { params }: Params) {
  const { userId, expired, scope } = await getUserId(req);
  if (expired) return tokenExpired();
  if (!userId) return unauthorized();
  const { id } = await params;

  const owned = await getAccessibleProject(userId, id, "admin", scope);
  if (!owned) return notFound("Project not found");

  const body = await req.json().catch(() => null);
  const targetKeyVersion = Number(body?.targetKeyVersion);
  const wraps = Array.isArray(body?.wraps) ? body.wraps : null;
  if (!Number.isInteger(targetKeyVersion) || targetKeyVersion <= 0) {
    return badRequest("targetKeyVersion must be a positive integer");
  }
  if (
    !wraps ||
    wraps.some(
      (w: unknown) =>
        typeof w !== "object" ||
        w === null ||
        typeof (w as { subjectUserId?: unknown }).subjectUserId !== "string" ||
        typeof (w as { wrappedDek?: unknown }).wrappedDek !== "string",
    )
  ) {
    return badRequest("wraps must be an array of {subjectUserId, wrappedDek}");
  }

  const result = await finalizeRotation(id, targetKeyVersion, wraps, userId);
  if (!result.ok) {
    if (result.reason === "pending") {
      return conflict(`${result.pendingVarCount} value(s) still need migrating before finalize`);
    }
    return conflict(
      "The supplied key wraps don't match the project's current members — refresh and try again",
    );
  }

  return json({ ok: true });
}
