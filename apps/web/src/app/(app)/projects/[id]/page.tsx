import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { redirect, notFound } from "next/navigation";
import { asc, eq, count } from "drizzle-orm";
import { db } from "@/db";
import { environments, envVars } from "@/db/schema";
import { getOwnedProject } from "@/lib/access";
import { CreateEnvironmentDialog } from "./create-environment-dialog";
import { ProjectActions } from "./project-actions";
import { EnvironmentList } from "./environment-list";

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

  const envs = await db
    .select({
      id: environments.id,
      name: environments.name,
      varCount: count(envVars.id),
    })
    .from(environments)
    .leftJoin(envVars, eq(envVars.environmentId, environments.id))
    .where(eq(environments.projectId, id))
    .groupBy(environments.id)
    .orderBy(asc(environments.createdAt));

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
          <h1 className="text-2xl font-semibold tracking-tight">{project.name}</h1>
          <div className="flex items-center gap-2">
            <CreateEnvironmentDialog projectId={project.id} />
            <ProjectActions project={{ id: project.id, name: project.name }} />
          </div>
        </div>
        <p className="text-sm text-muted-foreground">
          Environments hold the actual key/value pairs. Add as many as you need.
        </p>
      </div>

      <EnvironmentList projectId={project.id} environments={envs} />
    </div>
  );
}
