import { cache } from "react";
import { eq } from "drizzle-orm";
import { clerkClient } from "@clerk/nextjs/server";
import { db } from "@/db";
import { personalOrgs } from "@/db/schema";
import { timeClerk } from "@/lib/perf";

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
  const user = await timeClerk("users.getUser", () => client.users.getUser(userId));
  // Falls back through to the email as a last resort specifically so this
  // name is unique per user — a bare "Personal" literal collides across
  // every account that has neither a first name nor a username set (common
  // for freshly-signed-up test accounts), making every such user's org
  // indistinguishable from anyone else's in an org picker.
  const name = user.firstName || user.username || user.primaryEmailAddress?.emailAddress || "Personal";
  const org = await timeClerk("organizations.createOrganization", () =>
    client.organizations.createOrganization({
      name,
      createdBy: userId,
      privateMetadata: PERSONAL_ORG_METADATA,
    }),
  );

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

export interface OrgMembership {
  id: string;
  name: string;
  role: "admin" | "member";
}

/**
 * The caller's org memberships, from Clerk. Every role check in the app comes
 * through here: `getClerkOrgRole` and `listMyOrgs` are both views over this
 * one endpoint, called with the same argument.
 *
 * Wrapped in React's `cache()` so repeated reads within a single request hit
 * Clerk once. Several routes ask twice already — `resolveRequestedOrgId`
 * followed by an explicit `getClerkOrgRole`, for instance (see
 * `api/groups/route.ts`).
 *
 * ON THE RISK RM-6 FLAGS — "do not let a cached membership list become an
 * authorization input": this *is* an authorization input, so the cache is
 * deliberately request-scoped and nothing wider. `cache()` cannot outlive a
 * request; outside a request scope React gives each call a fresh cache, so
 * the failure mode is "no deduplication", never a membership decision leaking
 * from one request into another, or a role surviving a revocation. There is
 * no cross-request TTL here on purpose — the ticket offers one as an option
 * and this declines it, because a revoked admin staying admin for the length
 * of a TTL is a real access consequence, and the fan-out is already solved
 * without paying for it.
 */
const fetchMemberships = cache(async (userId: string): Promise<OrgMembership[]> => {
  const client = await clerkClient();
  const { data: memberships } = await timeClerk("users.getOrganizationMembershipList", () =>
    client.users.getOrganizationMembershipList({ userId }),
  );
  return memberships.map((m) => ({
    id: m.organization.id,
    name: m.organization.name,
    role: m.role === ADMIN_ROLE ? "admin" : "member",
  }));
});

/** Clerk org role for a user, or `null` if they aren't a member of that org at all. */
export async function getClerkOrgRole(userId: string, orgId: string): Promise<"admin" | "member" | null> {
  const memberships = await fetchMemberships(userId);
  return memberships.find((m) => m.id === orgId)?.role ?? null;
}

/**
 * Every org a user belongs to, with their role in each. Shared by
 * `api/orgs/route.ts` (CLI `envhq orgs` / `--org` resolution, M5 PR5) and
 * `listAccessibleProjectsAcrossOrgs` in `lib/access.ts` (the dashboard's
 * cross-org "all my projects" view) — both need the same membership list,
 * just presented differently.
 */
export async function listMyOrgs(userId: string): Promise<OrgMembership[]> {
  return fetchMemberships(userId);
}

/**
 * Every Clerk org:admin/owner userId in an org — used by M6 PR6's DEK
 * reconciliation to include org admins in a project's "who should have a
 * key" set, since `lib/access.ts`'s admin-role bypass grants them
 * *authorization* with no `access_grants` row to enumerate them from.
 */
export async function listOrgAdminUserIds(orgId: string): Promise<string[]> {
  const client = await clerkClient();
  const { data: memberships } = await timeClerk("organizations.getOrganizationMembershipList", () =>
    client.organizations.getOrganizationMembershipList({ organizationId: orgId }),
  );
  return memberships.filter((m) => m.role === ADMIN_ROLE && m.publicUserData).map((m) => m.publicUserData!.userId);
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
