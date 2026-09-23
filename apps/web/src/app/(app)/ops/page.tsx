import { auth } from "@clerk/nextjs/server";
import { notFound, redirect } from "next/navigation";
import { collectOpsMetrics, isStaff } from "@/lib/ops-metrics";
import { OpsIssues } from "./ops-issues";

export const dynamic = "force-dynamic";

/**
 * EnvHQ's own numbers (RM-18).
 *
 * Not linked from anywhere, and 404 for everyone who isn't on the staff
 * allowlist — the same answer a stranger gets, so its existence isn't
 * discoverable by probing. It is deliberately a standalone page rather than
 * a tab under `/settings`, which is a customer surface.
 *
 * This is the "small metrics view in the admin dashboard" the ticket asks
 * for, minus the admin dashboard: RM-17 owns that and is blocked behind
 * billing. Keeping this a single page with no permissions model of its own
 * means RM-17 has nothing to unpick when it arrives.
 */
export default async function OpsPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");
  if (!isStaff(userId)) notFound();

  const metrics = await collectOpsMetrics();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Operations</h1>
        <p className="text-sm text-muted-foreground">
          Generated {new Date(metrics.generatedAt).toLocaleString()}. Counts and timestamps only —
          nothing here reads a variable name or a value.
        </p>
      </div>

      <Section title="Growth">
        <Stat label="Users" value={metrics.growth.totalUsers} />
        <Stat label="New, 7 days" value={metrics.growth.newUsers7d} />
        <Stat label="New, 30 days" value={metrics.growth.newUsers30d} />
        <Stat label="Orgs with a project" value={metrics.growth.activeOrgs} />
      </Section>

      <Section title="Usage">
        <Stat label="Projects" value={metrics.usage.projects} />
        <Stat label="Environments" value={metrics.usage.environments} />
        <Stat label="Variables" value={metrics.usage.variables} />
        <Stat label="Tokens used, 24h" value={metrics.usage.tokensActive24h} />
        <Stat label="Tokens used, 7d" value={metrics.usage.tokensActive7d} />
        <Stat label="Deploy keys live" value={metrics.usage.deployKeysActive} />
        <Stat label="Deploy keys revoked" value={metrics.usage.deployKeysRevoked} />
        <Stat label="Deploy keys used, 24h" value={metrics.usage.deployKeysUsed24h} />
      </Section>

      <Section title="Health">
        <Stat label="Webhook deliveries, 24h" value={metrics.health.webhookDeliveries24h} />
        <Stat label="Issues seen, 24h" value={metrics.health.issues24h} />
        <Stat label="Unmuted issues" value={metrics.health.unmutedIssues} />
      </Section>

      <div className="flex flex-col gap-2">
        <h2 className="text-sm font-medium text-muted-foreground">Recent issues</h2>
        <OpsIssues initialIssues={metrics.recentIssues} />
      </div>

      {/* Saying what is missing, rather than leaving a reader to assume the
          zeros are real. */}
      <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
        <p className="font-medium text-foreground">Not shown here, and why</p>
        <ul className="mt-2 list-disc pl-5">
          <li>
            <strong className="font-medium">Failed logins</strong> — Clerk owns authentication and a
            failed sign-in never reaches this app. Its dashboard has them.
          </li>
          <li>
            <strong className="font-medium">Subscriptions and Stripe webhook failures</strong> —
            there is no billing in this codebase yet. When it lands, its webhook failures appear in
            &ldquo;Recent issues&rdquo; automatically.
          </li>
          <li>
            <strong className="font-medium">Per-request pull counts</strong> — tokens and deploy
            keys record their <em>last</em> use, not every use, so &ldquo;active in 24h&rdquo; is
            answerable and a total is not. Counting every request means a write on the request path.
          </li>
        </ul>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <h2 className="text-sm font-medium text-muted-foreground">{title}</h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{children}</div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border p-4">
      <div className="text-2xl font-semibold tabular-nums">{value.toLocaleString()}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}
