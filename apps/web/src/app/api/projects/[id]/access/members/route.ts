import { clerkClient } from "@clerk/nextjs/server";
import { getUserId } from "@/lib/auth";
import { getAccessibleProject } from "@/lib/access";
import { json, unauthorized, tokenExpired, notFound } from "@/lib/api";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

// Org members eligible to be granted access — the Share dialog's picker
// source. Admin-only: this is part of the "manage access" surface, and
// listing the whole org's membership isn't something a Viewer/Editor needs.
export async function GET(req: Request, { params }: Params) {
  const { userId, expired, scope } = await getUserId(req);
  if (expired) return tokenExpired();
  if (!userId) return unauthorized();
  const { id } = await params;

  const owned = await getAccessibleProject(userId, id, "admin", scope);
  if (!owned) return notFound("Project not found");

  const client = await clerkClient();
  const { data: memberships } = await client.organizations.getOrganizationMembershipList({
    organizationId: owned.project.orgId,
  });

  const members = memberships
    .filter((m) => m.publicUserData)
    .map((m) => ({
      userId: m.publicUserData!.userId,
      name: m.publicUserData!.firstName || m.publicUserData!.identifier,
      email: m.publicUserData!.identifier,
      imageUrl: m.publicUserData!.imageUrl,
    }));

  return json({ members });
}
