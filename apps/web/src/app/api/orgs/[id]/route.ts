import { deleteTeamOrg, renameOrg } from "@/lib/org-admin";
import { orgGate, orgRuleResponse, readJson } from "@/lib/org-routes";
import { json } from "@/lib/api";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

// Rename a team (or your personal workspace). Admin only.
export async function PATCH(req: Request, { params }: Params) {
  const { id } = await params;
  const gate = await orgGate(req, id, { admin: true, write: true });
  if (gate instanceof Response) return gate;
  const { name } = await readJson(req);
  try {
    await renameOrg(id, name);
    return json({ ok: true });
  } catch (err) {
    return orgRuleResponse(err);
  }
}

// Delete a team. Admin only; refused while it owns projects, and never for a personal workspace.
export async function DELETE(req: Request, { params }: Params) {
  const { id } = await params;
  const gate = await orgGate(req, id, { admin: true, write: true });
  if (gate instanceof Response) return gate;
  try {
    await deleteTeamOrg(id);
    return json({ ok: true });
  } catch (err) {
    return orgRuleResponse(err);
  }
}
