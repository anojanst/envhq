import { requireSessionUserId } from "@/lib/identity";
import { redirect, notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { Layers } from "lucide-react";
import { db } from "@/db";
import { environments } from "@/db/schema";
import { getAccessibleProject } from "@/lib/access";
import { withPerf } from "@/lib/perf";
import { ProjectHeader } from "@/components/project-header";
import { CreateEnvironmentDialog } from "./create-environment-dialog";

export default async function ProjectPage(props: { params: Promise<{ id: string }> }) {
  return withPerf("projects/[id]", () => renderProject(props));
}

async function renderProject({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const userId = await requireSessionUserId();
  const { id } = await params;

  const owned = await getAccessibleProject(userId, id);
  if (!owned) notFound();
  const { project } = owned;

  const [firstEnv] = await db
    .select({ id: environments.id })
    .from(environments)
    .where(eq(environments.projectId, id))
    .orderBy(asc(environments.createdAt))
    .limit(1);

  // A project opens straight into its default (first) environment — the env
  // editor is the real destination, so there's no contentless overview page.
  if (firstEnv) {
    redirect(`/projects/${id}/environments/${firstEnv.id}`);
  }

  // No environments yet (only reachable by deleting the last one) — nothing to
  // redirect to, so show the project header + a create prompt.
  return (
    <div className="flex flex-col gap-6">
      <ProjectHeader
        project={{ id: project.id, name: project.name }}
        section="variables"
        isAdmin={owned.role === "admin"}
        stats={{ environmentCount: 0, variableCount: 0, hasProdEnv: false }}
      />
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed bg-card/50 px-6 py-16 text-center">
        <span className="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <Layers className="size-5" />
        </span>
        <div className="flex flex-col gap-1">
          <p className="text-sm font-medium">No environments</p>
          <p className="text-sm text-muted-foreground">
            Values live in environments, like <code>dev</code> or <code>prod</code>.
          </p>
        </div>
        <CreateEnvironmentDialog projectId={project.id} prominent />
      </div>
    </div>
  );
}
