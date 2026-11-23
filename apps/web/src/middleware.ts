import { NextResponse, type NextRequest } from "next/server";
import { publicUrl } from "@/lib/public-url";
import { SESSION_COOKIE, SESSION_REFRESH_AFTER_S, cookieOptions, openSession, sealSession, SESSION_TTL_S } from "@/lib/session";

/**
 * Page-level sign-in gate (self-hosting phase 3). Edge runtime.
 *
 * Reads EnvHQ's own session cookie (`lib/session.ts`) — no identity-provider
 * call on any request. Pages outside the public list need a session, and a
 * visitor without one is sent to /sign-in with a way back. A session older
 * than a day is re-issued, so people who keep using EnvHQ stay signed in.
 */

// Routes anyone can reach without a session.
const PUBLIC = [/^\/$/, /^\/sign-in(\/.*)?$/, /^\/sign-up(\/.*)?$/, /^\/auth\//, /^\/terms$/, /^\/docs(\/.*)?$/];

export async function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;

  // API routes authenticate themselves (session cookie OR CLI bearer token)
  // and answer 401 rather than redirecting.
  if (pathname.startsWith("/api")) return;

  const session = await openSession(req.cookies.get(SESSION_COOKIE)?.value);

  // Signed-in visitors don't want the marketing page (RM-8). Deciding here,
  // before the cache, is what lets `/` stay a static asset. Exact match only.
  if (pathname === "/") {
    return session ? NextResponse.redirect(publicUrl("/dashboard", req.url)) : undefined;
  }

  if (PUBLIC.some((re) => re.test(pathname))) return;

  if (!session) {
    const signIn = publicUrl("/sign-in", req.url);
    signIn.searchParams.set("redirect_url", `${pathname}${search}`);
    return NextResponse.redirect(signIn);
  }

  if (Date.now() / 1000 - session.iat > SESSION_REFRESH_AFTER_S) {
    const res = NextResponse.next();
    res.cookies.set(SESSION_COOKIE, await sealSession(session.userId), cookieOptions(req.url, SESSION_TTL_S));
    return res;
  }
}

export const config = {
  matcher: [
    // Skip Next internals and static files, run on everything else.
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpg|jpeg|gif|png|svg|ico|webp|woff2?|ttf|otf|map)).*)",
    // Always run on API routes.
    "/(api|trpc)(.*)",
  ],
};
