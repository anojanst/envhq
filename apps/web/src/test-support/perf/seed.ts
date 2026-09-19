import { sql } from "drizzle-orm";
import { testDb } from "@/test-support/db";
import { projects, environments, envVars, accessGrants } from "@/db/schema";

/**
 * Realistic data for the RM-5 performance baseline.
 *
 * RM-5's gotcha is the whole reason this exists: "measure with a realistic
 * account: several orgs, dozens of projects, hundreds of variables. A
 * two-project account will look fine and tell you nothing." The dashboard's
 * cost in particular scales with org count (one query per org membership) and
 * the editor's with variable count, so a small fixture would hide exactly the
 * behaviour the Performance workstream exists to fix.
 *
 * No crypto is involved. `value_ciphertext`/`iv` get random base64 of a
 * realistic length because we are measuring the cost of *moving* these rows,
 * not decrypting them — nothing here reads or writes a real key, and
 * `packages/crypto` is untouched.
 */

/** The shape of the seeded account — quoted in `docs/PERF_BASELINE.md`. */
export const PERF_SAMPLE = {
  userId: "user_perf_owner",
  /** Org memberships. The dashboard runs one project query per org. */
  orgCount: 5,
  /** Projects per org — 8 × 5 = 40 total. */
  projectsPerOrg: 8,
  /** Environments per project, e.g. dev/qa/staging/prod. */
  envsPerProject: 4,
  /** Variables in a typical environment. */
  varsPerEnv: 40,
  /** Variables in the one deliberately large environment. */
  varsInLargeEnv: 400,
} as const;

export interface SeededSample {
  userId: string;
  orgs: { id: string; name: string; role: "admin" | "member" }[];
  /** A mid-sized project/environment — the common case. */
  typical: { projectId: string; envId: string; varCount: number };
  /** The deliberately large environment — the editor's worst case. */
  large: { projectId: string; envId: string; varCount: number };
  totals: { projects: number; environments: number; vars: number };
}

const ENV_NAMES = ["dev", "qa", "staging", "prod"] as const;

/** Deterministic filler of a realistic ciphertext length — not real encryption. */
function filler(seed: number, bytes = 48): string {
  let out = "";
  for (let i = 0; i < bytes; i++) {
    out += String.fromCharCode(97 + ((seed * 31 + i * 17) % 26));
  }
  return Buffer.from(out).toString("base64");
}

/** Drops everything this seeder creates, so a re-run measures a known state. */
export async function resetPerfSample(): Promise<void> {
  // env_vars and environments cascade from projects; access_grants too.
  await testDb.execute(sql`DELETE FROM projects WHERE org_id LIKE 'org_perf_%'`);
}

export async function seedPerfSample(): Promise<SeededSample> {
  await resetPerfSample();

  const orgs = Array.from({ length: PERF_SAMPLE.orgCount }, (_, i) => ({
    id: `org_perf_${i}`,
    name: `Perf Org ${i}`,
    // Member, not admin, deliberately: an org admin short-circuits to "all
    // projects" and skips the access_grants join entirely, which is the
    // cheaper path. Measuring the granted path keeps the baseline honest.
    role: "member" as const,
  }));

  const projectRows = orgs.flatMap((org, o) =>
    Array.from({ length: PERF_SAMPLE.projectsPerOrg }, (_, p) => ({
      userId: PERF_SAMPLE.userId,
      orgId: org.id,
      name: `perf-project-${o}-${p}`,
    })),
  );
  const inserted = await testDb
    .insert(projects)
    .values(projectRows)
    .returning({ id: projects.id, orgId: projects.orgId });

  // Every project is reachable by a direct user grant, so the caller sees all
  // of them without relying on the org-admin bypass.
  await testDb.insert(accessGrants).values(
    inserted.map((p) => ({
      orgId: p.orgId,
      projectId: p.id,
      subjectType: "user",
      subjectId: PERF_SAMPLE.userId,
      role: "editor",
    })),
  );

  const envRows = inserted.flatMap((p) =>
    ENV_NAMES.slice(0, PERF_SAMPLE.envsPerProject).map((name) => ({ projectId: p.id, name })),
  );
  const insertedEnvs = await testDb
    .insert(environments)
    .values(envRows)
    .returning({ id: environments.id, projectId: environments.projectId, name: environments.name });

  // One environment gets the large variable set; the rest get a typical one.
  const largeEnv = insertedEnvs[0]!;
  let varTotal = 0;
  for (const env of insertedEnvs) {
    const count = env.id === largeEnv.id ? PERF_SAMPLE.varsInLargeEnv : PERF_SAMPLE.varsPerEnv;
    const rows = Array.from({ length: count }, (_, i) => ({
      environmentId: env.id,
      key: `PERF_VAR_${String(i).padStart(4, "0")}`,
      valueCiphertext: filler(i),
      iv: filler(i, 24),
    }));
    // Chunked: a single 400-row insert is fine, but this keeps the statement
    // size predictable if the sample is scaled up later.
    for (let i = 0; i < rows.length; i += 200) {
      await testDb.insert(envVars).values(rows.slice(i, i + 200));
    }
    varTotal += count;
  }

  const typicalEnv = insertedEnvs.find((e) => e.id !== largeEnv.id)!;

  return {
    userId: PERF_SAMPLE.userId,
    orgs,
    typical: {
      projectId: typicalEnv.projectId,
      envId: typicalEnv.id,
      varCount: PERF_SAMPLE.varsPerEnv,
    },
    large: {
      projectId: largeEnv.projectId,
      envId: largeEnv.id,
      varCount: PERF_SAMPLE.varsInLargeEnv,
    },
    totals: {
      projects: inserted.length,
      environments: insertedEnvs.length,
      vars: varTotal,
    },
  };
}
