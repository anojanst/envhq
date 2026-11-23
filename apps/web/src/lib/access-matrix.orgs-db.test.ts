import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import fixture from "./access-matrix.fixtures.json";
import { testDb } from "@/test-support/db";
import { orgMembers, orgs } from "@/db/schema";
import { seedFixtureWorld, type FixtureEntities, type FixtureWorld } from "@/test-support/seed-fixture";
import { callSurface, cases } from "@/test-support/access-matrix-cases";

/**
 * Self-hosting phase 2's gate: the access matrix — the same fixture, unchanged
 * — replayed with org roles coming from real `org_members` rows through the
 * real `lib/orgs.ts`, instead of from the mocked `@/lib/orgs` that
 * `access-matrix.test.ts` uses. If moving roles into
 * Postgres changed any decision, a case here disagrees with its fixture.
 */

async function setPostgresOrgRole(userId: string, orgId: string, role: "admin" | "member" | null) {
  await testDb.insert(orgs).values({ id: orgId, name: orgId }).onConflictDoNothing();
  await testDb.delete(orgMembers).where(and(eq(orgMembers.orgId, orgId), eq(orgMembers.userId, userId)));
  if (role) await testDb.insert(orgMembers).values({ orgId, userId, role });
}

let world: FixtureWorld;

beforeAll(async () => {
  await testDb.execute(sql`TRUNCATE TABLE org_members, orgs CASCADE`);
  world = await seedFixtureWorld(testDb, fixture.entities as FixtureEntities);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterAll(() => {
  vi.restoreAllMocks();
});

describe.each(cases)("$dimension: $name", (c) => {
  test("matches the expected outcome with roles from org_members", async () => {
    await setPostgresOrgRole(c.caller.userId, c.caller.orgId, c.caller.isOrgAdmin ? "admin" : "member");

    const result = await callSurface(c, world);

    if (c.expect.outcome === "allow") {
      expect(result).toBeDefined();
      expect(result?.role).toBe(c.expect.role);
    } else {
      expect(result).toBeUndefined();
    }
  });
});

test("removing the org_members row revokes org-admin access on the very next check", async () => {
  const adminCase = cases.find((c) => c.dimension === "org_admin" && c.expect.outcome === "allow" && c.caller.isOrgAdmin);
  expect(adminCase, "fixture has an org-admin allow case").toBeDefined();
  const c = adminCase!;

  await setPostgresOrgRole(c.caller.userId, c.caller.orgId, "admin");
  expect(await callSurface(c, world)).toBeDefined();

  await setPostgresOrgRole(c.caller.userId, c.caller.orgId, null);
  // No cross-request cache: the revoked admin is not still admin.
  const after = await callSurface(c, world);
  expect(after?.role === "admin").toBe(false);
});
