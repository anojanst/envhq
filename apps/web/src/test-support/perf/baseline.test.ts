import { beforeAll, describe, expect, test } from "vitest";
import { writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { and, asc, count, eq, isNull } from "drizzle-orm";
import { testDb } from "@/test-support/db";
import { environments, envVars, personalOrgs } from "@/db/schema";
import { setMyOrgs, setOrgRole } from "@/test-support/mock-orgs";
import { measure, clerkMs, type PerfSpan } from "@/lib/perf";
import {
  getAccessibleEnvironment,
  getAccessibleProject,
  listAccessibleProjectsWithEnvsAcrossOrgs,
} from "@/lib/access";
import { getOrCreatePersonalOrg } from "@/lib/orgs";
import { listVarRows, listPairs } from "@/lib/env-store";
import { seedPerfSample, PERF_SAMPLE, type SeededSample } from "./seed";

/**
 * The RM-5 baseline harness. Produces the numbers in `docs/PERF_BASELINE.md`.
 *
 * Not part of `pnpm test` — it seeds ~2,000 rows and exists to be read, not to
 * gate a merge. Run it deliberately:
 *
 *   pnpm --filter @envhq/web test:perf
 *
 * WHAT THIS MEASURES, precisely, so the numbers aren't over-read:
 *
 * - **Query counts are exact.** They come from drizzle's `logger` hook, which
 *   fires once per executed query, so these are the real per-request counts.
 * - **Clerk call counts are exact; Clerk latency is not.** `mock-orgs.ts`
 *   replaces the transport, so a "call" here returns from a Map in
 *   microseconds. Real latency comes from production `[perf]` logs.
 * - **DB timings are real but local.** A local Postgres over a unix socket is
 *   faster than Neon over the network. Treat them as a floor and as a
 *   *relative* measure between routes, which is what the follow-up tickets
 *   need — they care whether a change removed queries, not the absolute ms.
 * - **This replicates each page's data sequence rather than rendering the
 *   page.** Server components can't be invoked here (`auth()` is mocked to no
 *   session), and React render time is not what RM-6 through RM-9 are about.
 *   The sequences below mirror the pages named in each `describe`; if a page
 *   changes its data fetching, update the mirror or the baseline goes stale.
 */

let sample: SeededSample;
const results: Row[] = [];

interface Row {
  route: string;
  queries: number;
  clerkCalls: number;
  medianMs: number;
  p95Ms: number;
  clerkMs: number;
  db: { label: string; ms: number }[];
}

const ITERATIONS = 25;

let scaling: {
  oneOrg: { queries: number; clerkCalls: number };
  fiveOrgs: { queries: number; clerkCalls: number };
  queriesPerOrg: number;
  clerkPerOrg: number;
} | undefined;

/**
 * Runs a path `ITERATIONS` times and reports the median and p95.
 *
 * A single measurement is noise: the first run pays for cold buffer cache and
 * connection warm-up, and on the first pass here a 400-variable environment
 * measured *faster* than a 40-variable one, which is obviously not real. Counts
 * are deterministic so they're taken from the last run; timings are not, so
 * they're taken from the distribution.
 */
async function repeat(route: string, fn: () => Promise<unknown>): Promise<Row> {
  const spans: PerfSpan[] = [];
  for (let i = 0; i < ITERATIONS; i++) {
    const { span } = await measure(route, fn);
    spans.push(span);
  }

  const sorted = [...spans].sort((a, b) => a.totalMs - b.totalMs);
  const at = (q: number) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))]!.totalMs;
  const last = spans.at(-1)!;

  const row: Row = {
    route,
    queries: last.dbQueries,
    clerkCalls: last.clerk.length,
    medianMs: round(at(0.5)),
    p95Ms: round(at(0.95)),
    clerkMs: round(clerkMs(last)),
    db: last.db.map((d) => ({ label: d.label, ms: round(d.ms) })),
  };

  // Counts must not drift run to run — if they do, something is caching or
  // accumulating and the "per request" number is meaningless.
  for (const s of spans) {
    expect(s.dbQueries, `${route}: query count varied across runs`).toBe(row.queries);
    expect(s.clerk.length, `${route}: Clerk call count varied across runs`).toBe(row.clerkCalls);
  }

  results.push(row);
  return row;
}

function round(ms: number): number {
  return Math.round(ms * 10) / 10;
}

beforeAll(async () => {
  sample = await seedPerfSample();
  setMyOrgs(sample.userId, sample.orgs);
  for (const org of sample.orgs) setOrgRole(sample.userId, org.id, "member");

  // A returning user already has a personal org row, so the dashboard's
  // `getOrCreatePersonalOrg` is one cheap query and no Clerk call. A brand-new
  // account pays a `users.getUser` + `createOrganization` on its first load;
  // that one-off is out of scope for a steady-state baseline.
  await testDb
    .insert(personalOrgs)
    .values({ userId: sample.userId, orgId: sample.orgs[0]!.id })
    .onConflictDoNothing({ target: personalOrgs.userId });
}, 120_000);

