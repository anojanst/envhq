import { cache } from "react";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { personalOrgs } from "@/db/schema";
import { getDirectoryUser } from "@/lib/identity";
import { readMemberships, readOrgMembers, replaceOrg, type OrgRole, type StoredMember } from "@/lib/org-store";

/**
 * Orgs, memberships and roles — every org-level permission in the app comes
 * through here. Server-only.
 *
 * The answers come from Postgres (`orgs`, `org_members`), which EnvHQ alone
 * writes: personal orgs here, teams in `lib/org-admin.ts`. The identity
 * provider is never asked who belongs to what — it only says who someone is
 * (docs/SELF_HOSTING_PLAN.md).
 *
 * Roles resolve LIVE on every request. The only caching is React's
 * request-scoped `cache()` — see `fetchMemberships`.
 */

/**
 * Finds a user's personal org if one already exists, else creates it.
 *
 * Race safety: two concurrent first-requests for a brand-new user (e.g. a
 * dashboard load racing a CLI token exchange) could both miss the
 * `personalOrgs` lookup. The `INSERT ... ON CONFLICT (user_id) DO NOTHING
 * RETURNING org_id` below is the atomic tie-breaker: whichever insert wins is
 * "the" personal org from then on, and only the winner writes the `orgs` and
 * `org_members` rows. The loser re-reads the winner's org id and creates
 * nothing.
 */
export async function getOrCreatePersonalOrg(userId: string): Promise<string> {
  const existing = await db
    .select({ orgId: personalOrgs.orgId })
    .from(personalOrgs)
    .where(eq(personalOrgs.userId, userId))
    .limit(1);
  if (existing[0]) return existing[0].orgId;

  const user = await getDirectoryUser(userId);
  // Falls back through to the email as a last resort specifically so this
  // name is unique per user — a bare "Personal" literal collides across
  // every account that has neither a first name nor a username set (common
  // for freshly-signed-up test accounts), making every such user's org
  // indistinguishable from anyone else's in an org picker.
  const name = user.name || user.email || "Personal";
  const orgId = `org_${randomUUID().replaceAll("-", "")}`;

  const inserted = await db
    .insert(personalOrgs)
    .values({ userId, orgId })
    .onConflictDoNothing({ target: personalOrgs.userId })
    .returning({ orgId: personalOrgs.orgId });
  if (inserted[0]) {
    await replaceOrg({ id: orgId, name, personal: true, createdByUserId: userId, members: [{ userId, role: "admin" }] });
    return orgId;
  }

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
  role: OrgRole;
}

/**
 * The caller's org memberships. Every role check in the app comes through
 * here: `getOrgRole` and `listMyOrgs` are both views over this one read,
 * called with the same argument.
 *
 * Wrapped in React's `cache()` so repeated reads within a single request
 * query once. Several routes ask twice already — `resolveRequestedOrgId`
 * followed by an explicit `getOrgRole`, for instance (see
 * `api/groups/route.ts`).
 *
 * ON THE RISK RM-6 FLAGS — "do not let a cached membership list become an
 * authorization input": this *is* an authorization input, so the cache is
 * deliberately request-scoped and nothing wider. `cache()` cannot outlive a
 * request; outside a request scope React gives each call a fresh cache, so
 * the failure mode is "no deduplication", never a membership decision leaking
 * from one request into another, or a role surviving a revocation. There is
 * no cross-request TTL here on purpose — a revoked admin staying admin for
 * the length of a TTL is a real access consequence.
 */
const fetchMemberships = cache(async (userId: string): Promise<OrgMembership[]> => readMemberships(userId));

/** Org role for a user, or `null` if they aren't a member of that org at all. */
export async function getOrgRole(userId: string, orgId: string): Promise<OrgRole | null> {
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
 * Every member of an org with their role. Feeds the member pickers
 * (`api/orgs/members`, `api/projects/[id]/access/members`) and
 * `listOrgAdminUserIds`. Never paginated: a member missing from this list is
 * a member missing from DEK reconciliation.
 */
export async function listOrgMembers(orgId: string): Promise<StoredMember[]> {
  return readOrgMembers(orgId);
}

/**
 * Every org admin's userId in an org — used by M6 PR6's DEK reconciliation
 * to include org admins in a project's "who should have a key" set, since
 * `lib/access.ts`'s admin-role bypass grants them *authorization* with no
 * `access_grants` row to enumerate them from.
 */
export async function listOrgAdminUserIds(orgId: string): Promise<string[]> {
  return (await listOrgMembers(orgId)).filter((m) => m.role === "admin").map((m) => m.userId);
}

/**
 * Resolves which org an org-context-less request (project list/create, groups,
 * org members) acts on: an explicit `requestedOrgId` if the caller names one
 * and is a member of it, else the caller's personal org. Shared by the web
 * app (an explicit `orgId`/`?org=` from a project-creation picker or a
 * page-local `OrgPicker`) and the CLI (`--org`, M5 PR5) — same fallback
 * either way.
 *
 * Returns `null` if `requestedOrgId` was given but the caller isn't a member
 * — callers should treat that as a 403, not silently fall back.
 */
export async function resolveRequestedOrgId(
  userId: string,
  requestedOrgId?: string | null,
): Promise<string | null> {
  if (!requestedOrgId) return resolveDefaultOrgId(userId);
  const role = await getOrgRole(userId, requestedOrgId);
  return role ? requestedOrgId : null;
}
