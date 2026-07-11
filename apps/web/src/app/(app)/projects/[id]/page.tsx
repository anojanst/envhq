import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { redirect, notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { Layers } from "lucide-react";
import { db } from "@/db";
import { environments } from "@/db/schema";
import { getOwnedProject } from "@/lib/access";
import { ProjectAvatar } from "@/components/project-visuals";
import { CreateEnvironmentDialog } from "./create-environment-dialog";
import { ProjectActions } from "./project-actions";

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");
  const { id } = await params;

  const project = await getOwnedProject(userId, id);
  if (!project) notFound();

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
      <div className="flex flex-col gap-1">
        <Link
          href="/dashboard"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← Projects
        </Link>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <ProjectAvatar name={project.name} />
            <h1 className="text-2xl font-semibold tracking-tight">{project.name}</h1>
          </div>
          <div className="flex items-center gap-2">
            <CreateEnvironmentDialog projectId={project.id} />
            <ProjectActions
              project={{ id: project.id, name: project.name }}
              environmentCount={0}
              variableCount={0}
              hasProdEnv={false}
            />
          </div>
        </div>
      </div>

      <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed py-16 text-center">
        <Layers className="size-8 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          No environments yet. Add one like <code>dev</code> or <code>prod</code>.
        </p>
        <CreateEnvironmentDialog projectId={project.id} />
      </div>
    </div>
  );
}
