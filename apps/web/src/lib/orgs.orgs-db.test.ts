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

  // Accounts from before migration 0016 have a `personal_orgs` pointer but no
  // `orgs` row: everything in that org answered "not a member", including
  // creating a project and seeing the ones already there.
  test("a pointer that outlived its org gets the org and its owner back", async () => {
    await setProfile({ id: "user_old", name: "Old Account" });
    await testDb.insert(personalOrgs).values({ userId: "user_old", orgId: "org_legacy" });

    expect(await getOrCreatePersonalOrg("user_old")).toBe("org_legacy");

    const [org] = await testDb.select().from(orgs).where(eq(orgs.id, "org_legacy"));
    expect(org).toMatchObject({ name: "Old Account", personal: true, createdByUserId: "user_old" });
    expect(await getOrgRole("user_old", "org_legacy")).toBe("admin");
    expect(await testDb.select().from(personalOrgs)).toHaveLength(1);
  });

  test("a personal org missing only its owner's membership gets it back", async () => {
    await testDb.insert(orgs).values({ id: "org_p", name: "Mine", personal: true, createdByUserId: "user_2" });
    await testDb.insert(personalOrgs).values({ userId: "user_2", orgId: "org_p" });

    expect(await getOrCreatePersonalOrg("user_2")).toBe("org_p");
    expect(await getOrgRole("user_2", "org_p")).toBe("admin");
    expect(await listOrgMembers("org_p")).toHaveLength(1);
  });

  test("a pointer that names a team never grants membership in it", async () => {
    await testDb.insert(orgs).values({ id: "org_team", name: "Team", personal: false, createdByUserId: "someone" });
    await testDb.insert(personalOrgs).values({ userId: "user_3", orgId: "org_team" });

    await getOrCreatePersonalOrg("user_3");

    expect(await getOrgRole("user_3", "org_team")).toBeNull();
    expect(await listOrgMembers("org_team")).toHaveLength(0);
  });
});
