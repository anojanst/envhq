import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { callbackUrl, client, oidcConfig, oidcSettings, SignInRefused, toSignedInUser } from "@/lib/oidc";
import {
  FLOW_COOKIE,
  SESSION_COOKIE,
  SESSION_TTL_S,
  SIGNED_OUT_COOKIE,
  cookieOptions,
  openFlow,
  promptRejected,
  sealSession,
} from "@/lib/session";
import { upsertUserProfile } from "@/lib/user-profiles";
import { reportError } from "@/lib/observability";
import { publicUrl } from "@/lib/public-url";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The identity provider sends the browser back here with a code. We check
 * state, nonce and PKCE (openid-client), read who signed in, refresh their
 * display profile, and issue EnvHQ's own session cookie. The provider's
 * tokens are used once, here, and never stored.
 */
export async function GET(req: Request) {
  const jar = await cookies();
  const flow = await openFlow(jar.get(FLOW_COOKIE)?.value);
  const fail = (code: string) => {
    const res = NextResponse.redirect(publicUrl(`/sign-in?error=${code}`, req.url));
    res.cookies.delete(FLOW_COOKIE);
    return res;
  };
  if (!flow) return fail("expired");

  const providerError = new URL(req.url).searchParams.get("error");
  if (providerError) {
    const res = fail("callback");
    if (promptRejected(providerError)) res.cookies.delete(SIGNED_OUT_COOKIE);
    // The code is from the query string, so anyone can type anything: keep
    // only a short OAuth-style code, so it can't flood error grouping.
    const code = /^[a-z_]{1,40}$/.test(providerError) ? providerError : "unrecognised";
    await reportError(new Error(`Identity provider returned ${code}`), {
      route: "auth/callback",
      kind: "SignInProviderError",
    });
    return res;
  }

  try {
    const config = await oidcConfig();
    // Rebuilt on the public origin: behind a proxy, req.url's host isn't the
    // one the provider redirected to, and the redirect_uri must match exactly.
    const current = new URL(callbackUrl(req.url));
    current.search = new URL(req.url).search;

    const tokens = await client.authorizationCodeGrant(config, current, {
      pkceCodeVerifier: flow.verifier,
      expectedState: flow.state,
      expectedNonce: flow.nonce,
      idTokenExpected: true,
    });
    let claims: Record<string, unknown> = { ...tokens.claims() };
    if (!claims.email || !claims.name) {
      // Some providers keep profile claims out of the ID token.
      try {
        claims = { ...(await client.fetchUserInfo(config, tokens.access_token, String(claims.sub))), ...claims };
      } catch {
        // Display fields only; the sign-in itself already succeeded.
      }
    }

    const user = toSignedInUser(claims, oidcSettings());
    await upsertUserProfile(user);

    const res = NextResponse.redirect(publicUrl(flow.returnTo, req.url));
    res.cookies.set(SESSION_COOKIE, await sealSession(user.userId), cookieOptions(req.url, SESSION_TTL_S));
    res.cookies.delete(FLOW_COOKIE);
    // Signed in again: the next sign-in needn't force a fresh login. Only on
    // success — a failed attempt after a sign-out must still prompt on retry.
    res.cookies.delete(SIGNED_OUT_COOKIE);
    res.headers.set("Cache-Control", "private, no-store");
    return res;
  } catch (error) {
    if (error instanceof SignInRefused) return fail(error.code);
    await reportError(error, { route: "auth/callback", kind: "SignInCallbackFailed" });
    return fail("callback");
  }
}
