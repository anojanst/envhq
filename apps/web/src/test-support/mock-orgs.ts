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

vi.mock("@/lib/orgs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/orgs")>();
  return {
    ...actual,
    getClerkOrgRole: vi.fn(async (userId: string, orgId: string): Promise<OrgRole> => orgRole.get(`${userId}:${orgId}`) ?? null),
    listOrgAdminUserIds: vi.fn(async (orgId: string): Promise<string[]> => orgAdmins.get(orgId) ?? []),
    listMyOrgs: vi.fn(async (userId: string) => myOrgs.get(userId) ?? []),
  };
});
