import { NextResponse } from "next/server";

// Machine-readable companion to the `error` string (ADR-010) — additive
// only, since shipped CLI versions still match on `error`'s exact text.
export type ErrorCode =
  | "unauthorized"
  | "token_expired"
  | "forbidden"
  | "not_found"
  | "bad_request"
  | "conflict"
  | "version_conflict";

export function json<T>(data: T, status = 200) {
  return NextResponse.json(data, { status });
}

export function apiError(message: string, status: number, code: ErrorCode) {
  return NextResponse.json({ error: message, code }, { status });
}

export const unauthorized = () => apiError("Unauthorized", 401, "unauthorized");
// Distinct from `unauthorized`: signals the CLI to transparently re-run its
// browser login instead of treating the token as permanently invalid.
export const tokenExpired = () => apiError("token_expired", 401, "token_expired");
export const forbidden = (message = "Forbidden") => apiError(message, 403, "forbidden");
export const notFound = (what = "Not found") => apiError(what, 404, "not_found");
export const badRequest = (message: string) => apiError(message, 400, "bad_request");
export const conflict = (message: string) => apiError(message, 409, "conflict");
// A commitVersion() CAS loss — someone else changed this environment first.
export const versionConflict = () =>
  apiError("This environment changed elsewhere — refresh and try again.", 409, "version_conflict");
