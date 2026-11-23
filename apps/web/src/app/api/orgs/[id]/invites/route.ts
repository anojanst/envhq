import { createInvite, listPendingInvites } from "@/lib/org-admin";
import { orgGate, orgRuleResponse, readJson } from "@/lib/org-routes";
import { json } from "@/lib/api";
import { publicUrl } from "@/lib/public-url";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

const view = (i: { id: string; role: string; createdAt: Date; expiresAt: Date }) => ({
  id: i.id,
  role: i.role,
  createdAt: i.createdAt.toISOString(),
  expiresAt: i.expiresAt.toISOString(),
});

// Pending invite links (never their tokens). Admin only.
export async function GET(req: Request, { params }: Params) {
  const { id } = await params;
  const gate = await orgGate(req, id, { admin: true });
  if (gate instanceof Response) return gate;
  return json({ invites: (await listPendingInvites(id)).map(view) });
}

// Create a single-use invite link. The link is in this response and nowhere else.
export async function POST(req: Request, { params }: Params) {
  const { id } = await params;
  const gate = await orgGate(req, id, { admin: true, write: true });
  if (gate instanceof Response) return gate;
  const { role } = await readJson(req);
  try {
    const invite = await createInvite(id, gate.userId, role ?? "member");
    const url = publicUrl(`/invite/${invite.token}`, req.url).toString();
    return json({ invite: view(invite), url }, 201);
  } catch (err) {
    return orgRuleResponse(err);
  }
}
