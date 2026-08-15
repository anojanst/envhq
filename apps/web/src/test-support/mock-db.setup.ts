import { vi } from "vitest";
import { testDb, schema } from "./db";

// Substitutes the production neon-http `db` (apps/web/src/db/index.ts) with
// a real Postgres client for every file in the `authz-db` vitest project —
// see apps/web/vitest.config.mts for why. Scoped to that project only, so
// DB-free suites (e.g. api.test.ts) never load this and never need
// TEST_DATABASE_URL.
vi.mock("@/db", () => ({ db: testDb, schema }));
