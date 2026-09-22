import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "./schema";
import { countQuery } from "@/lib/perf";
import { poolOptions } from "./pool";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not set");
}

/**
 * RM-8: the pool this process opens is not the only one. On Vercel every
 * concurrent invocation is its own instance with its own pool, so the
 * database sees `instances x max` connections, not `max`. The sizing, the
 * idle reclaim and the prepared-statement decision all live in `./pool.ts`,
 * which is pure and directly tested; this module only binds it to the
 * environment. The ceiling arithmetic an operator needs is in
 * `docs/OPERATIONS.md`.
 */
function createClient() {
  // Non-null: the throw above guarantees this by the time createClient runs;
  // TS doesn't carry that narrowing across the function boundary on its own.
  return postgres(connectionString!, poolOptions());
}

// Next's dev server re-evaluates this module on every hot reload without
// restarting the process. A plain module-scope client would open a fresh
// connection pool on every save; stashing it on `globalThis` outside
// production makes HMR reuse the same pool instead of leaking a new one.
const globalForDb = globalThis as unknown as { dbClient?: ReturnType<typeof postgres> };
const client = globalForDb.dbClient ?? createClient();
if (process.env.NODE_ENV !== "production") globalForDb.dbClient = client;

/**
 * Query counting for the RM-5 performance baseline. Drizzle calls `logQuery`
 * once per executed query on every code path (prepared, streamed and raw), so
 * this is an exact per-request count wherever a `withPerf` span is open, and a
 * no-op everywhere else.
 *
 * The query text and parameters handed to this hook are deliberately ignored
 * and never forwarded — parameters carry ciphertext and variable names. See the
 * invariant at the top of `src/lib/perf.ts`.
 */
const queryCounter = { logQuery: () => countQuery() };

export const db = drizzle(client, { schema, logger: queryCounter });
export { schema };
