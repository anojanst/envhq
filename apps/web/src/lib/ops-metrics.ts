import { count, desc, eq, gt, gte, isNotNull, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  apiTokens,
  deployKeys,
  envVars,
  environments,
  errorEvents,
  personalOrgs,
  projects,
  webhookEvents,
} from "@/db/schema";

/**
 * The business and operational numbers EnvHQ can answer about itself
 * (RM-18), from its own database and nowhere else.
 *
 * WHAT IS DELIBERATELY ABSENT, and why, because a metrics view that quietly
 * omits things is worse than one that says what it cannot see:
 *
 *   - **Failed logins.** Clerk owns authentication; a failed sign-in never
 *     reaches this application. It is visible in Clerk's own dashboard and
 *     would need their API to surface here. Not guessed at.
 *   - **Subscription changes and Stripe webhook failures.** There is no
 *     billing in this codebase yet (RM-14 through RM-16 are unstarted), so
 *     there is nothing to count. When Stripe lands, its webhook failures
 *     arrive here for free: they will be reported through
 *     `lib/observability.ts` like every other handler failure, and show up
 *     in `recentIssues` below without this file changing.
 *   - **Per-request pull counts.** `api_tokens.last_used_at` and
 *     `deploy_keys.last_used_at` record the last use, not every use, so
 *     "active in the last 24h" is answerable and "3,412 pulls this week" is
 *     not. Counting every request means a write on the request path, which
 *     is a real cost to pay deliberately rather than by accident.
 *
 * Nothing here reads a variable name or a value. Counts and timestamps only,
 * the same rule `lib/perf.ts` and `lib/observability.ts` hold.
 */

export interface OpsMetrics {
  generatedAt: string;
  growth: {
    /** Users who have ever reached the app — a personal org is created on first use. */
    totalUsers: number;
    newUsers7d: number;
    newUsers30d: number;
    /** Orgs holding at least one project. A personal org with nothing in it isn't a customer. */
    activeOrgs: number;
  };
  usage: {
    projects: number;
    environments: number;
    variables: number;
    /** Tokens used at least once in the window — the closest honest answer to "CLI pulls". */
    tokensActive24h: number;
    tokensActive7d: number;
    deployKeysActive: number;
    deployKeysRevoked: number;
    /** Deploy keys used in the last 24h — pipeline traffic, as far as last-used can tell. */
    deployKeysUsed24h: number;
  };
  health: {
    /** Webhook deliveries accepted in the window. A flat zero on a live system means a broken endpoint. */
    webhookDeliveries24h: number;
    /** Distinct issues seen in the window, not occurrences. */
    issues24h: number;
    unmutedIssues: number;
  };
  recentIssues: {
    fingerprint: string;
    route: string;
    kind: string;
    message: string;
    occurrences: number;
    firstSeenAt: string;
    lastSeenAt: string;
    release: string | null;
    muted: boolean;
  }[];
}

function since(hours: number): Date {
  return new Date(Date.now() - hours * 60 * 60 * 1000);
}

async function scalar(query: Promise<{ n: number }[]>): Promise<number> {
  const [row] = await query;
  return row?.n ?? 0;
}

export async function collectOpsMetrics(): Promise<OpsMetrics> {
  const day = since(24);
  const week = since(24 * 7);
  const month = since(24 * 30);

  const [
    totalUsers,
    newUsers7d,
    newUsers30d,
    activeOrgs,
    projectCount,
    environmentCount,
    variableCount,
    tokensActive24h,
    tokensActive7d,
    deployKeysActive,
    deployKeysRevoked,
    deployKeysUsed24h,
    webhookDeliveries24h,
    issues24h,
    unmutedIssues,
    recent,
  ] = await Promise.all([
    scalar(db.select({ n: count() }).from(personalOrgs)),
    scalar(db.select({ n: count() }).from(personalOrgs).where(gte(personalOrgs.createdAt, week))),
    scalar(db.select({ n: count() }).from(personalOrgs).where(gte(personalOrgs.createdAt, month))),
    scalar(db.select({ n: sql<number>`count(distinct ${projects.orgId})::int` }).from(projects)),
    scalar(db.select({ n: count() }).from(projects)),
    scalar(db.select({ n: count() }).from(environments)),
    scalar(db.select({ n: count() }).from(envVars).where(isNull(envVars.deletedAt))),
    scalar(db.select({ n: count() }).from(apiTokens).where(gt(apiTokens.lastUsedAt, day))),
    scalar(db.select({ n: count() }).from(apiTokens).where(gt(apiTokens.lastUsedAt, week))),
    scalar(db.select({ n: count() }).from(deployKeys).where(isNull(deployKeys.revokedAt))),
    scalar(db.select({ n: count() }).from(deployKeys).where(isNotNull(deployKeys.revokedAt))),
    scalar(db.select({ n: count() }).from(deployKeys).where(gt(deployKeys.lastUsedAt, day))),
    scalar(db.select({ n: count() }).from(webhookEvents).where(gte(webhookEvents.receivedAt, day))),
    scalar(db.select({ n: count() }).from(errorEvents).where(gte(errorEvents.lastSeenAt, day))),
    scalar(db.select({ n: count() }).from(errorEvents).where(isNull(errorEvents.mutedAt))),
    db
      .select()
      .from(errorEvents)
      .orderBy(desc(errorEvents.lastSeenAt))
      .limit(20),
  ]);

  return {
    generatedAt: new Date().toISOString(),
    growth: { totalUsers, newUsers7d, newUsers30d, activeOrgs },
    usage: {
      projects: projectCount,
      environments: environmentCount,
      variables: variableCount,
      tokensActive24h,
      tokensActive7d,
      deployKeysActive,
      deployKeysRevoked,
      deployKeysUsed24h,
    },
    health: { webhookDeliveries24h, issues24h, unmutedIssues },
    recentIssues: recent.map((r) => ({
      fingerprint: r.fingerprint,
      route: r.route,
      kind: r.kind,
      message: r.message,
      occurrences: r.occurrences,
      firstSeenAt: r.firstSeenAt.toISOString(),
      lastSeenAt: r.lastSeenAt.toISOString(),
      release: r.release,
      muted: r.mutedAt !== null,
    })),
  };
}

/** Stops an accepted, known issue alerting again. Reversible. */
export async function setIssueMuted(fingerprint: string, muted: boolean): Promise<boolean> {
  const updated = await db
    .update(errorEvents)
    .set({ mutedAt: muted ? sql`now()` : null })
    .where(eq(errorEvents.fingerprint, fingerprint))
    .returning({ fingerprint: errorEvents.fingerprint });
  return updated.length > 0;
}

/**
 * Whether a user may see the numbers above.
 *
 * An environment allowlist of Clerk user ids, deliberately the cheapest
 * thing that is actually safe. There is no staff concept in this codebase —
 * org admin means "admin of that customer's org", which is emphatically not
 * the same as EnvHQ staff, and using it here would show every customer
 * every other customer's aggregate numbers.
 *
 * Building a real staff role belongs to RM-17 (the internal admin
 * dashboard), which is blocked behind billing. Until then this is a list in
 * an environment variable: no schema, no migration, no half-built
 * permissions model for RM-17 to unpick. Replace it there.
 */
export function isStaff(userId: string | null | undefined): boolean {
  if (!userId) return false;
  const allowlist = (process.env.ENVHQ_STAFF_USER_IDS ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
  return allowlist.includes(userId);
}
