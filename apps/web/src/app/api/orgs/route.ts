import { clerkClient } from "@clerk/nextjs/server";
import { getUserId } from "@/lib/auth";
import { json, unauthorized, tokenExpired } from "@/lib/api";

export const runtime = "nodejs";

const ADMIN_ROLE = "org:admin";

// Orgs the caller belongs to — harmless "which orgs am I in" info, no
// scope/role gate beyond being authenticated (same triviality as /api/me).
// Used by the CLI (M5 PR5) to resolve `--org <name>` to an id.
export async function GET(req: Request) {
  const { userId, expired } = await getUserId(req);
  if (expired) return tokenExpired();
  if (!userId) return unauthorized();

  const client = await clerkClient();
  const { data: memberships } = await client.users.getOrganizationMembershipList({ userId });

  const orgs = memberships.map((m) => ({
    id: m.organization.id,
    name: m.organization.name,
    role: m.role === ADMIN_ROLE ? "admin" : "member",
  }));

  return json({ orgs });
}
