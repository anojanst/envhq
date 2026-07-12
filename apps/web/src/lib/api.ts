import { NextResponse } from "next/server";

export function json<T>(data: T, status = 200) {
  return NextResponse.json(data, { status });
}

export function apiError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
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
