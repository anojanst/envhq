import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "@/db/schema";
import { countQuery } from "@/lib/perf";

// Real Postgres client for the `authz-db` vitest project — see
// apps/web/vitest.config.mts for why this is a separate client rather than
// the production `db` export: that one binds to `DATABASE_URL` at import
// time, while tests must bind to `TEST_DATABASE_URL`. It is no longer a
// protocol limitation — production is postgres-js now, not neon-http.
// `mock-db.setup.ts` swaps this in wherever
// `apps/web/src/lib/access.ts` imports "@/db".
const connectionString = process.env.TEST_DATABASE_URL;
if (!connectionString) {
  throw new Error(
    "TEST_DATABASE_URL is not set — the authz-db test project needs a real Postgres instance. " +
      "Set it to a local Postgres (e.g. postgres://postgres:postgres@localhost:5432/envhq_test) " +
      "or the CI service container's connection string.",
  );
}

const pool = new Pool({ connectionString });

// Same query counter as production (`src/db/index.ts`) so the RM-5 perf harness
// measures real per-request query counts through this client too. Ignores the
// query text and parameters — see the invariant in `src/lib/perf.ts`.
const queryCounter = { logQuery: () => countQuery() };

export const testDb = drizzle(pool, { schema, logger: queryCounter });
export { schema };
