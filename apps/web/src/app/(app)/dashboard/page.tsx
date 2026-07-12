import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { FolderTree } from "lucide-react";
import { listAccessibleProjectsWithEnvs } from "@/lib/access";
import { resolveRequestedOrgId } from "@/lib/orgs";
import { CreateProjectDialog } from "./create-project-dialog";
import { ProjectsBrowser, type ProjectListItem } from "./projects-browser";

export default async function DashboardPage() {
  const { userId, orgId: activeOrgId } = await auth();
  if (!userId) redirect("/sign-in");

  // Prefer whichever org is active in the sidebar switcher (M5 PR4); falls
  // back to the personal org if none is active yet (e.g. first-ever load).
  // One pass: projects (newest first) with their environment names (oldest first).
  const orgId = await resolveRequestedOrgId(userId, activeOrgId);
  const rows = orgId ? await listAccessibleProjectsWithEnvs(userId, orgId) : [];

  const byId = new Map<string, ProjectListItem>();
  for (const r of rows) {
    let p = byId.get(r.id);
    if (!p) {
      // timeAgo is computed server-side so the client render matches (no hydration drift).
      p = { id: r.id, name: r.name, createdLabel: timeAgo(r.createdAt), envs: [] };
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
          <CreateProjectDialog />
        </div>
      ) : (
        <ProjectsBrowser projects={projectList} />
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
