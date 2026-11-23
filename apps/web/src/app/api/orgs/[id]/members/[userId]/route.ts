import { removeMember, setMemberRole } from "@/lib/org-admin";
import { orgGate, orgRuleResponse, readJson } from "@/lib/org-routes";
import { json, forbidden } from "@/lib/api";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string; userId: string }> };

// Change a member's role. Admin only; a team always keeps one admin.
export async function PATCH(req: Request, { params }: Params) {
  const { id, userId } = await params;
  const gate = await orgGate(req, id, { admin: true, write: true });
  if (gate instanceof Response) return gate;
  const { role } = await readJson(req);
  try {
    await setMemberRole(id, userId, role);
    return json({ ok: true });
  } catch (err) {
    return orgRuleResponse(err);
  }
}

// Remove a member, or leave (when `userId` is the caller). Removing takes the
// member's grants, group memberships and key wraps in this team with it.
export async function DELETE(req: Request, { params }: Params) {
  const { id, userId } = await params;
  const gate = await orgGate(req, id, { write: true });
  if (gate instanceof Response) return gate;
  if (gate.userId !== userId && gate.role !== "admin") {
    return forbidden("Only a team admin can remove someone else.");
  }
  try {
    await removeMember(id, userId);
    return json({ ok: true });
  } catch (err) {
    return orgRuleResponse(err);
  }
}
