import { revokeInvite } from "@/lib/org-admin";
import { orgGate } from "@/lib/org-routes";
import { json, notFound } from "@/lib/api";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string; inviteId: string }> };

// Revoke a pending invite link. Admin only.
export async function DELETE(req: Request, { params }: Params) {
  const { id, inviteId } = await params;
  const gate = await orgGate(req, id, { admin: true, write: true });
  if (gate instanceof Response) return gate;
  if (!(await revokeInvite(id, inviteId))) return notFound("Invite not found");
  return json({ ok: true });
}
