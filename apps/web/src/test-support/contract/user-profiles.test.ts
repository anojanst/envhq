import { beforeAll, beforeEach, describe, expect, test } from "vitest";
import { eq } from "drizzle-orm";
import { Webhook } from "svix";
import { testDb } from "@/test-support/db";
import { environmentVersions, userProfiles, webhookEvents } from "@/db/schema";
import {
  grantOrgRole,
  resetContractWorld,
  createProject,
  createEnvironment,
  createApiToken,
} from "@/test-support/contract-seed";
import {
  clerkCallCount,
  resetClerkCallCount,
  setFakeUser,
} from "@/test-support/mock-clerk.setup";
import { getDisplayNames } from "@/lib/user-profiles";
import { call, expectStatus } from "./helpers";

import { GET as listVersions } from "@/app/api/environments/[id]/versions/route";
import { POST as clerkWebhook } from "@/app/api/webhooks/clerk/route";

/**
 * RM-6: display names come from the local `user_profiles` mirror, not from one
 * Clerk round-trip per user id.
 *
 * Each acceptance criterion in the ticket gets a test that actually measures
 * it — `clerkCallCount()` counts every call reaching the fake Clerk boundary
 * (`mock-clerk.setup.ts`), so "zero Clerk calls" is asserted, not assumed.
 */

const AUTHOR_COUNT = 50;
const WEBHOOK_SECRET = "whsec_ZmFrZXNlY3JldGZvcnRlc3Rpbmcxmjm0nTY3ODk=";

beforeAll(resetContractWorld);
beforeEach(resetClerkCallCount);

async function environmentWithAuthors(authorIds: string[]) {
  const orgId = `org-${crypto.randomUUID()}`;
  const userId = `user-${crypto.randomUUID()}`;
  grantOrgRole(userId, orgId, "admin");
  const project = await createProject(orgId);
  const environment = await createEnvironment(project.id);
  const { token } = await createApiToken(userId);

  await testDb.insert(environmentVersions).values(
    authorIds.map((createdBy, i) => ({
      environmentId: environment.id,
      version: i + 1,
      snapshot: [],
      createdBy,
    })),
  );
  return { environment, token };
}

function authorIds(n: number, prefix: string): string[] {
  return Array.from({ length: n }, (_, i) => `${prefix}_${String(i).padStart(3, "0")}`);
}

describe("version history with many distinct authors", () => {
  test(`${AUTHOR_COUNT} authors already in user_profiles cost zero Clerk calls`, async () => {
    const ids = authorIds(AUTHOR_COUNT, "user_known");
    const { environment, token } = await environmentWithAuthors(ids);

    // The steady state the webhook produces: every author already mirrored.
    await testDb
      .insert(userProfiles)
      .values(ids.map((userId, i) => ({ userId, name: `Author ${i}`, email: null, imageUrl: null })));

    resetClerkCallCount();
    const path = `/api/environments/${environment.id}/versions`;
    const { res, body } = await call(listVersions, path, { id: environment.id }, { method: "GET", token });

    expectStatus(res, 200);
    const versions = (body as { versions: { createdBy: string; createdByName: string }[] }).versions;
    expect(versions).toHaveLength(AUTHOR_COUNT);
    expect(new Set(versions.map((v) => v.createdBy)).size).toBe(AUTHOR_COUNT);
    for (const v of versions) expect(v.createdByName).toMatch(/^Author \d+$/);

    // The criterion, measured.
    expect(clerkCallCount(), "rendering history should not touch Clerk at all").toBe(0);
  });

  test("unknown authors are filled in one batched call, not one call each", async () => {
    const ids = authorIds(AUTHOR_COUNT, "user_lazy");
    for (const [i, id] of ids.entries()) setFakeUser({ id, firstName: `Lazy ${i}` });
    const { environment, token } = await environmentWithAuthors(ids);

    resetClerkCallCount();
    const path = `/api/environments/${environment.id}/versions`;
    const { res } = await call(listVersions, path, { id: environment.id }, { method: "GET", token });
    expectStatus(res, 200);

    // Clerk's getUserList takes up to 100 ids, so 50 unknown authors is one
    // call. Before RM-6 this path cost one call per id.
    expect(clerkCallCount()).toBe(1);

    // And the fill persisted, so the next render costs nothing.
    const stored = await testDb.select().from(userProfiles).where(eq(userProfiles.userId, ids[0]!));
    expect(stored[0]?.name).toBe("Lazy 0");

    resetClerkCallCount();
    await call(listVersions, path, { id: environment.id }, { method: "GET", token });
    expect(clerkCallCount(), "second render should be served entirely from the mirror").toBe(0);
  });

  test("a Clerk outage degrades names to raw ids and does not fail the page", async () => {
    const ids = authorIds(3, "user_outage");
    // No setFakeUser and no user_profiles row: getUserList returns nothing for
    // these ids, which is how an outage or a deleted account looks from here.
    const { environment, token } = await environmentWithAuthors(ids);

    const path = `/api/environments/${environment.id}/versions`;
    const { res, body } = await call(listVersions, path, { id: environment.id }, { method: "GET", token });

    expectStatus(res, 200);
    const versions = (body as { versions: { createdBy: string; createdByName: string }[] }).versions;
    for (const v of versions) expect(v.createdByName).toBe(v.createdBy);
  });

  test("getDisplayNames returns an entry for every id asked for", async () => {
    const names = await getDisplayNames(["user_absent_a", "user_absent_b", "user_absent_a"]);
    expect(Object.keys(names).sort()).toEqual(["user_absent_a", "user_absent_b"]);
    expect(names.user_absent_a).toBe("user_absent_a");
  });
});

