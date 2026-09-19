import { vi } from "vitest";

/**
 * Stubs the Clerk network boundary that `apps/web/src/lib/access.ts` calls
 * through `@/lib/orgs` (`getClerkOrgRole`, `listOrgAdminUserIds`) and
 * `listAccessibleProjectsWithEnvsAcrossOrgs` (`listMyOrgs`) — real network
 * calls would make the authz-db suite slow, flaky, and dependent on Clerk's
 * uptime. Mocked at the `@/lib/orgs` module boundary (not `@clerk/nextjs`
 * internals) so this seam survives ADR-008's later move of org-role lookups
 * to Postgres unchanged — only `orgs.ts`'s implementation would need to
 * change, not this stub.
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
 * Each stub is wrapped in `timeClerk` so it still *counts* as the Clerk
 * round-trip it stands in for. Without this the RM-5 perf harness would report
 * zero Clerk calls on every route, since mocking at the `@/lib/orgs` boundary
 * replaces the very functions carrying the real instrumentation.
 *
 * The count is real; the latency is not — a stub returns from a Map. See
 * `docs/PERF_BASELINE.md` for where the real numbers come from. `timeClerk` is
 * a no-op outside a measured span, so the other suites are unaffected.
 */
vi.mock("@/lib/orgs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/orgs")>();
  const { timeClerk } = await import("@/lib/perf");
  return {
    ...actual,
    getClerkOrgRole: vi.fn(async (userId: string, orgId: string): Promise<OrgRole> =>
      timeClerk("users.getOrganizationMembershipList", async () => orgRole.get(`${userId}:${orgId}`) ?? null),
    ),
    listOrgAdminUserIds: vi.fn(async (orgId: string): Promise<string[]> =>
      timeClerk("organizations.getOrganizationMembershipList", async () => orgAdmins.get(orgId) ?? []),
    ),
    listMyOrgs: vi.fn(async (userId: string) =>
      timeClerk("users.getOrganizationMembershipList", async () => myOrgs.get(userId) ?? []),
    ),
  };
});
