import { NextResponse } from "next/server";
import { publicOrigin } from "@/lib/public-url";
import { SESSION_COOKIE, SIGNED_OUT_COOKIE, SIGNED_OUT_TTL_S, cookieOptions } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Ends EnvHQ's session and marks the browser as signed out, so the next
 * "Continue" asks the provider for a fresh login (`signInPrompt` in
 * lib/session.ts) instead of letting the last person straight back in.
 *
 * Deliberately NOT a redirect to the provider's `end_session_endpoint`. That
 * doesn't work the same way across providers: Okta refuses it without an
 * `id_token_hint` (which would mean keeping the provider's ID token, and we
 * keep none), Entra and Keycloak need the post-logout URL registered, and
 * Clerk and Google have no such endpoint at all. It would also sign people
 * out of their whole company SSO when they only meant to leave EnvHQ. The
 * fresh-login prompt gives the same protection for EnvHQ on every provider.
 *
 * POST only: a sign-out that a link or an <img> could trigger would let any
 * page log you out.
 */
export async function POST(req: Request) {
  const res = NextResponse.redirect(`${publicOrigin(req.url)}/`, 303);
  res.cookies.delete(SESSION_COOKIE);
  res.cookies.set(SIGNED_OUT_COOKIE, "1", cookieOptions(req.url, SIGNED_OUT_TTL_S));
  res.headers.set("Cache-Control", "private, no-store");
  return res;
}