/** Signs a payload the way Svix does, so the route's verification is exercised for real. */
function signed(payload: string, id = `msg_${crypto.randomUUID()}`) {
  const timestamp = new Date();
  const signature = new Webhook(WEBHOOK_SECRET).sign(id, timestamp, payload);
  return {
    id,
    headers: {
      "svix-id": id,
      "svix-timestamp": Math.floor(timestamp.getTime() / 1000).toString(),
      "svix-signature": signature,
      "content-type": "application/json",
    },
  };
}

function webhookRequest(payload: string, headers: Record<string, string>): Request {
  return new Request("http://test.local/api/webhooks/clerk", { method: "POST", headers, body: payload });
}

describe("POST /api/webhooks/clerk", () => {
  const userId = "user_hook_1";
  const payload = JSON.stringify({
    type: "user.updated",
    data: {
      id: userId,
      first_name: "Webhooked",
      primary_email_address_id: "idn_1",
      email_addresses: [{ id: "idn_1", email_address: "hooked@example.test" }],
      image_url: "https://example.test/a.png",
    },
  });

  beforeEach(() => {
    process.env.CLERK_WEBHOOK_SIGNING_SECRET = WEBHOOK_SECRET;
  });

  test("a validly signed user.updated writes the profile", async () => {
    const { headers } = signed(payload);
    const res = await clerkWebhook(webhookRequest(payload, headers));
    expect(res.status).toBe(200);

    const [row] = await testDb.select().from(userProfiles).where(eq(userProfiles.userId, userId));
    expect(row?.name).toBe("Webhooked");
    expect(row?.email).toBe("hooked@example.test");
  });

  test("an unsigned request is rejected before the body is trusted", async () => {
    const res = await clerkWebhook(webhookRequest(payload, { "content-type": "application/json" }));
    expect(res.status).toBe(400);
  });

  test("a tampered payload fails signature verification", async () => {
    const { headers } = signed(payload);
    const tampered = payload.replace("Webhooked", "Attacker");
    const res = await clerkWebhook(webhookRequest(tampered, headers));
    expect(res.status).toBe(401);

    const [row] = await testDb.select().from(userProfiles).where(eq(userProfiles.userId, "user_hook_1"));
    expect(row?.name).not.toBe("Attacker");
  });

  test("a replayed delivery is acknowledged but processed only once", async () => {
    const replayUser = "user_hook_replay";
    const body = JSON.stringify({ type: "user.created", data: { id: replayUser, first_name: "First" } });
    const { id, headers } = signed(body);

    expect((await clerkWebhook(webhookRequest(body, headers))).status).toBe(200);

    // Same svix-id, but a payload that would rename the user if it ran again.
    const secondBody = JSON.stringify({ type: "user.created", data: { id: replayUser, first_name: "Second" } });
    const replayHeaders = { ...signed(secondBody, id).headers, "svix-id": id };
    const res = await clerkWebhook(webhookRequest(secondBody, replayHeaders));
    expect(res.status).toBe(200);
    expect((await res.json()) as { duplicate?: boolean }).toMatchObject({ duplicate: true });

    const [row] = await testDb.select().from(userProfiles).where(eq(userProfiles.userId, replayUser));
    expect(row?.name, "the replay must not have been applied").toBe("First");

    const events = await testDb.select().from(webhookEvents).where(eq(webhookEvents.id, id));
    expect(events).toHaveLength(1);
  });

  test("a missing signing secret refuses the delivery rather than trusting it", async () => {
    delete process.env.CLERK_WEBHOOK_SIGNING_SECRET;
    const { headers } = signed(payload);
    const res = await clerkWebhook(webhookRequest(payload, headers));
    expect(res.status).toBe(500);
  });
});
