import { NextResponse } from "next/server";

/**
 * RM-8: no authenticated response may be held by a shared cache.
 *
 * Every route under `src/app/api` answers as the caller — the same URL
 * returns one org's projects to one user and nothing at all to the next — so
 * a CDN or proxy that kept a copy would serve one customer's data to another.
 * Next marks dynamic responses uncacheable already, and Vercel does not cache
 * function responses that don't ask to be cached, but neither of those is a
 * promise we are holding: the guarantee has to be in the response itself,
 * because the intermediaries that matter are the ones between us and the
 * caller, and they have only the header to go on.
 *
 * `private` bars shared caches specifically; `no-store` stops even the
 * browser keeping a copy on disk. Nothing under `api/` is safely cacheable
 * per-user either, so there is no case here for `private, max-age=...`.
 *
 * Enforced on every route the contract suite touches, not just written here:
 * `test-support/contract/helpers.ts` asserts it on each response, so a new
 * route that bypasses this module fails on its first test.
 */
const NO_STORE = "private, no-store";

export function json<T>(data: T, status = 200) {
  return NextResponse.json(data, { status, headers: { "Cache-Control": NO_STORE } });
}

export function apiError(message: string, status: number) {
  return json({ error: message }, status);
}

export const unauthorized = () => apiError("Unauthorized", 401);
// Distinct from `unauthorized`: signals the CLI to transparently re-run its
// browser login instead of treating the token as permanently invalid.
export const tokenExpired = () => apiError("token_expired", 401);
export const forbidden = (message = "Forbidden") => apiError(message, 403);
export const notFound = (what = "Not found") => apiError(what, 404);
export const badRequest = (message: string) => apiError(message, 400);
export const conflict = (message: string) => apiError(message, 409);
// A commitVersion() CAS loss — someone else changed this environment first.
export const versionConflict = () =>
  apiError("This environment changed elsewhere — refresh and try again.", 409);
