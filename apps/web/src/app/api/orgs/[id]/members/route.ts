import { listOrgMembers } from "@/lib/orgs";
import { describeMembers } from "@/lib/user-profiles";
import { orgGate } from "@/lib/org-routes";
import { json } from "@/lib/api";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

// Everyone in a team, with their role. Any member may look — knowing who
// you share a team with isn't privileged; changing it is.
export async function GET(req: Request, { params }: Params) {
  const { id } = await params;
  const gate = await orgGate(req, id);
  if (gate instanceof Response) return gate;
  const members = await listOrgMembers(id);
  const described = await describeMembers(members);
  return json({ members: described.map((d, i) => ({ ...d, role: members[i]!.role })) });
}
