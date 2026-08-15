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
    ],
  },
});
