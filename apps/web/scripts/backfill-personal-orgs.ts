// Env vars come from `--env-file=.env.local` (see package.json's
// `db:backfill-orgs` script) — plain `import "dotenv"` + `config()` doesn't
// work here because ESM `import` statements are hoisted above all other
// top-level code, so `@/db`'s module-load-time `DATABASE_URL` check would
// run before a `config()` call ever executed.
import { isNull, eq, and, sql } from "drizzle-orm";
import { db } from "@/db";
import { projects } from "@/db/schema";
import { getOrCreatePersonalOrg } from "@/lib/orgs";

/**
 * M5 data migration: assigns every pre-M5 project a personal org. Run once
 * after applying migration 0005/0006 (nullable `projects.org_id` +
 * `personal_orgs`) and before the follow-up migration that makes
 * `org_id NOT NULL`. Idempotent — safe to re-run; only touches rows still
 * missing an `org_id`, and `getOrCreatePersonalOrg` reuses an existing
 * personal org rather than minting a second one.
 */
async function main() {
  const rows = await db
    .selectDistinct({ userId: projects.userId })
    .from(projects)
    .where(isNull(projects.orgId));

  console.log(`${rows.length} user(s) with un-migrated projects.`);

  const failures: { userId: string; error: unknown }[] = [];
  for (const { userId } of rows) {
    try {
      const orgId = await getOrCreatePersonalOrg(userId);
      const updated = await db
        .update(projects)
        .set({ orgId })
        .where(and(eq(projects.userId, userId), isNull(projects.orgId)))
        .returning({ id: projects.id });
      console.log(`${userId} -> ${orgId} (${updated.length} project(s) updated)`);
    } catch (error) {
      // Don't let one bad row (e.g. stale/test data with no matching Clerk
      // user) abort the whole run — collect and report failures at the end
      // so the operator can fix the underlying row and re-run.
      console.error(`${userId} -> FAILED: ${error instanceof Error ? error.message : error}`);
      failures.push({ userId, error });
    }
  }

  const [{ remaining }] = await db
    .select({ remaining: sql<number>`count(*)::int` })
    .from(projects)
    .where(isNull(projects.orgId));
  console.log(`Done. ${remaining} project(s) still without an org_id.`);
  if (failures.length > 0) {
    console.error(`${failures.length} user(s) failed: ${failures.map((f) => f.userId).join(", ")}`);
    process.exitCode = 1;
  }
}

main()
  .then(() => process.exit(process.exitCode ?? 0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
