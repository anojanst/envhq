import { vi } from "vitest";

/**
 * Fakes the Clerk network boundary that the contract suite's routes touch
 * *outside* of `@/lib/orgs`'s mocked exports (`mock-orgs.ts`): `getUser`
 * (via `resolveDisplayNames`, `apps/web/src/lib/auth.ts`),
 * `organizations.getOrganizationMembershipList` (called directly from
 * `orgs/members` and `projects/[id]/access/members`), and
 * `users.getOrganizationMembershipList`. The last one is needed because
 * `resolveRequestedOrgId` calls `getClerkOrgRole` as a same-module function
 * reference (both live in `lib/orgs.ts`) rather than through the module's
 * exported binding — `vi.mock("@/lib/orgs", ...)` only intercepts the
 * latter, so that internal call reaches the *real* `getClerkOrgRole`, which
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

export function setFakeUser(user: FakeUser): void {
  users.set(user.id, user);
}

export function setFakeOrgMembership(membership: FakeMembership): void {
  memberships.push(membership);
}

export function resetFakeClerk(): void {
  users.clear();
  memberships.length = 0;
}

vi.mock("@clerk/nextjs/server", () => ({
  clerkClient: async () => ({
    users: {
      getUser: async (id: string) => {
        const user = users.get(id);
        if (!user) throw new Error(`mock-clerk: no fake user registered for ${id} — call setFakeUser first`);
        return user;
      },
      getOrganizationMembershipList: async ({ userId }: { userId: string }) => ({
        data: memberships
          .filter((m) => m.userId === userId)
          .map((m) => ({
            role: m.role === "admin" ? "org:admin" : "org:member",
            organization: { id: m.orgId, name: `org-${m.orgId}` },
          })),
      }),
    },
    organizations: {
      getOrganizationMembershipList: async ({ organizationId }: { organizationId: string }) => ({
        data: memberships
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
      }),
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
