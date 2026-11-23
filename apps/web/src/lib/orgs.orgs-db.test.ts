import { beforeEach, describe, expect, test } from "vitest";
import { eq, sql } from "drizzle-orm";
import { Webhook } from "svix";
import { testDb } from "@/test-support/db";
import { orgMembers, orgs, personalOrgs } from "@/db/schema";
import {
  deleteFakeOrg,
  removeFakeOrgMembership,
  resetFakeClerk,
  setFakeOrg,
  setFakeOrgMembership,
  setFakeUser,
} from "@/test-support/mock-clerk.setup";
import { getOrCreatePersonalOrg, getOrgRole, listMyOrgs, listOrgAdminUserIds, listOrgMembers } from "./orgs";
import { syncOrgFromClerk } from "./org-sync";
import { readMemberships, readOrgMembers } from "./org-store";
import { POST as clerkWebhook } from "@/app/api/webhooks/clerk/route";

/**
 * Self-hosting phase 2: orgs and roles in Postgres, and the Clerk → Postgres
 * mirror for team orgs — against real Postgres, with only Clerk's network
 * boundary faked (`mock-clerk.setup.ts`).
 */

const WEBHOOK_SECRET = "whsec_ZmFrZXNlY3JldGZvcnRlc3Rpbmcxmjm0nTY3ODk=";

function delivery(event: object): Request {
  const body = JSON.stringify(event);
  const id = `msg_${crypto.randomUUID()}`;
  const ts = new Date();
  return new Request("http://test.local/api/webhooks/clerk", {
    method: "POST",
    body,
    headers: {
      "content-type": "application/json",
      "svix-id": id,
      "svix-timestamp": Math.floor(ts.getTime() / 1000).toString(),
      "svix-signature": new Webhook(WEBHOOK_SECRET).sign(id, ts, body),
    },
  });
}

beforeEach(async () => {
  await testDb.execute(sql`TRUNCATE TABLE org_members, orgs, personal_orgs, webhook_events CASCADE`);
  resetFakeClerk();
  process.env.CLERK_WEBHOOK_SIGNING_SECRET = WEBHOOK_SECRET;
});

describe("syncOrgFromClerk", () => {
  test("copies an org and every member with their role", async () => {
    setFakeOrg("org_a", { name: "Acme", createdBy: "user_1" });
    setFakeOrgMembership({ userId: "user_1", orgId: "org_a", role: "admin" });
    setFakeOrgMembership({ userId: "user_2", orgId: "org_a", role: "member" });

    expect(await syncOrgFromClerk("org_a")).toBe("replaced");

    const [org] = await testDb.select().from(orgs).where(eq(orgs.id, "org_a"));
    expect(org).toMatchObject({ name: "Acme", personal: false, createdByUserId: "user_1" });
    expect(await readOrgMembers("org_a")).toEqual(
      expect.arrayContaining([
        { userId: "user_1", role: "admin" },
        { userId: "user_2", role: "member" },
      ]),
    );
  });

  test("reads past Clerk's 10-per-page default — nobody is dropped from a large org", async () => {
    for (let i = 0; i < 27; i++) setFakeOrgMembership({ userId: `user_${i}`, orgId: "org_big", role: "member" });
    await syncOrgFromClerk("org_big");
    expect(await readOrgMembers("org_big")).toHaveLength(27);
  });

  test("a member removed in Clerk is removed here, whatever the event said", async () => {
    setFakeOrgMembership({ userId: "user_1", orgId: "org_a", role: "admin" });
    setFakeOrgMembership({ userId: "user_2", orgId: "org_a", role: "member" });
    await syncOrgFromClerk("org_a");

    removeFakeOrgMembership("user_2", "org_a");
    await syncOrgFromClerk("org_a");

    expect(await readOrgMembers("org_a")).toEqual([{ userId: "user_1", role: "admin" }]);
  });

  test("an org deleted in Clerk is deleted here, memberships included", async () => {
    setFakeOrgMembership({ userId: "user_1", orgId: "org_a", role: "admin" });
    await syncOrgFromClerk("org_a");
    deleteFakeOrg("org_a");

    expect(await syncOrgFromClerk("org_a")).toBe("deleted");
    expect(await testDb.select().from(orgs)).toEqual([]);
    expect(await readMemberships("user_1")).toEqual([]);
  });

  test("a personal org is marked personal (from personal_orgs or Clerk metadata)", async () => {
    setFakeOrg("org_p", { name: "Ada", personal: true });
    setFakeOrgMembership({ userId: "user_1", orgId: "org_p", role: "admin" });
    await syncOrgFromClerk("org_p");
    const [org] = await testDb.select().from(orgs).where(eq(orgs.id, "org_p"));
    expect(org?.personal).toBe(true);
  });
});

