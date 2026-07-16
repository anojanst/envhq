import { eq } from "drizzle-orm";
import { clerkClient } from "@clerk/nextjs/server";
import { db } from "@/db";
import { personalOrgs } from "@/db/schema";

/** Marks a Clerk Organization as auto-provisioned (not user-created). */
const PERSONAL_ORG_METADATA = { personal: true } as const;

const ADMIN_ROLE = "org:admin";

/**
 * Finds a user's personal org if one already exists, else creates it.
 *
 * Race safety: two concurrent first-requests for a brand-new user (e.g. a
 * dashboard load racing a CLI token exchange) could both miss the
 * `personalOrgs` lookup and each create a Clerk org. The `INSERT ... ON
 * CONFLICT (user_id) DO NOTHING RETURNING org_id` below is the atomic
 * tie-breaker: whichever insert wins is "the" personal org from then on:
 * the loser's row never lands, and the loser re-reads the winner's org id.
 * The loser's Clerk org becomes a harmless orphan (never referenced by our
 * DB) — an acceptable cost for a rare race, and cheaper than a Clerk API
 * call to check-before-create on every request.
 */
export async function getOrCreatePersonalOrg(userId: string): Promise<string> {
  const existing = await db
    .select({ orgId: personalOrgs.orgId })
    .from(personalOrgs)
    .where(eq(personalOrgs.userId, userId))
    .limit(1);
  if (existing[0]) return existing[0].orgId;

  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  const name = user.firstName || user.username || "Personal";
  const org = await client.organizations.createOrganization({
    name,
    createdBy: userId,
    privateMetadata: PERSONAL_ORG_METADATA,
  });

  const inserted = await db
    .insert(personalOrgs)
    .values({ userId, orgId: org.id })
    .onConflictDoNothing({ target: personalOrgs.userId })
    .returning({ orgId: personalOrgs.orgId });
  if (inserted[0]) return inserted[0].orgId;

  // Lost the race — someone else's insert won between our lookup and here.
  const winner = await db
    .select({ orgId: personalOrgs.orgId })
    .from(personalOrgs)
    .where(eq(personalOrgs.userId, userId))
    .limit(1);
  return winner[0]!.orgId;
}

/** Alias — the org used for account-level actions (create/list projects) when no explicit org is chosen. */
export const resolveDefaultOrgId = getOrCreatePersonalOrg;

/** Clerk org role for a user, or `null` if they aren't a member of that org at all. */
export async function getClerkOrgRole(userId: string, orgId: string): Promise<"admin" | "member" | null> {
  const client = await clerkClient();
  const { data: memberships } = await client.users.getOrganizationMembershipList({ userId });
  const membership = memberships.find((m) => m.organization.id === orgId);
  if (!membership) return null;
  return membership.role === ADMIN_ROLE ? "admin" : "member";
}

/**
 * Every org a user belongs to, with their role in each. Shared by
 * `api/orgs/route.ts` (CLI `envhq orgs` / `--org` resolution, M5 PR5) and
 * `listAccessibleProjectsAcrossOrgs` in `lib/access.ts` (the dashboard's
 * cross-org "all my projects" view) — both need the same membership list,
 * just presented differently.
 */
export async function listMyOrgs(userId: string): Promise<{ id: string; name: string; role: "admin" | "member" }[]> {
  const client = await clerkClient();
  const { data: memberships } = await client.users.getOrganizationMembershipList({ userId });
  return memberships.map((m) => ({
    id: m.organization.id,
    name: m.organization.name,
    role: m.role === ADMIN_ROLE ? "admin" : "member",
  }));
}

/**
 * Resolves which org an org-context-less request (project list/create, groups,
 * org members) acts on: an explicit `requestedOrgId` if the caller names one
 * and is a Clerk member of it, else the caller's personal org. Shared by the
 * web app (an explicit `orgId`/`?org=` from a project-creation picker or a
 * page-local `OrgPicker` — there's no session-level "active org" to prefer
 * since the sidebar's org switcher was removed) and the CLI (`--org`, M5 PR5)
 * — same fallback either way.
 *
 * Returns `null` if `requestedOrgId` was given but the caller isn't a member
 * — callers should treat that as a 403, not silently fall back.
 */
export async function resolveRequestedOrgId(
  userId: string,
  requestedOrgId?: string | null,
): Promise<string | null> {
  if (!requestedOrgId) return resolveDefaultOrgId(userId);
  const role = await getClerkOrgRole(userId, requestedOrgId);
  return role ? requestedOrgId : null;
}
