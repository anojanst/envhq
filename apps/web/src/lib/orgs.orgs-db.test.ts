import { beforeEach, describe, expect, test } from "vitest";
import { eq, sql } from "drizzle-orm";
import { testDb } from "@/test-support/db";
import { orgMembers, orgs, personalOrgs } from "@/db/schema";
import { setProfile } from "@/test-support/profiles";
import { getOrCreatePersonalOrg, getOrgRole, listMyOrgs, listOrgAdminUserIds, listOrgMembers } from "./orgs";

/**
 * Orgs and roles live in Postgres and nowhere else — against real Postgres.
 */

beforeEach(async () => {
  await testDb.execute(sql`TRUNCATE TABLE org_members, orgs, personal_orgs, user_profiles CASCADE`);
});

describe("role checks read Postgres", () => {
  test("roles come from org_members", async () => {
    await testDb.insert(orgs).values({ id: "org_a", name: "Acme" });
    await testDb.insert(orgMembers).values({ orgId: "org_a", userId: "user_1", role: "member" });

    expect(await getOrgRole("user_1", "org_a")).toBe("member");
    expect(await listMyOrgs("user_1")).toEqual([{ id: "org_a", name: "Acme", role: "member" }]);
    expect(await listOrgAdminUserIds("org_a")).toEqual([]);
    expect(await listOrgMembers("org_a")).toEqual([{ userId: "user_1", role: "member" }]);
  });

  test("a non-member has no role", async () => {
    await testDb.insert(orgs).values({ id: "org_a", name: "Acme" });
    expect(await getOrgRole("user_9", "org_a")).toBeNull();
  });
});

describe("personal orgs", () => {
  test("a personal org is created in Postgres, named after the user, with them as admin", async () => {
    await setProfile({ id: "user_1", name: "Ada" });

    const orgId = await getOrCreatePersonalOrg("user_1");

    expect(orgId).toMatch(/^org_[0-9a-f]{32}$/);
    const [org] = await testDb.select().from(orgs).where(eq(orgs.id, orgId));
    expect(org).toMatchObject({ name: "Ada", personal: true, createdByUserId: "user_1" });
    expect(await getOrgRole("user_1", orgId)).toBe("admin");
    expect(await getOrCreatePersonalOrg("user_1")).toBe(orgId); // and it is reused, not re-created
    expect(await testDb.select().from(personalOrgs)).toHaveLength(1);
  });
});
