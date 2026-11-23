import type { Instrumentation } from "next";

/**
 * Runs once per server process, before it serves anything. The self-hosted
 * image sets `ENVHQ_MIGRATE_ON_START=true`, so upgrading is "run the newer
 * image": pending migrations apply here, and a failure stops the process
 * instead of serving against a schema it doesn't understand.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.ENVHQ_MIGRATE_ON_START !== "true") return;
  const { runMigrations } = await import("@/db/migrate");
  const folder = process.env.ENVHQ_MIGRATIONS_DIR || "src/db/migrations";
  console.log(`[envhq] applying migrations from ${folder}`);
  await runMigrations(folder);
  console.log("[envhq] database is up to date");
}

/**
 * Next's own error hook (RM-18). It fires for an uncaught error anywhere the
 * framework runs one — route handlers, server components, middleware — so
 * this is the seam that needs no change at ~50 call sites and cannot be
 * forgotten when a new route is added.
 *
 * The alternative considered was wrapping `withPerf`, which already exists
 * at every measured entry point. It covers 15 of them; this covers all of
 * them, including the pages, which is where an unhandled render error would
 * otherwise have gone unnoticed entirely.
 *
 * `reportError` is imported lazily, inside the handler. This module is
 * evaluated in both the Node and Edge runtimes, and `lib/observability.ts`
 * pulls in `@/db`, which opens a Postgres pool and throws at import time
 * without `DATABASE_URL`. A static import would therefore make an
 * instrumentation file — which Next loads before anything else — able to
 * break the whole app on a misconfigured environment.
 */
export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  // Edge has no Postgres client. Errors there still reach the platform log;
  // they just don't reach the grouped store.
  if (process.env.NEXT_RUNTIME !== "nodejs") {
    console.error("[error] (edge)", context.routePath, error);
    return;
  }

  const { reportError } = await import("@/lib/observability");
  await reportError(error, {
    // `routePath` is the route *pattern* — `/api/projects/[id]` — not the
    // resolved URL. That is exactly what should be recorded: a real URL
    // carries project and environment ids, and grouping on it would make
    // every project its own issue.
    route: context.routePath || "unknown",
    kind: context.routerKind === "Pages Router" ? "PagesRouterError" : undefined,
  });
};
