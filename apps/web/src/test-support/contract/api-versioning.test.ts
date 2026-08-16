import crypto from "node:crypto";
import { beforeAll, describe, expect, test } from "vitest";
import { createApiToken, resetContractWorld } from "@/test-support/contract-seed";
import { call, req } from "./helpers";

import { GET as getMe } from "@/app/api/me/route";

beforeAll(resetContractWorld);

/**
 * Every unversioned `route.ts` under `api/**` (HQ-54) has a `v1/` sibling
 * that must re-export the exact same handler functions — not a
 * reimplementation that merely happens to match today. `import.meta.glob`
 * discovers every route file so this covers all of them, not a sample.
 */
const routeModules = import.meta.glob<Record<string, unknown>>("../../app/api/**/route.ts");
const unversionedPaths = Object.keys(routeModules).filter(
  (path) => !path.includes("/app/api/v1/"),
);

describe("every unversioned route is a genuine alias of its /v1 counterpart", () => {
  test.each(unversionedPaths)("%s", async (unversionedPath) => {
    const v1Path = unversionedPath.replace("/app/api/", "/app/api/v1/");
    expect(routeModules).toHaveProperty(v1Path);

    const [unversioned, v1] = await Promise.all([routeModules[unversionedPath]!(), routeModules[v1Path]!()]);

    const methodNames = Object.keys(unversioned).filter((key) =>
      ["GET", "POST", "PATCH", "PUT", "DELETE"].includes(key),
    );
    expect(methodNames.length).toBeGreaterThan(0);
    for (const method of methodNames) {
      // Reference-equal, not just behaviorally similar: the alias re-exports
      // the identical function, so it can never drift from the canonical
      // route's behavior.
      expect(v1[method]).toBe(unversioned[method]);
    }
  });
});

describe("GET /api/me and GET /api/v1/me return identical responses", () => {
  test("same token, same status, same body", async () => {
    const userId = `user-${crypto.randomUUID()}`;
    const { token } = await createApiToken(userId);

    // The alias path isn't documented in openapi.yaml (HQ-54 — only /v1 is
    // canonical), so it's invoked directly rather than through `call()`,
    // which validates against the spec.
    const aliasRes = await getMe(req("/api/me", { method: "GET", token }));
    const aliasBody = await aliasRes.json();

    const { res: v1Res, body: v1Body } = await call(getMe, "/api/v1/me", {}, { method: "GET", token });

    expect(aliasRes.status).toBe(v1Res.status);
    expect(aliasBody).toEqual(v1Body);
    expect(aliasBody).toEqual({ userId });
  });
});
