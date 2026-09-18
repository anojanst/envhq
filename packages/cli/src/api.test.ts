import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * The CI-critical branch of `api.ts`: a `token_expired` 401 on an `ENVHQ_TOKEN`
 * session must NOT silently re-run the browser login — there's no browser in
 * CI, and the token can only be rotated by a human in the web app. (The
 * keychain branch that *does* re-login needs an interactive loopback server, so
 * it isn't reachable from here.)
 *
 * `$HOME` is redirected before importing, because config.ts resolves
 * `~/.envhq/config.json` once at module load.
 */
const SERVER = "https://envhq.test";

const home = await mkdtemp(join(tmpdir(), "envhq-home-"));
await mkdir(join(home, ".envhq"), { recursive: true });
await writeFile(join(home, ".envhq/config.json"), JSON.stringify({ url: SERVER }));
process.env.HOME = home;
process.env.USERPROFILE = home;
process.env.ENVHQ_TOKEN = "tok_ci";

const { apiClient, ApiError } = await import("./api.ts");

let calls: { url: string; headers: Record<string, string> }[] = [];
const realFetch = globalThis.fetch;

function stubFetch(respond: () => Response | Promise<Response>) {
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({
      url: String(input),
      headers: (init?.headers ?? {}) as Record<string, string>,
    });
    return respond();
  }) as typeof fetch;
}

const jsonResponse = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

beforeEach(() => {
  calls = [];
});
afterEach(() => {
  globalThis.fetch = realFetch;
});

test("an expired ENVHQ_TOKEN fails with a rotate-your-token message and never re-logs-in", async () => {
  stubFetch(() => jsonResponse(401, { error: "token_expired" }));

  await assert.rejects(
    () => apiClient.me(),
    (err: unknown) => {
      assert.ok(err instanceof ApiError);
      assert.match(err.message, /ENVHQ_TOKEN has expired/);
      assert.match(err.message, /Generate a new token in the web app/);
      return true;
    },
  );
  assert.equal(calls.length, 1, "exactly one request — no transparent retry for a CI token");
});

test("the bearer token and server url come from the resolved session", async () => {
  stubFetch(() => jsonResponse(200, { userId: "u_1" }));

  assert.deepEqual(await apiClient.me(), { userId: "u_1" });
  assert.equal(calls[0].url, `${SERVER}/api/me`);
  assert.equal(calls[0].headers.Authorization, "Bearer tok_ci");
});

test("a 401 that isn't token_expired reports an invalid token, not an expired one", async () => {
  stubFetch(() => jsonResponse(401, { error: "unauthorized" }));

  await assert.rejects(() => apiClient.me(), /token may be invalid or revoked/);
  assert.equal(calls.length, 1);
});

test("a non-401 failure surfaces the server's error and status", async () => {
  stubFetch(() => jsonResponse(409, { error: "version conflict", currentVersion: 7 }));

  await assert.rejects(
    () => apiClient.me(),
    (err: unknown) => {
      assert.ok(err instanceof ApiError);
      assert.equal(err.message, "version conflict");
      assert.equal(err.status, 409);
      assert.deepEqual(err.data, { error: "version conflict", currentVersion: 7 });
      return true;
    },
  );
});

test("an unreachable server is reported by url, not as a raw fetch error", async () => {
  stubFetch(() => {
    throw new TypeError("fetch failed");
  });

  await assert.rejects(() => apiClient.me(), new RegExp(`Could not reach ${SERVER}`));
});

test("an explicit auth override bypasses the stored session", async () => {
  stubFetch(() => jsonResponse(200, { userId: "u_2" }));

  await apiClient.me({ url: "https://other.test", token: "tok_override" });
  assert.equal(calls[0].url, "https://other.test/api/me");
  assert.equal(calls[0].headers.Authorization, "Bearer tok_override");
});
