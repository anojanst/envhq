import { vi } from "vitest";

/**
 * Stubs the org-role boundary that `apps/web/src/lib/access.ts` calls
 * through `@/lib/orgs` (`getOrgRole`, `listOrgAdminUserIds`) and
 * `listAccessibleProjectsWithEnvsAcrossOrgs` (`listMyOrgs`), so the authz-db
 * and contract suites can state each case's org role directly instead of
 * seeding `org_members`. The real `lib/orgs.ts` over real rows is exercised
 * separately, by the `orgs-db` project — including this same access matrix.
 *
 * Each fixture case calls `setOrgRole`/`setOrgAdminList`/`setMyOrgs` before
 * exercising the function under test; state accumulates in these maps for
 * the lifetime of a test file (no reset needed since every case uses its
 * own subject/org keys).
 */

type OrgRole = "admin" | "member" | null;

const orgRole = new Map<string, OrgRole>();
const orgAdmins = new Map<string, string[]>();
const myOrgs = new Map<string, { id: string; name: string; role: "admin" | "member" }[]>();

export function setOrgRole(userId: string, orgId: string, role: OrgRole) {
  orgRole.set(`${userId}:${orgId}`, role);
}

export function setOrgAdminList(orgId: string, userIds: string[]) {
  orgAdmins.set(orgId, userIds);
}

export function setMyOrgs(userId: string, orgs: { id: string; name: string; role: "admin" | "member" }[]) {
  myOrgs.set(userId, orgs);
}

/**
 * Org lookups are Postgres reads now (self-hosting phase 2), not Clerk calls,
 * so these stubs no longer go through `timeClerk` — the perf harness must not
 * count a Clerk round-trip that no longer happens. The real query cost of
 * `lib/orgs.ts` is covered by the `orgs-db` project, which runs it unmocked.
 */
vi.mock("@/lib/orgs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/orgs")>();
  return {
    ...actual,
    getOrgRole: vi.fn(async (userId: string, orgId: string): Promise<OrgRole> => orgRole.get(`${userId}:${orgId}`) ?? null),
    listOrgAdminUserIds: vi.fn(async (orgId: string): Promise<string[]> => orgAdmins.get(orgId) ?? []),
    listMyOrgs: vi.fn(async (userId: string) => myOrgs.get(userId) ?? []),
  };
});
