import { NextResponse } from "next/server";
import { callbackUrl, client, oidcConfig, oidcSettings } from "@/lib/oidc";
import { FLOW_COOKIE, FLOW_TTL_S, cookieOptions, safeReturnTo, sealFlow } from "@/lib/session";
import { reportError } from "@/lib/observability";
import { publicUrl } from "@/lib/public-url";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Starts a sign-in: remembers state, nonce and a PKCE verifier in a short,
 * encrypted cookie, then sends the browser to the identity provider.
 * `?redirect_url=` is where to land afterwards (same-origin paths only).
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const returnTo = safeReturnTo(url.searchParams.get("redirect_url"));
  try {
    const config = await oidcConfig();
    const verifier = client.randomPKCECodeVerifier();
    const state = client.randomState();
    const nonce = client.randomNonce();
    const target = client.buildAuthorizationUrl(config, {
      redirect_uri: callbackUrl(req.url),
      scope: oidcSettings().scopes,
      code_challenge: await client.calculatePKCECodeChallenge(verifier),
      code_challenge_method: "S256",
      state,
      nonce,
    });
    const res = NextResponse.redirect(target);
    res.cookies.set(FLOW_COOKIE, await sealFlow({ state, nonce, verifier, returnTo }), cookieOptions(req.url, FLOW_TTL_S));
    res.headers.set("Cache-Control", "private, no-store");
    return res;
  } catch (error) {
    await reportError(error, { route: "auth/sign-in", kind: "SignInStartFailed" });
    return NextResponse.redirect(publicUrl("/sign-in?error=provider", req.url));
  }
}
