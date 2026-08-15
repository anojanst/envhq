import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not set");
}

/**
 * Optional PEM contents for a custom root CA. Azure Database for PostgreSQL
 * has historically required its own root CA (ADR-015) — this is a stated
 * deployment requirement, not optional hardening.
 *
 * When unset, `ssl` is deliberately left undefined rather than forced on:
 * postgres-js already parses `sslmode` off `DATABASE_URL` itself (e.g.
 * `?sslmode=require`), so forcing it here would override a connection
 * string that intentionally specifies its own mode (including
 * `sslmode=disable` for local/plain Postgres) instead of deferring to it.
 */
const caCert = process.env.DATABASE_CA_CERT;

function createClient() {
  // Non-null: the throw above guarantees this by the time createClient runs;
  // TS doesn't carry that narrowing across the function boundary on its own.
  return postgres(connectionString!, {
    max: Number(process.env.DATABASE_POOL_MAX ?? 10),
    ...(caCert ? { ssl: { ca: caCert, rejectUnauthorized: true } } : {}),
  });
}

// Next's dev server re-evaluates this module on every hot reload without
// restarting the process. A plain module-scope client would open a fresh
// connection pool on every save; stashing it on `globalThis` outside
// production makes HMR reuse the same pool instead of leaking a new one.
const globalForDb = globalThis as unknown as { dbClient?: ReturnType<typeof postgres> };
const client = globalForDb.dbClient ?? createClient();
if (process.env.NODE_ENV !== "production") globalForDb.dbClient = client;

export const db = drizzle(client, { schema });
export { schema };
