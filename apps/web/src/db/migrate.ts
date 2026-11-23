import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { poolOptions } from "./pool";

/**
 * Applies pending migrations at server start — the self-hosted image's way
 * of upgrading (self-hosting phase 5). Off unless `ENVHQ_MIGRATE_ON_START`
 * is `true` (the Docker image sets it); envhq.dev still migrates by hand,
 * per docs/RELEASE_POLICY.md.
 *
 * Several replicas may start at once, so the run is serialized with a
 * Postgres advisory lock: the first applies, the rest wait and then find
 * nothing to do. Migrations are forward-only and additive by policy, which
 * is what makes "upgrade by restarting with a newer image" safe.
 */
const LOCK_KEY = 4_247_113; // arbitrary, fixed: "envhq migrations"

export async function runMigrations(migrationsFolder: string): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const sql = postgres(url, { ...poolOptions(), max: 1 });
  try {
    await sql`select pg_advisory_lock(${LOCK_KEY})`;
    await migrate(drizzle(sql), { migrationsFolder });
  } finally {
    await sql`select pg_advisory_unlock(${LOCK_KEY})`.catch(() => undefined);
    await sql.end();
  }
}
