import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

// Routes anyone can reach without a session.
const isPublicRoute = createRouteMatcher(["/", "/sign-in(.*)", "/sign-up(.*)"]);

export default clerkMiddleware(async (auth, req) => {
  // API routes authenticate themselves (Clerk session OR CLI bearer token),
  // so we let clerkMiddleware run but never force a redirect here.
  if (req.nextUrl.pathname.startsWith("/api")) return;

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
