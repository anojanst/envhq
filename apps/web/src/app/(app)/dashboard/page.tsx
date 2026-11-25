import { requireSessionUserId } from "@/lib/identity";
import { FolderTree } from "lucide-react";
import { and, eq, gte, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { environments, environmentVersions, envVars } from "@/db/schema";
import { listAccessibleProjectsWithEnvsAcrossOrgs } from "@/lib/access";
import { withPerf } from "@/lib/perf";
import { getOrCreatePersonalOrg, listMyOrgs } from "@/lib/orgs";
import { CreateProjectDialog } from "./create-project-dialog";
import { ProjectsBrowser, type ProjectListItem } from "./projects-browser";
import { PageHeader } from "@/components/page-header";

export default async function DashboardPage() {
  return withPerf("dashboard", renderDashboard);
}

async function renderDashboard() {
  const userId = await requireSessionUserId();

  // Every user gets a personal org lazily on first touch (M5 PR1) — force it
  // to exist here so a brand-new account's very first dashboard load has
  // somewhere to land, since nothing else on this always-cross-org page
  // would otherwise trigger its creation. Also doubles as the "New project"
  // dialog's default org selection.
  const personalOrgId = await getOrCreatePersonalOrg(userId);
  // A personal workspace is named after its owner in the database, which
  // reads as someone else's team in a picker. Call it what it is.
  const orgs = (await listMyOrgs(userId)).map((o) => (o.id === personalOrgId ? { ...o, name: "Personal" } : o));

  // One pass across every org the user belongs to: projects (newest first)
  // with their environment names (oldest first). The org filter (in
  // ProjectsBrowser) is a client-side filter of this same fetch, not a
  // separate query — no reason to round-trip the server just to narrow down
  // data already in hand.
  const rows = await listAccessibleProjectsWithEnvsAcrossOrgs(userId);

  const byId = new Map<string, ProjectListItem>();
  for (const r of rows) {
    let p = byId.get(r.id);
    if (!p) {
      // timeAgo is computed server-side so the client render matches (no hydration drift).
      p = {
        id: r.id,
        name: r.name,
        createdLabel: timeAgo(r.createdAt),
        envs: [],
        variableCount: 0,
        updatedLabel: null,
        activity: [],
        orgId: r.orgId,
        orgName: r.orgId === personalOrgId ? "Personal" : r.orgName,
      };
      byId.set(r.id, p);
    }
    if (r.envName) p.envs.push(r.envName);
  }
  const projectList = [...byId.values()];
  await addActivity(byId);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Projects"
        description="A project holds environments, and each environment holds its own values and history."
        actions={
          projectList.length > 0 && (
            <CreateProjectDialog orgs={orgs} defaultOrgId={personalOrgId} callerUserId={userId} />
          )
        }
      />

      {projectList.length === 0 ? (
        <div className="flex flex-col items-center gap-4 rounded-2xl border border-dashed bg-card/50 px-6 py-16 text-center">
          <div className="flex size-12 items-center justify-center rounded-full bg-brand/10 text-brand">
            <FolderTree className="size-6" />
          </div>
          <div className="space-y-1">
            <p className="font-medium">Create your first project</p>
            <p className="mx-auto max-w-sm text-sm text-muted-foreground text-pretty">
              One per app or service. Paste its <code>.env</code>, then pull it on any machine with{" "}
              <code>envhq pull</code>.
            </p>
          </div>
          <CreateProjectDialog orgs={orgs} defaultOrgId={personalOrgId} callerUserId={userId} />
        </div>
      ) : (
        <ProjectsBrowser projects={projectList} orgs={orgs} />
      )}
    </div>
  );
}

const ACTIVITY_DAYS = 14;

/**
 * What each card shows beyond its name: how many variables it holds, when it
 * last changed, and a daily count of changes over the last two weeks. Two
 * grouped queries for the whole page, never one per project. Counts and
 * timestamps only — nothing here reads a value or a name of a variable.
 */
async function addActivity(byId: Map<string, ProjectListItem>) {
  const ids = [...byId.keys()];
  if (ids.length === 0) return;
  const since = new Date(Date.now() - ACTIVITY_DAYS * 86_400_000);
  const day = sql<string>`to_char(${environmentVersions.createdAt} at time zone 'UTC', 'YYYY-MM-DD')`;

  const [varCounts, changes] = await Promise.all([
    db
      .select({ projectId: environments.projectId, n: sql<number>`count(${envVars.id})::int` })
      .from(environments)
      .innerJoin(envVars, and(eq(envVars.environmentId, environments.id), isNull(envVars.deletedAt)))
      .where(inArray(environments.projectId, ids))
      .groupBy(environments.projectId),
    db
      .select({
        projectId: environments.projectId,
        day,
        n: sql<number>`count(*)::int`,
        last: sql<Date>`max(${environmentVersions.createdAt})`,
      })
      .from(environmentVersions)
      .innerJoin(environments, eq(environments.id, environmentVersions.environmentId))
      .where(and(inArray(environments.projectId, ids), gte(environmentVersions.createdAt, since)))
      .groupBy(environments.projectId, day),
  ]);

  for (const r of varCounts) byId.get(r.projectId)!.variableCount = r.n;

  const days = Array.from({ length: ACTIVITY_DAYS }, (_, i) =>
    new Date(Date.now() - (ACTIVITY_DAYS - 1 - i) * 86_400_000).toISOString().slice(0, 10),
  );
  const perProject = new Map<string, { byDay: Map<string, number>; last: Date }>();
  for (const r of changes) {
    const last = new Date(r.last);
    const entry = perProject.get(r.projectId) ?? { byDay: new Map(), last };
    entry.byDay.set(r.day, r.n);
    if (last > entry.last) entry.last = last;
    perProject.set(r.projectId, entry);
  }
  for (const [id, p] of byId) {
    const entry = perProject.get(id);
    p.activity = days.map((d) => entry?.byDay.get(d) ?? 0);
    p.updatedLabel = entry ? timeAgo(entry.last) : null;
  }
}

function timeAgo(date: Date): string {
  const s = Math.floor((Date.now() - date.getTime()) / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  const mo = Math.floor(d / 30);
  if (mo < 12) return `${mo}mo ago`;
  return `${Math.floor(d / 365)}y ago`;
}