describe("POST /api/webhooks/clerk — org events", () => {
  test("organizationMembership.created syncs that org", async () => {
    setFakeOrgMembership({ userId: "user_1", orgId: "org_a", role: "admin" });
    const res = await clerkWebhook(
      delivery({ type: "organizationMembership.created", data: { id: "orgmem_1", organization: { id: "org_a" } } }),
    );
    expect(res.status).toBe(200);
    expect(await readOrgMembers("org_a")).toEqual([{ userId: "user_1", role: "admin" }]);
  });

  test("a stale 'created' delivered after the member was removed does not resurrect them", async () => {
    setFakeOrgMembership({ userId: "user_1", orgId: "org_a", role: "admin" });
    await syncOrgFromClerk("org_a");
    setFakeOrgMembership({ userId: "user_2", orgId: "org_a", role: "member" });
    removeFakeOrgMembership("user_2", "org_a");

    // The "created" for user_2 arrives late, after Clerk already removed them.
    await clerkWebhook(
      delivery({ type: "organizationMembership.created", data: { id: "orgmem_2", organization: { id: "org_a" } } }),
    );

    expect(await getRoleFromPostgres("user_2", "org_a")).toBeNull();
  });

  test("a role change in Clerk becomes the role here", async () => {
    setFakeOrgMembership({ userId: "user_1", orgId: "org_a", role: "member" });
    await syncOrgFromClerk("org_a");
    removeFakeOrgMembership("user_1", "org_a");
    setFakeOrgMembership({ userId: "user_1", orgId: "org_a", role: "admin" });

    await clerkWebhook(
      delivery({ type: "organizationMembership.updated", data: { id: "orgmem_1", organization: { id: "org_a" } } }),
    );
    expect(await getRoleFromPostgres("user_1", "org_a")).toBe("admin");
  });

  test("organization.deleted removes the org", async () => {
    setFakeOrgMembership({ userId: "user_1", orgId: "org_a", role: "admin" });
    await syncOrgFromClerk("org_a");
    deleteFakeOrg("org_a");
    await clerkWebhook(delivery({ type: "organization.deleted", data: { id: "org_a", deleted: true } }));
    expect(await testDb.select().from(orgs)).toEqual([]);
  });

  test("user.deleted removes the user from every org", async () => {
    setFakeOrgMembership({ userId: "user_1", orgId: "org_a", role: "admin" });
    setFakeOrgMembership({ userId: "user_1", orgId: "org_b", role: "member" });
    await syncOrgFromClerk("org_a");
    await syncOrgFromClerk("org_b");
    await clerkWebhook(delivery({ type: "user.deleted", data: { id: "user_1", deleted: true } }));
    expect(await readMemberships("user_1")).toEqual([]);
  });
});

describe("role checks read Postgres", () => {
  test("roles come from org_members, and Clerk's opinion is ignored", async () => {
    setFakeOrgMembership({ userId: "user_1", orgId: "org_a", role: "admin" }); // Clerk says admin…
    await testDb.insert(orgs).values({ id: "org_a", name: "Acme" });
    await testDb.insert(orgMembers).values({ orgId: "org_a", userId: "user_1", role: "member" }); // …Postgres says member.

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
  test("a personal org is created in Postgres, never in Clerk, with the user as admin", async () => {
    setFakeUser({ id: "user_1", firstName: "Ada" });

    const orgId = await getOrCreatePersonalOrg("user_1");

    expect(orgId).toMatch(/^org_[0-9a-f]{32}$/);
    const [org] = await testDb.select().from(orgs).where(eq(orgs.id, orgId));
    expect(org).toMatchObject({ name: "Ada", personal: true, createdByUserId: "user_1" });
    expect(await getOrgRole("user_1", orgId)).toBe("admin");
    expect(await getOrCreatePersonalOrg("user_1")).toBe(orgId); // and it is reused, not re-created
    expect(await testDb.select().from(personalOrgs)).toHaveLength(1);
  });
});

async function getRoleFromPostgres(userId: string, orgId: string) {
  return (await readMemberships(userId)).find((m) => m.id === orgId)?.role ?? null;
}
