import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";

// Runs once, before any file in the `authz-db` vitest project, against a
// standalone connection — globalSetup executes outside the test files'
// module graph, so it can't reuse test-support/db.ts's client. Applies the
// same migrations production runs (apps/web/src/db/migrations), via a real
// Postgres driver rather than `drizzle-kit migrate` (which reads the
// production DATABASE_URL var, not TEST_DATABASE_URL).
export default async function setup() {
  const connectionString = process.env.TEST_DATABASE_URL;
  if (!connectionString) {
    throw new Error("TEST_DATABASE_URL is not set — the authz-db test project needs a real Postgres instance.");
  }

  const pool = new Pool({ connectionString });
  try {
    await migrate(drizzle(pool), { migrationsFolder: "./src/db/migrations" });
  } finally {
    await pool.end();
  }
}
