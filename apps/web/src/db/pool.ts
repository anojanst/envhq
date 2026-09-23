import type { Options, PostgresType } from "postgres";

/**
 * Connection-pool configuration for the production postgres-js client (RM-8).
 *
 * Split out of `db/index.ts` so it can be tested directly: `db/index.ts` reads
 * `DATABASE_URL` and builds a live pool at import time, and the `authz-db`,
 * `contract` and `perf` projects replace that module wholesale via
 * `vi.mock("@/db", ...)`. This module is pure — a URL and an environment in,
 * an options object out — so the unit tests and the load test in
 * `test-support/perf/connections.test.ts` exercise the real configuration
 * rather than a copy of it that can drift.
 *
 * THE PROBLEM THIS SOLVES. On Vercel each concurrent invocation is its own
 * instance with its own pool, so the database sees `instances x max`
 * connections, not `max`. postgres-js defaults to `max: 10` and
 * `idle_timeout: null` — ten connections per instance, held until the
 * instance is torn down. Ten instances is a hundred connections, which is the
 * entire `max_connections` of a stock Postgres, reached while the app itself
 * looks idle. `docs/OPERATIONS.md` carries the ceiling arithmetic and what to
 * change when the connection string moves to a pooled endpoint.
 */

/**
 * Connections per instance.
 *
 * Three is the most concurrent queries any single request issues: the widest
 * fan-out on a request path is the environment editor's two parallel queries,
 * after the one it awaits first. So this is "what one request actually
 * needs", which is the sizing RM-8 asks for, and nothing spare.
 *
 * It is deliberately not larger, and the measurements say what that costs.
 * At 50 concurrent requests against Postgres 17:
 *
 * | max | wall, sub-ms queries | wall, 5ms per query |
 * |-----|----------------------|---------------------|
 * | 1   | 149 ms               | 4748 ms             |
 * | 3   | 109 ms               | 1854 ms             |
 * | 10  | 117 ms               | 852 ms              |
 * | 20  | 120 ms               | 464 ms              |
 *
 * The first column plateaus by 3 and then gets slightly worse, which is easy
 * to mistake for "3 is optimal". It isn't: against a local socket a query
 * finishes in microseconds, so a connection is barely held. Add 5ms of hold
 * time — still optimistic for a hosted database across a network — and the
 * plateau vanishes. Throughput tracks pool size all the way up, because what
 * a connection costs is the time it is *held*, and that is latency.
 *
 * So a bigger pool is genuinely faster per instance, and the reason to refuse
 * it is not performance. Measured later through a real PgBouncer, with ten
 * instances each holding their own pool against a 100-connection Postgres:
 * at `max: 10` the database runs out of connections and refuses 11 requests,
 * and at 20 it refuses 438 of 500. The `instances x max` arithmetic above is
 * not a worry, it is that.
 *
 * Behind a transaction-mode pooler those connections stop being real
 * backends — 200 client connections produced 64 — and nothing fails at any
 * setting. That is what makes raising this safe, and the moment to do it is
 * the connection-string change. Deliberately an operator's decision rather
 * than something inferred from the URL's shape: a direct database that
 * merely looked pooled would get a pool three times too large, which the
 * numbers above show is an outage rather than a slowdown.
 *
 * `docs/OPERATIONS.md` carries both measured tables, and why 10 is the knee
 * rather than a maximum.
 */
export const DEFAULT_POOL_MAX = 3;

/**
 * Seconds a connection may sit unused before it is closed. postgres-js
 * defaults to `null`, meaning never — fine for a long-lived server, wrong for
 * serverless, where an instance that served one burst at 09:00 would still be
 * holding its connections at 09:05 while contributing nothing. Reclaiming
 * them is what keeps `instances x max` a peak rather than a floor.
 */
export const IDLE_TIMEOUT_SECONDS = 20;

/**
 * Fail a request that cannot get a connection rather than hanging on it.
 * postgres-js defaults to 30s, which outlives most function timeouts: the
 * invocation is killed before the driver ever reports why, so the failure
 * arrives as a timeout with no cause attached.
 */
export const CONNECT_TIMEOUT_SECONDS = 10;

/** Identifies our connections in `pg_stat_activity`, for the operator and for the load test. */
export const APPLICATION_NAME = "envhq-web";

interface PoolEnv {
  DATABASE_POOL_MAX?: string;
  DATABASE_PREPARE?: string;
  DATABASE_CA_CERT?: string;
  /** `process.env` carries plenty besides these three; the index signature is what lets it be passed. */
  [key: string]: string | undefined;
}

/**
 * Whether to use named prepared statements. Defaults to postgres-js's own
 * `true`, and this is the one setting RM-8 told us to go and check rather
 * than reason about, so it was checked — against PgBouncer 1.25 in
 * transaction mode, which is the configuration the warning is about.
 *
 * The expected failure did not happen. 400 queries, 20 clients multiplexed
 * over 5 backends, pooler-side statement tracking explicitly disabled: zero
 * errors. postgres-js recovers on its own — it watches for the
 * `FetchPreparedStatement` error routine, drops the cached statement and
 * re-executes once (`src/connection.js`, `retryRoutines`). So "prepared
 * statements break behind a transaction pooler" is not true of this driver.
 * It is a cost, not a fault, and the cost depends on something the URL cannot
 * tell us — whether the pooler tracks statements itself. Median per query:
 *
 * | target                              | prepare: true | prepare: false |
 * |-------------------------------------|---------------|----------------|
 * | direct                              | **0.025 ms**  | 0.031 ms       |
 * | PgBouncer txn, no tracking          | 0.064 ms      | **0.037 ms**   |
 * | PgBouncer txn, tracking (1.25 dflt) | **0.023 ms**  | 0.036 ms       |
 *
 * Which is why this is not inferred from the connection string. Disabling
 * prepared statements whenever the URL looks pooled — the obvious reading of
 * the ticket, and what this module did before the numbers came in — would be
 * the wrong call against a pooler that tracks them, and tracking has been
 * PgBouncer's default since 1.24. The fastest choice for both configurations
 * we expect to meet (direct, and a modern pooler) is the same one: leave it
 * on. `DATABASE_PREPARE=false` is here for the middle row.
 */
function shouldPrepare(raw: string | undefined): boolean {
  return !(raw === "false" || raw === "0");
}

/**
 * The exact options the production pool is built with.
 *
 * `ssl` is deliberately absent unless a custom CA is supplied: postgres-js
 * parses `sslmode` off the connection string itself, so setting it here would
 * override a string that intentionally specifies its own mode (including
 * `sslmode=disable` for a local Postgres).
 */
export function poolOptions(env: PoolEnv = process.env): Options<Record<string, PostgresType>> {
  const caCert = env.DATABASE_CA_CERT;
  const configuredMax = Number(env.DATABASE_POOL_MAX);
  const max = Number.isInteger(configuredMax) && configuredMax > 0 ? configuredMax : DEFAULT_POOL_MAX;

  return {
    max,
    idle_timeout: IDLE_TIMEOUT_SECONDS,
    connect_timeout: CONNECT_TIMEOUT_SECONDS,
    prepare: shouldPrepare(env.DATABASE_PREPARE),
    connection: { application_name: APPLICATION_NAME },
    ...(caCert ? { ssl: { ca: caCert, rejectUnauthorized: true } } : {}),
  };
}
