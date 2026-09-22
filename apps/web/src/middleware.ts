import { NextResponse } from "next/server";
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

// Routes anyone can reach without a session.
const isPublicRoute = createRouteMatcher([
  "/",
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/terms",
  "/docs(.*)",
]);

export default clerkMiddleware(async (auth, req) => {
  // API routes authenticate themselves (Clerk session OR CLI bearer token),
  // so we let clerkMiddleware run but never force a redirect here.
  if (req.nextUrl.pathname.startsWith("/api")) return;

  // Signed-in visitors don't want the marketing page (RM-8). This lived in
  // `app/page.tsx` as an `auth()` call, which made the one page every
  // logged-out visitor lands on server-rendered on demand. Middleware runs
  // before the cache, so the personalised decision happens here and the page
  // itself stays a static asset. Exact match: only `/` redirects.
  if (req.nextUrl.pathname === "/") {
    const { userId } = await auth();
    if (userId) return NextResponse.redirect(new URL("/dashboard", req.url));
    return;
  }

  if (!isPublicRoute(req)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    // Skip Next internals and static files, run on everything else.
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpg|jpeg|gif|png|svg|ico|webp|woff2?|ttf|otf|map)).*)",
    // Always run on API routes.
    "/(api|trpc)(.*)",
  ],
};
