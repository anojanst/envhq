import { getUserId } from "@/lib/auth";
import { getAccessibleProject, isReadOnly } from "@/lib/access";
import { revokeDeployKey } from "@/lib/deploy-keys";
import { json, unauthorized, tokenExpired, notFound, forbidden } from "@/lib/api";
import { withPerf } from "@/lib/perf";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string; keyId: string }> };

/**
 * Revokes a deploy key: its wrap, its token and its row, in one action
 * (ADR-020 — leaving any one of them behind is a live credential), and flags
 * the project for rotation.
 *
 * Revocation alone does not make the customer safe, and the UI says so:
 * it stops future fetches but does nothing about ciphertext the holder
 * already copied, which they can decrypt at leisure with the key they still
 * have. Rotating the project DEK afterwards is mandatory, not advisory.
 */
export async function DELETE(req: Request, ctx: Params) {
  return withPerf("api/projects/[id]/deploy-keys/[keyId]", () => handleDelete(req, ctx));
}

async function handleDelete(req: Request, { params }: Params) {
  const { userId, expired, scope } = await getUserId(req);
  if (expired) return tokenExpired();
  if (!userId) return unauthorized();
  if (isReadOnly(scope)) return forbidden("This token is read-only.");
  const { id, keyId } = await params;

  const owned = await getAccessibleProject(userId, id, "admin", scope);
  if (!owned) return notFound("Project not found");

  const revoked = await revokeDeployKey(id, keyId, userId);
  if (!revoked) return notFound("Deploy key not found");

  return json({ ok: true, rotationRequired: true });
}