describe("RM-5 baseline", () => {
  test("dashboard — (app)/dashboard/page.tsx", async () => {
    const row = await repeat("dashboard", async () => {
      await getOrCreatePersonalOrg(sample.userId);
      await listAccessibleProjectsWithEnvsAcrossOrgs(sample.userId);
    });

    expect(row.queries).toBeGreaterThan(PERF_SAMPLE.orgCount);
    expect(row.clerkCalls).toBeGreaterThan(0);
  });

  test("dashboard cost scales with org count — the premise RM-6 and RM-7 rest on", async () => {
    // Measured, not assumed. If the cost did NOT grow with org count, the
    // fan-out those tickets exist to remove wouldn't be real and the baseline
    // would be pointing them at the wrong thing.
    const measureWithOrgs = async (n: number) => {
      setMyOrgs(sample.userId, sample.orgs.slice(0, n));
      const { span } = await measure(`dashboard (${n} orgs)`, () =>
        listAccessibleProjectsWithEnvsAcrossOrgs(sample.userId),
      );
      return span;
    };

    const one = await measureWithOrgs(1);
    const five = await measureWithOrgs(PERF_SAMPLE.orgCount);
    setMyOrgs(sample.userId, sample.orgs); // restore for any later test

    const queriesPerOrg = (five.dbQueries - one.dbQueries) / (PERF_SAMPLE.orgCount - 1);
    const clerkPerOrg = (five.clerk.length - one.clerk.length) / (PERF_SAMPLE.orgCount - 1);

    expect(queriesPerOrg).toBeGreaterThan(0);
    expect(clerkPerOrg).toBeGreaterThan(0);

    scaling = {
      oneOrg: { queries: one.dbQueries, clerkCalls: one.clerk.length },
      fiveOrgs: { queries: five.dbQueries, clerkCalls: five.clerk.length },
      queriesPerOrg,
      clerkPerOrg,
    };
  });

  test("project page — (app)/projects/[id]/page.tsx (redirect hop)", async () => {
    const row = await repeat("projects/[id] (redirect hop)", async () => {
      await getAccessibleProject(sample.userId, sample.typical.projectId);
      await testDb
        .select({ id: environments.id })
        .from(environments)
        .where(eq(environments.projectId, sample.typical.projectId))
        .orderBy(asc(environments.createdAt))
        .limit(1);
    });
    expect(row.queries).toBeGreaterThan(0);
  });

  test("environment editor, typical — (app)/projects/[id]/environments/[envId]/page.tsx", async () => {
    const row = await repeat("environments/[envId] (40 vars)", () =>
      renderEnvironmentData(sample.typical.projectId, sample.typical.envId),
    );
    expect(row.queries).toBeGreaterThan(0);
  });

  test("environment editor, large", async () => {
    const row = await repeat("environments/[envId] (400 vars)", () =>
      renderEnvironmentData(sample.large.projectId, sample.large.envId),
    );

    // A 400-variable environment must not cost more *queries* than a 40-variable
    // one — if it does, something is N+1-ing per variable and RM-9 starts there.
    const typical = results.find((r) => r.route === "environments/[envId] (40 vars)")!;
    expect(row.queries).toBe(typical.queries);
  });

  test("CLI export — api/environments/[id]/export", async () => {
    const row = await repeat("api/environments/[id]/export", async () => {
      await getAccessibleEnvironment(sample.userId, sample.large.envId);
      await listPairs(sample.large.envId);
    });
    expect(row.queries).toBeGreaterThan(0);
  });

  test("writes the baseline table", async () => {
    const sampleLine =
      `${sample.orgs.length} orgs · ${sample.totals.projects} projects · ` +
      `${sample.totals.environments} environments · ${sample.totals.vars} variables ` +
      `(largest environment ${PERF_SAMPLE.varsInLargeEnv} vars)`;

    // Written to a file rather than only logged: vitest's console interception
    // makes stdout unreliable to read back, and a JSON artifact is what actually
    // gets transcribed into docs/PERF_BASELINE.md.
    const out = process.env.PERF_OUT ?? join(tmpdir(), "envhq-perf-baseline.json");
    await writeFile(
      out,
      JSON.stringify(
        { measuredAt: new Date().toISOString(), iterations: ITERATIONS, sample: sampleLine, scaling, rows: results },
        null,
        2,
      ),
    );

    console.info(`\nRM-5 baseline — sample: ${sampleLine}`);
    console.info(`written to ${out}`);
    expect(results.length).toBeGreaterThan(0);
  });
});

/** Mirrors the environment editor page's data fetching (see the note at the top). */
async function renderEnvironmentData(projectId: string, envId: string) {
  const owned = await getAccessibleEnvironment(sample.userId, envId);
  if (!owned) throw new Error("perf harness: seeded environment was not accessible");

  await Promise.all([
    listVarRows(envId),
    testDb
      .select({ id: environments.id, name: environments.name, varCount: count(envVars.id) })
      .from(environments)
      .leftJoin(envVars, and(eq(envVars.environmentId, environments.id), isNull(envVars.deletedAt)))
      .where(eq(environments.projectId, projectId))
      .groupBy(environments.id)
      .orderBy(asc(environments.createdAt)),
  ]);
}
