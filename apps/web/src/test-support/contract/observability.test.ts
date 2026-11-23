import { afterEach, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import { eq } from "drizzle-orm";
import { testDb } from "@/test-support/db";
import { errorEvents } from "@/db/schema";
import { setOrgAdminList } from "@/test-support/mock-orgs";
import { resetContractWorld, createApiToken, grantOrgRole } from "@/test-support/contract-seed";
import { call, expectStatus } from "./helpers";

import { reportError } from "@/lib/observability";
import { GET as health } from "@/app/api/health/route";
import { GET as opsMetrics } from "@/app/api/ops/metrics/route";
import { PATCH as setIssueMutedRoute } from "@/app/api/ops/issues/[fingerprint]/route";

/**
 * RM-18's behaviour that needs real state: grouping across invocations, and
 * alerting once rather than on every occurrence.
 *
 * Deliberately against the database rather than a stubbed store. The reason
 * this state is in Postgres at all is that serverless gives every invocation
 * its own process, so dedup has to be shared — and a test with an in-memory
 * double would pass while proving nothing about the case that matters.
 */

beforeAll(resetContractWorld);

const ROUTE = "api/test/observability";

beforeEach(async () => {
  await testDb.delete(errorEvents);
  delete process.env.ALERT_WEBHOOK_URL;
  vi.unstubAllGlobals();
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.ENVHQ_STAFF_USER_IDS;
});

function boom(message = "something broke"): Error {
  const err = new Error(message);
  err.stack = `Error: ${message}\n    at handler (/var/task/src/app/api/thing/route.ts:12:5)`;
  return err;
}

describe("grouping and alerting", () => {
  test("the first occurrence is new; the next ones are not", async () => {
    // The ticket asks for "alerting on new issues — not on every
    // occurrence". This is that sentence as a test.
    const first = await reportError(boom(), { route: ROUTE });
    expect(first?.isNew).toBe(true);
    expect(first?.occurrences).toBe(1);

    const second = await reportError(boom(), { route: ROUTE });
    expect(second?.isNew).toBe(false);
    expect(second?.occurrences).toBe(2);
    expect(second?.fingerprint).toBe(first?.fingerprint);

    const third = await reportError(boom("a different message, same throw site"), { route: ROUTE });
    expect(third?.fingerprint).toBe(first?.fingerprint);
    expect(third?.occurrences).toBe(3);
  });

  test("a deliberate error reaches the alert webhook, once", async () => {
    // RM-18's first acceptance criterion — "a deliberate error in staging
    // raises an alert within minutes" — as far as it can be checked here:
    // the alert is dispatched. Whether it arrives depends on the URL being
    // configured, which is an operator action.
    const sent: { url: string; body: string }[] = [];
    process.env.ALERT_WEBHOOK_URL = "https://hooks.example.test/alert";
    vi.stubGlobal("fetch", async (url: string, init: { body: string }) => {
      sent.push({ url, body: init.body });
      return new Response("ok");
    });

    await reportError(boom("deliberate"), { route: ROUTE, status: 500 });
    expect(sent).toHaveLength(1);
    expect(sent[0]!.url).toBe("https://hooks.example.test/alert");
    expect(sent[0]!.body).toContain("deliberate");

    // Second occurrence: recorded, not re-announced.
    await reportError(boom("deliberate"), { route: ROUTE, status: 500 });
    expect(sent).toHaveLength(1);
  });

  test("a muted issue never alerts again", async () => {
    const sent: unknown[] = [];
    process.env.ALERT_WEBHOOK_URL = "https://hooks.example.test/alert";
    vi.stubGlobal("fetch", async () => {
      sent.push(1);
      return new Response("ok");
    });

    const first = await reportError(boom(), { route: ROUTE });
    expect(sent).toHaveLength(1);

    await testDb
      .update(errorEvents)
      .set({ mutedAt: new Date(), alertedAt: new Date(Date.now() - 1000 * 60 * 60 * 48) })
      .where(eq(errorEvents.fingerprint, first!.fingerprint));

    // Old enough to re-alert on the quiet-for-a-day rule, but muted wins.
    const again = await reportError(boom(), { route: ROUTE });
    expect(again?.isNew).toBe(false);
    expect(sent).toHaveLength(1);
  });

  test("an issue that went quiet for a day may alert again", async () => {
    const first = await reportError(boom(), { route: ROUTE });
    await testDb
      .update(errorEvents)
      .set({ alertedAt: new Date(Date.now() - 1000 * 60 * 60 * 25) })
      .where(eq(errorEvents.fingerprint, first!.fingerprint));

    // A regression that comes back weeks later is news again — otherwise the
    // only way to hear about it twice is to have never muted anything.
    const returned = await reportError(boom(), { route: ROUTE });
    expect(returned?.isNew).toBe(true);
  });

  test("what gets stored is scrubbed, not the raw message", async () => {
    await reportError(boom("token envhq_supersecrettokenvalue rejected"), { route: ROUTE });
    const [row] = await testDb.select().from(errorEvents);
    expect(row!.message).not.toContain("envhq_supersecrettokenvalue");
    expect(row!.message).toContain("rejected");
  });

  test("a failure inside reporting does not replace the error being reported", async () => {
    // Reporting is called from a catch block. If it can throw, the original
    // failure disappears behind a second one nobody can interpret.
    vi.stubGlobal("fetch", async () => {
      throw new Error("network down");
    });
    process.env.ALERT_WEBHOOK_URL = "https://hooks.example.test/alert";
    await expect(reportError(boom(), { route: ROUTE })).resolves.not.toThrow();
  });
});

describe("the health endpoint", () => {
  async function get(headers: Record<string, string> = {}) {
    const res = await health(new Request("http://test.local/api/health", { headers }));
    return { res, body: (await res.json()) as Record<string, unknown> };
  }

  test("reports up with no credential at all", async () => {
    const { res, body } = await get();
    expectStatus(res, 200);
    expect(body).toMatchObject({ ok: true, database: "ok" });
    // Nothing beyond up/down: a health endpoint listing versions or
    // dependency hosts is free reconnaissance.
    expect(Object.keys(body).sort()).toEqual(["database", "latencyMs", "ok"]);
  });

  test("exercises the auth path when given a token", async () => {
    const userId = `user-${crypto.randomUUID()}`;
    const { token } = await createApiToken(userId);
    const { res, body } = await get({ authorization: `Bearer ${token}` });
    expectStatus(res, 200);
    expect(body).toMatchObject({ ok: true, auth: "ok" });
  });

  test("a bad monitor credential is 401, not a 503 outage", async () => {
    // The distinction that stops a token rotation paging someone at 3am.
    const { res, body } = await get({ authorization: "Bearer envhq_not_a_real_token" });
    expectStatus(res, 401);
    expect(body).toMatchObject({ ok: false, auth: "rejected" });
  });

  test("is never cached", async () => {
    // A cached health check is a health check that lies.
    const { res } = await get();
    expect(res.headers.get("cache-control")).toContain("no-store");
  });
});

describe("the staff-only ops surface", () => {
  async function setupUser() {
    const orgId = `org-${crypto.randomUUID()}`;
    const userId = `user-${crypto.randomUUID()}`;
    await grantOrgRole(userId, orgId, "admin");
    setOrgAdminList(orgId, [userId]);
    const { token } = await createApiToken(userId);
    return { userId, token };
  }

  test("an org admin who isn't staff gets 404, not 403", async () => {
    // Org admin means admin of that customer's org — emphatically not EnvHQ
    // staff. 404 rather than 403 matches lib/access.ts throughout: probing
    // for an admin surface tells you nothing a stranger wouldn't learn.
    const { token } = await setupUser();
    const { res } = await call(opsMetrics, "/api/ops/metrics", {}, { method: "GET", token });
    expectStatus(res, 404);
  });

  test("staff get the numbers", async () => {
    const { userId, token } = await setupUser();
    process.env.ENVHQ_STAFF_USER_IDS = `someone-else,${userId}`;
    const { res, body } = await call(opsMetrics, "/api/ops/metrics", {}, { method: "GET", token });
    expectStatus(res, 200);
    expect(body).toMatchObject({
      growth: expect.any(Object),
      usage: expect.any(Object),
      health: expect.any(Object),
    });
  });

  test("an empty allowlist admits nobody", async () => {
    // The failure mode that matters for a feature gated by an env var: if
    // the variable is unset in production, this must close rather than open.
    const { token } = await setupUser();
    process.env.ENVHQ_STAFF_USER_IDS = "";
    const { res } = await call(opsMetrics, "/api/ops/metrics", {}, { method: "GET", token });
    expectStatus(res, 404);
  });

  test("staff can mute an issue, and a non-staff caller cannot", async () => {
    const { userId, token } = await setupUser();
    const reported = await reportError(boom(), { route: ROUTE });
    const fp = reported!.fingerprint;
    const path = `/api/ops/issues/${fp}`;

    const denied = await call(setIssueMutedRoute, path, { fingerprint: fp }, { method: "PATCH", token, json: { muted: true } });
    expectStatus(denied.res, 404);

    process.env.ENVHQ_STAFF_USER_IDS = userId;
    const allowed = await call(setIssueMutedRoute, path, { fingerprint: fp }, { method: "PATCH", token, json: { muted: true } });
    expectStatus(allowed.res, 200);

    const [row] = await testDb.select().from(errorEvents).where(eq(errorEvents.fingerprint, fp));
    expect(row!.mutedAt).not.toBeNull();
  });
});
