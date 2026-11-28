import { describe, expect, test } from "vitest";
import { OUTDATED_CLIENT_MESSAGE, outdatedClientResponse } from "./client-version";

const bearer = { authorization: "Bearer envhq_abc" };

describe("outdatedClientResponse", () => {
  test("refuses a bearer request without the v2 header, with the upgrade instruction", async () => {
    const res = outdatedClientResponse("/api/projects", new Headers(bearer));
    expect(res?.status).toBe(426);
    expect(res?.headers.get("cache-control")).toBe("private, no-store");
    expect(await res?.json()).toEqual({ error: OUTDATED_CLIENT_MESSAGE });
    expect(OUTDATED_CLIENT_MESSAGE).toContain("npm install -g envhq@latest");
  });

  test("refuses an older or unknown crypto version", () => {
    expect(outdatedClientResponse("/api/me", new Headers({ ...bearer, "x-envhq-crypto": "1" }))?.status).toBe(426);
  });

  test("lets a v2 CLI through", () => {
    expect(outdatedClientResponse("/api/projects", new Headers({ ...bearer, "X-EnvHQ-Crypto": "2" }))).toBeNull();
  });

  test("never checks browser (cookie) requests or unauthenticated ones", () => {
    expect(outdatedClientResponse("/api/projects", new Headers({ cookie: "envhq_session=x" }))).toBeNull();
    expect(outdatedClientResponse("/api/health", new Headers())).toBeNull();
  });

  test("leaves the frozen CLI login exchange alone", () => {
    expect(outdatedClientResponse("/api/cli/token", new Headers(bearer))).toBeNull();
  });
});
