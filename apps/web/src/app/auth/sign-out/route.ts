import { NextResponse } from "next/server";
import { client, oidcConfig, publicOrigin } from "@/lib/oidc";
import { SESSION_COOKIE } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Ends EnvHQ's session, then — if the provider offers one — its own, so the
 * next "Continue" asks for credentials again. POST only: a sign-out that a
 * link or an <img> could trigger would let any page log you out.
 */
export async function POST(req: Request) {
  const home = `${publicOrigin(req.url)}/`;
  let target = home;
  try {
    const config = await oidcConfig();
    if (config.serverMetadata().end_session_endpoint) {
      target = client
        .buildEndSessionUrl(config, { post_logout_redirect_uri: home, client_id: config.clientMetadata().client_id })
        .toString();
    }
  } catch {
    // Provider unreachable: still sign out of EnvHQ.
  }
  const res = NextResponse.redirect(target, 303);
  res.cookies.delete(SESSION_COOKIE);
  res.headers.set("Cache-Control", "private, no-store");
  return res;
}
