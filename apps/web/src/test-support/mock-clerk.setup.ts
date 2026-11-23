import { vi } from "vitest";

/**
 * Fakes the Clerk network boundary that the contract suite's routes touch
 * *outside* of `@/lib/orgs`'s mocked exports (`mock-orgs.ts`): `getUser`
 * (via `resolveDisplayNames`, `apps/web/src/lib/auth.ts`),
 * `organizations.getOrganizationMembershipList` (called directly from
 * `orgs/members` and `projects/[id]/access/members`), and
 * `users.getOrganizationMembershipList`. The last one is needed because
 * `resolveRequestedOrgId` calls `getOrgRole` as a same-module function
 * reference (both live in `lib/orgs.ts`) rather than through the module's
 * exported binding — `vi.mock("@/lib/orgs", ...)` only intercepts the
 * latter, so that internal call reaches the *real* `getOrgRole`, which
 * needs a working fake Clerk client underneath it, not just a mocked
 * `@/lib/orgs` export. Same rationale as `mock-orgs.ts` otherwise — a real
 * network call would make the suite slow, flaky, and dependent on Clerk's
 * uptime.
 *
 * `createOrganization` deliberately throws: contract tests always pass an
 * explicit `orgId`, so `resolveRequestedOrgId`'s personal-org-creation
 * fallback should never be reached. A throw here surfaces a test that
 * forgot to pass one, instead of silently hitting the real Clerk API.
 *
 * `auth()` (the Clerk session resolver) returns no session, matching a
 * request with no session cookie — contract tests authenticate via bearer
 * token, so routes exercised without one should 401 through this path, the
 * same way they would in production with no cookie.
 */

interface FakeUser {
  id: string;
  firstName?: string;
  username?: string;
  email?: string;
}

interface FakeMembership {
  userId: string;
  orgId: string;
  role: "admin" | "member";
}

const users = new Map<string, FakeUser>();
const memberships: FakeMembership[] = [];
const orgsById = new Map<string, { name: string; createdBy?: string; personal?: boolean }>();

interface Paging {
  limit?: number;
  offset?: number;
}

/** Clerk's list shape: one page of `data` plus the unpaged `totalCount`. Default page size 10, as Clerk's is. */
function page<T>(all: T[], { limit = 10, offset = 0 }: Paging): { data: T[]; totalCount: number } {
  return { data: all.slice(offset, offset + limit), totalCount: all.length };
}

/**
 * Counts every call that reaches the fake Clerk boundary. RM-6's first
 * acceptance criterion is "rendering a version history with 50 distinct
 * authors makes zero Clerk calls", which is only checkable if the harness can
 * say how many there were.
 */
let clerkCalls = 0;
function countCall(): void {
  clerkCalls += 1;
}

export function clerkCallCount(): number {
  return clerkCalls;
}

export function resetClerkCallCount(): void {
  clerkCalls = 0;
}

export function setFakeUser(user: FakeUser): void {
  users.set(user.id, user);
}

export function setFakeOrgMembership(membership: FakeMembership): void {
  memberships.push(membership);
}

export function setFakeOrg(id: string, org: { name: string; createdBy?: string; personal?: boolean }): void {
  orgsById.set(id, org);
}

/** Removes one membership — for the sync tests' "member was removed in Clerk" case. */
export function removeFakeOrgMembership(userId: string, orgId: string): void {
  const i = memberships.findIndex((m) => m.userId === userId && m.orgId === orgId);
  if (i >= 0) memberships.splice(i, 1);
}

/** Forgets an org and all its memberships — for "org was deleted in Clerk". */
export function deleteFakeOrg(orgId: string): void {
  orgsById.delete(orgId);
  for (let i = memberships.length - 1; i >= 0; i--) if (memberships[i]!.orgId === orgId) memberships.splice(i, 1);
}

export function resetFakeClerk(): void {
  users.clear();
  orgsById.clear();
  memberships.length = 0;
  clerkCalls = 0;
}

vi.mock("@clerk/nextjs/server", () => ({
  clerkClient: async () => ({
    users: {
      getUser: async (id: string) => {
        countCall();
        const user = users.get(id);
        if (!user) throw new Error(`mock-clerk: no fake user registered for ${id} — call setFakeUser first`);
        return user;
      },
      // The batched lookup `lib/user-profiles.ts` uses for its lazy fill.
      // Unknown ids are simply absent from `data`, which is how the real
      // endpoint behaves and what the raw-id fallback relies on.
      getUserList: async ({ userId }: { userId?: string[] }) => {
        countCall();
        const ids = userId ?? [];
        return {
          data: ids
            .map((id) => users.get(id))
            .filter((u): u is FakeUser => Boolean(u))
            .map((u) => ({
              id: u.id,
              firstName: u.firstName ?? null,
              username: u.username ?? null,
              imageUrl: "https://example.test/avatar.png",
              primaryEmailAddress: u.email ? { emailAddress: u.email } : null,
            })),
        };
      },
      getOrganizationMembershipList: async ({ userId, limit, offset }: { userId: string } & Paging) => {
        countCall();
        return page(
          memberships
            .filter((m) => m.userId === userId)
            .map((m) => ({
              role: m.role === "admin" ? "org:admin" : "org:member",
              organization: { id: m.orgId, name: `org-${m.orgId}` },
            })),
          { limit, offset },
        );
      },
    },
    organizations: {
      getOrganizationMembershipList: async ({ organizationId, limit, offset }: { organizationId: string } & Paging) => {
        countCall();
        return page(
          memberships
            .filter((m) => m.orgId === organizationId)
            .map((m) => {
              const user = users.get(m.userId);
              return {
                role: m.role === "admin" ? "org:admin" : "org:member",
                publicUserData: {
                  userId: m.userId,
                  firstName: user?.firstName ?? null,
                  identifier: user?.email ?? `${m.userId}@example.test`,
                  imageUrl: "https://example.test/avatar.png",
                },
              };
            }),
          { limit, offset },
        );
      },
      // For `lib/org-sync.ts`: an org exists in the fake if any membership
      // names it, or it was registered with `setFakeOrg`. Anything else is a
      // 404, the way the real API answers for a deleted org.
      getOrganization: async ({ organizationId }: { organizationId: string }) => {
        countCall();
        const org = orgsById.get(organizationId);
        if (!org && !memberships.some((m) => m.orgId === organizationId)) {
          throw Object.assign(new Error("Not Found"), { status: 404 });
        }
        return {
          id: organizationId,
          name: org?.name ?? `org-${organizationId}`,
          createdBy: org?.createdBy ?? null,
          privateMetadata: org?.personal ? { personal: true } : {},
        };
      },
      getOrganizationList: async ({ limit, offset }: Paging) => {
        countCall();
        const ids = [...new Set([...orgsById.keys(), ...memberships.map((m) => m.orgId)])];
        return page(ids.map((id) => ({ id })), { limit, offset });
      },
      createOrganization: async () => {
        throw new Error(
          "mock-clerk: createOrganization was called — a contract test is missing an explicit orgId " +
            "and fell through to personal-org auto-provisioning.",
        );
      },
    },
  }),
  auth: async () => ({ userId: null, orgId: null }),
}));
