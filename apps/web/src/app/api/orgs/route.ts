import { getUserId } from "@/lib/auth";
import { listMyOrgs } from "@/lib/orgs";
import { json, unauthorized, tokenExpired } from "@/lib/api";

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
