import { getUserId } from "@/lib/auth";
import { isFullAccess } from "@/lib/access";
import { listMyOrgs } from "@/lib/orgs";
import { createTeamOrg } from "@/lib/org-admin";
import { orgRuleResponse, readJson } from "@/lib/org-routes";
import { json, unauthorized, tokenExpired, forbidden } from "@/lib/api";

export const runtime = "nodejs";

// Orgs the caller belongs to — harmless "which orgs am I in" info, no
// scope/role gate beyond being authenticated (same triviality as /api/me).
// Used by the CLI (M5 PR5) to resolve `--org <name>` to an id.
export async function GET(req: Request) {
  const { userId, expired } = await getUserId(req);
  if (expired) return tokenExpired();
  if (!userId) return unauthorized();

  const orgs = await listMyOrgs(userId);
  return json({ orgs });
}

// Create a team. The caller becomes its only admin.
export async function POST(req: Request) {
  const { userId, expired, scope } = await getUserId(req);
  if (expired) return tokenExpired();
  if (!userId) return unauthorized();
  if (!isFullAccess(scope)) return forbidden("This token can't manage teams.");

  const { name } = await readJson(req);
  try {
    const org = await createTeamOrg(userId, name);
    return json({ org: { ...org, role: "admin" } }, 201);
  } catch (err) {
    return orgRuleResponse(err);
  }
}
