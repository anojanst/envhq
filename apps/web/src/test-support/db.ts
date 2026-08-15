import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "@/db/schema";

// Real Postgres client for the `authz-db` vitest project — see
// apps/web/vitest.config.mts for why this can't be the production
// (neon-http) `db` export. `mock-db.setup.ts` swaps this in wherever
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

export const testDb = drizzle(pool, { schema });
export { schema };
