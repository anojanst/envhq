import { expect } from "vitest";
import { assertResponseMatchesSpec } from "@/test-support/openapi-contract";

/** Builds a `Request` for a route handler; `path` is used as-is as the URL. */
export function req(path: string, opts: { method: string; token?: string; json?: unknown }): Request {
  const headers: Record<string, string> = {};
  if (opts.token) headers.authorization = `Bearer ${opts.token}`;
  if (opts.json !== undefined) headers["content-type"] = "application/json";
  return new Request(`http://test.local${path}`, {
    method: opts.method,
    headers,
    body: opts.json !== undefined ? JSON.stringify(opts.json) : undefined,
  });
}

export type Handler<P extends Record<string, string> = Record<string, string>> = (
  req: Request,
  ctx: { params: Promise<P> },
) => Promise<Response>;

/**
 * Invokes a route handler directly (no live server) and asserts the
 * response matches its documented operation in openapi.yaml, and that it
 * forbids shared caching (RM-8). Returns the parsed body for further
 * per-test assertions. Generic over `P` so each
 * call site's specific `{ id: string }` / `{ id, grantId }` / etc. params
 * shape flows through instead of fighting a fixed `Record<string, string>`
 * (Next.js route handlers take a concrete params shape, and function
 * parameters are checked contravariantly, so a fixed broader type here
 * wouldn't be assignable to any of them).
 */
export async function call<P extends Record<string, string>>(
  handler: Handler<P>,
  path: string,
  params: P,
  opts: { method: string; token?: string; json?: unknown },
): Promise<{ res: Response; body: unknown }> {
  const res = await handler(req(path, opts), { params: Promise.resolve(params) });
  const body = await res.json().catch(() => null);
  await assertResponseMatchesSpec(opts.method, path, res.status, body);
  expectNoSharedCaching(res, `${opts.method} ${path}`);
  return { res, body };
}

export function expectStatus(res: Response, status: number): void {
  expect(res.status).toBe(status);
}

/**
 * RM-8's second acceptance criterion — "no authenticated response is cached
 * by a shared cache" — enforced for every route this suite touches rather
 * than in a test of its own, because the risk is a *new* route forgetting,
 * not the existing ones regressing. `call()` is the only way a contract test
 * reaches a handler, so a route added without going through `lib/api.ts`
 * fails here on its first test.
 *
 * Asserted on the response, not on the helper that built it: the guarantee
 * belongs to what leaves the server.
 */
export function expectNoSharedCaching(res: Response, what: string): void {
  const header = res.headers.get("cache-control") ?? "";
  const directives = header.split(",").map((d) => d.trim().toLowerCase());
  expect(directives, `${what} must forbid shared caching, got Cache-Control: ${header || "(none)"}`)
    .toContain("private");
  expect(directives, `${what} must not be stored, got Cache-Control: ${header || "(none)"}`)
    .toContain("no-store");
}
