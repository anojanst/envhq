import { defineConfig } from "vitest/config";
import path from "node:path";

// Database strategy (ADR-011 follow-up, HQ-18):
//
// Tests run against a REAL Postgres instance, not a stubbed/mocked db client.
// The authorization matrix suite this runner unblocks
// (`apps/web/src/lib/access.ts`) issues real Drizzle queries across
// `projects`, `access_grants`, `group_members`, `environments`, and
// `env_vars`. Hand-stubbing that many query shapes would mean reimplementing
// a meaningful slice of Drizzle's chainable query builder in test doubles —
// high maintenance cost, and it tests the stub's behavior instead of the
// database's, which defeats the point of an authorization test.
//
// Production (`apps/web/src/db/index.ts`) talks to Neon over its HTTP driver
// (`drizzle-orm/neon-http`), which isn't something a plain local/CI Postgres
// speaks. Test suites that need a database should instead open their own
// `drizzle-orm/node-postgres` client against a real Postgres — a local
// instance for development, a `postgres:` service container in CI — using
// the same `./src/db/schema.ts`. The driver differs from production, but the
// schema, SQL, and constraints are real, which is what an authorization
// suite needs to be trustworthy.
//
// Wiring (HQ-19, `apps/web/src/test-support/`): a `TEST_DATABASE_URL`-backed
// node-postgres client (`test-support/db.ts`) is substituted for the
// production `db` export (`test-support/mock-db.setup.ts`) via `vi.mock`,
// scoped to the `authz-db` project below so DB-free suites never need
// Postgres at all. Migrations run once via `test-support/migrate.global-setup.ts`.
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
  test: {
    // RM-4's coverage floor. Scoped to `src/lib` deliberately: that is where
    // the authorization matrix and the key-management code live, and it is
    // the code a silently-deleted test file would stop protecting. Pages and
    // route handlers are covered by the `contract` project end-to-end, but
    // measuring them here would turn the number into a proxy for "how much
    // UI exists" rather than "is the domain logic still tested".
    //
    // The thresholds are a FLOOR, not a target. RM-4's gotcha is explicit:
    // "Coverage as a number is a bad target. The floor exists to catch
    // deletions, not to be raised for its own sake." Raise these only when a
    // deliberate new test suite makes the old floor meaningless — never to
    // chase a rounder number.
    coverage: {
      provider: "v8",
      include: ["src/lib/**"],
      exclude: ["src/lib/**/*.test.ts", "src/lib/**/*.fixtures.json"],
      reporter: ["text-summary", "json-summary"],
      thresholds: {
        // Floors measured on 2026-09-19, set ~1 point under what this suite
        // actually produces so ordinary v8 counting noise doesn't fail a
        // build. Actuals then: lines 73.35, functions 72.84, statements
        // 69.75, branches 60.95. Refresh with the command in docs/CI.md --
        // and only when a new suite makes the old floor meaningless, never to
        // chase a rounder number.
        lines: 72,
        functions: 71,
        statements: 68,
        branches: 59,
        // access.ts is the authorization matrix -- the module this floor
        // exists for. It is fully line-covered by the `authz-db` project and
        // has no business regressing, so it carries its own floor instead of
        // hiding inside the average. Actuals: lines 100, functions 100,
        // statements 95.45, branches 92.3.
        //
        // Verified against this vitest version: a glob threshold does NOT
        // remove the file from the global numbers above, so access.ts is
        // counted twice -- once on its own, once in the average. That is
        // intentional; it means a deletion fails both checks.
        "src/lib/access.ts": {
          lines: 100,
          functions: 100,
          statements: 95,
          branches: 92,
        },
      },
    },
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          environment: "node",
          exclude: [
            "**/node_modules/**",
            "**/dist/**",
            "src/lib/access-matrix.test.ts",
            "src/lib/access.list.test.ts",
            "src/test-support/contract/**/*.test.ts",
            "src/test-support/perf/**/*.test.ts",
          ],
          // apps/web/src/db/index.ts throws at import time if DATABASE_URL
          // is unset, and access.ts (imported by access.helpers.test.ts for
          // its pure helpers) pulls that module in transitively. This never
          // resolves to a real connection here — `neon()` only builds a
          // query function, it doesn't connect eagerly — and nothing in the
          // "unit" project ever issues a query. Same placeholder pattern the
          // CI build step already uses.
          env: { DATABASE_URL: "postgres://placeholder:placeholder@localhost:5432/placeholder" },
        },
      },
      {
        extends: true,
        test: {
          name: "authz-db",
          environment: "node",
          include: ["src/lib/access-matrix.test.ts", "src/lib/access.list.test.ts"],
          setupFiles: ["./src/test-support/mock-db.setup.ts", "./src/test-support/mock-orgs.ts"],
          globalSetup: ["./src/test-support/migrate.global-setup.ts"],
          // Only two files touch the shared Postgres service container —
          // serializing them is cheap and avoids reasoning about concurrent
          // truncate/insert seeding against the one instance.
          fileParallelism: false,
        },
      },
      {
        extends: true,
        test: {
          // HQ-53's contract suite: replays requests through the real route
          // handlers (in-process, no live server) against a real Postgres
          // instance, and validates every response against openapi.yaml —
          // same real-DB rationale as "authz-db" above.
          name: "contract",
          environment: "node",
          include: ["src/test-support/contract/**/*.test.ts"],
          setupFiles: [
            "./src/test-support/mock-db.setup.ts",
            "./src/test-support/mock-orgs.ts",
            "./src/test-support/mock-clerk.setup.ts",
          ],
          globalSetup: ["./src/test-support/migrate.global-setup.ts"],
          // Same shared-container reasoning as "authz-db".
          fileParallelism: false,
        },
      },
      {
        extends: true,
        test: {
          // RM-5's performance baseline. Same real-Postgres + mocked-Clerk
          // setup as "contract", but it measures rather than asserts, and it
          // seeds a deliberately large sample (~2,000 rows).
          //
          // NOT part of `pnpm test` — the `test` script names the other three
          // projects explicitly so CI time is unaffected. Run it with
          // `pnpm --filter @envhq/web test:perf` when refreshing
          // docs/PERF_BASELINE.md.
          name: "perf",
          environment: "node",
          include: ["src/test-support/perf/**/*.test.ts"],
          setupFiles: [
            "./src/test-support/mock-db.setup.ts",
            "./src/test-support/mock-orgs.ts",
            "./src/test-support/mock-clerk.setup.ts",
          ],
          globalSetup: ["./src/test-support/migrate.global-setup.ts"],
          fileParallelism: false,
        },
      },
    ],
  },
});
