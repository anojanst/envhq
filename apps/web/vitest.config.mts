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
// This config does not provision that Postgres instance — no suite added
// here needs one yet (`src/lib/api.ts` only imports `next/server`). Wiring
// it up (service container + seed fixtures) is scoped to the ticket that
// adds the authorization matrix suite.
export default defineConfig({
  test: {
    environment: "node",
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
});
