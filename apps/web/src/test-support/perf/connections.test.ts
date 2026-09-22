import { beforeAll, afterAll, describe, expect, test } from "vitest";
import postgres from "postgres";
import { seedPerfSample, type SeededSample } from "./seed";
import { poolOptions, DEFAULT_POOL_MAX, APPLICATION_NAME } from "@/db/pool";

/**
 * RM-8's load test: "a load test at expected peak does not exhaust
 * connections."
 *
 * WHY THIS OPENS ITS OWN CLIENT. Every other suite here runs against
 * `test-support/db.ts`, a node-postgres client substituted for the production
 * `db` export. That is the right call for the authorization and contract
 * suites, which care about SQL and constraints — but it is the wrong client
 * entirely for this one. The question here *is* the driver: postgres-js's
 * pool, built from the same `poolOptions()` production uses, with only the
 * connection string differing. Testing a pool through a different driver's
 * pool would measure nothing.
 *
 * Part of the `perf` project, so it is excluded from `pnpm test` and adds no
 * CI time. Run it with `pnpm --filter @envhq/web test:perf`.
 */

const TEST_URL = process.env.TEST_DATABASE_URL!;

/**
 * Well above what one instance sees. Vercel hands a Fluid instance a bounded
 * number of concurrent invocations; 50 simultaneous in-flight requests
 * against a single pool is a deliberate overshoot, because the interesting
 * question is what happens when demand exceeds the pool rather than when it
 * fits inside it.
 */
const CONCURRENT_REQUESTS = 50;
const ROUNDS = 4;

let sample: SeededSample;

beforeAll(async () => {
  sample = await seedPerfSample();
}, 120_000);

/** Counts backends at the database by application name — the only number that matters. */
async function backendCount(probe: postgres.Sql, appName = APPLICATION_NAME): Promise<number> {
  const [row] = await probe`
    SELECT count(*)::int AS n FROM pg_stat_activity WHERE application_name = ${appName}`;
  return row.n as number;
}

/**
 * The per-request query shape: the dashboard's single cross-org query, then
 * the environment editor's two parallel ones. Three statements, two of them
 * concurrent — the widest fan-out any request path has.
 */
async function oneRequest(sql: postgres.Sql, orgIds: string[], envId: string): Promise<void> {
  await sql`
    SELECT p.id, p.name, p.org_id, e.name AS env_name
    FROM projects p LEFT JOIN environments e ON e.project_id = p.id
    WHERE p.org_id = ANY(${orgIds})
    ORDER BY p.created_at DESC, p.id ASC`;
  await Promise.all([
    sql`SELECT id, key FROM env_vars WHERE environment_id = ${envId} AND deleted_at IS NULL`,
    sql`SELECT count(*)::int AS n FROM environments WHERE project_id = ${sample.large.projectId}`,
  ]);
}

describe("connection ceiling under load", () => {
  let pool: postgres.Sql;
  let probe: postgres.Sql;

  beforeAll(() => {
    // The production options, verbatim. If someone raises DEFAULT_POOL_MAX,
    // this test picks it up rather than testing a number it made up.
    pool = postgres(TEST_URL, poolOptions({}));
    probe = postgres(TEST_URL, { max: 1, connection: { application_name: "envhq-loadtest-probe" } });
  });

  afterAll(async () => {
    await pool.end();
    await probe.end();
  });

  test("50 concurrent requests never open more backends than the pool allows", async () => {
    const orgIds = sample.orgs.map((o) => o.id);
    let peak = 0;
    let sampled = 0;
    let stop = false;

    const sampler = (async () => {
      while (!stop) {
        peak = Math.max(peak, await backendCount(probe));
        sampled += 1;
      }
    })();

    const errors: unknown[] = [];
    for (let r = 0; r < ROUNDS; r++) {
      const results = await Promise.allSettled(
        Array.from({ length: CONCURRENT_REQUESTS }, () =>
          oneRequest(pool, orgIds, sample.typical.envId),
        ),
      );
      for (const res of results) if (res.status === "rejected") errors.push(res.reason);
    }
    stop = true;
    await sampler;

    // Demand far exceeded the pool, and every request still completed: the
    // pool queued them instead of opening connections it had no budget for,
    // and nothing was refused. "Does not exhaust connections" means both.
    expect(errors).toEqual([]);
    expect(peak).toBeLessThanOrEqual(DEFAULT_POOL_MAX);

    // Vacuity guards. A pool that never connected, or a probe that never
    // looked, would satisfy the assertion above while measuring nothing.
    expect(sampled).toBeGreaterThan(0);
    expect(peak).toBeGreaterThan(1);
  }, 120_000);

  test("idle connections are handed back, not held for the life of the instance", async () => {
    // postgres-js defaults `idle_timeout` to null — never close. That default
    // is what turns `instances x max` from a peak into a floor: an instance
    // that served one burst keeps its connections while contributing nothing.
    // A one-second timeout here proves the knob we set in poolOptions has an
    // effect; production uses IDLE_TIMEOUT_SECONDS.
    // Its own application_name: the load pool above is still open and shares
    // the production one, so counting that would count its connections too.
    const NAME = "envhq-idle-probe";
    const brief = postgres(TEST_URL, {
      ...poolOptions({}),
      idle_timeout: 1,
      connection: { application_name: NAME },
    });
    await Promise.all([brief`SELECT 1`, brief`SELECT 2`, brief`SELECT 3`]);
    expect(await backendCount(probe, NAME)).toBeGreaterThan(0);

    await new Promise((resolve) => setTimeout(resolve, 2_500));
    expect(await backendCount(probe, NAME)).toBe(0);
    await brief.end();
  }, 30_000);
});
