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
 * response matches its documented operation in openapi.yaml. Returns the
 * parsed body for further per-test assertions. Generic over `P` so each
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
  return { res, body };
}

export function expectStatus(res: Response, status: number): void {
  expect(res.status).toBe(status);
}
