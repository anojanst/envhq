import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { FolderTree } from "lucide-react";
import { listAccessibleProjectsWithEnvsAcrossOrgs } from "@/lib/access";
import { getOrCreatePersonalOrg, listMyOrgs } from "@/lib/orgs";
import { CreateProjectDialog } from "./create-project-dialog";
import { ProjectsBrowser, type ProjectListItem } from "./projects-browser";

export default async function DashboardPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  // Every user gets a personal org lazily on first touch (M5 PR1) — force it
  // to exist here so a brand-new account's very first dashboard load has
  // somewhere to land, since nothing else on this always-cross-org page
  // would otherwise trigger its creation. Also doubles as the "New project"
  // dialog's default org selection.
  const personalOrgId = await getOrCreatePersonalOrg(userId);
  const orgs = await listMyOrgs(userId);

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
        orgId: r.orgId,
        orgName: r.orgName,
      };
      byId.set(r.id, p);
    }
    if (r.envName) p.envs.push(r.envName);
  }
  const projectList = [...byId.values()];

  return (
    <div className="flex flex-col gap-6">
      <div className="space-y-1">
        <div className="flex items-center gap-2.5">
          <h1 className="text-2xl font-semibold tracking-tight">Projects</h1>
          {projectList.length > 0 ? (
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground tabular-nums">
              {projectList.length}
            </span>
          ) : null}
        </div>
        <p className="text-sm text-muted-foreground">
          Each project groups its own set of environments.
        </p>
      </div>

      {projectList.length === 0 ? (
        <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed py-16 text-center">
          <div className="flex size-12 items-center justify-center rounded-full bg-brand/10 text-brand">
            <FolderTree className="size-6" />
          </div>
          <div className="space-y-1">
            <p className="font-medium">No projects yet</p>
            <p className="mx-auto max-w-sm text-sm text-muted-foreground text-pretty">
              Create your first project to start grouping and syncing environment
              variables across dev, staging, and prod.
            </p>
          </div>
          <CreateProjectDialog orgs={orgs} defaultOrgId={personalOrgId} />
        </div>
      ) : (
        <ProjectsBrowser projects={projectList} orgs={orgs} defaultOrgId={personalOrgId} />
      )}
    </div>
  );
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
