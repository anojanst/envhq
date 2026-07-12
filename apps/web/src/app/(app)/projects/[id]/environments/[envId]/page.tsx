import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { redirect, notFound } from "next/navigation";
import { and, asc, eq, count, isNull } from "drizzle-orm";
import { db } from "@/db";
import { environments, envVars } from "@/db/schema";
import { getAccessibleEnvironment } from "@/lib/access";
import { listVarRows } from "@/lib/env-store";
import { ProjectAvatar, isProdEnv } from "@/components/project-visuals";
import { EnvironmentTabs } from "@/components/environment-tabs";
import { CreateEnvironmentDialog } from "../../create-environment-dialog";
import { ProjectActions } from "../../project-actions";
import { EnvEditor } from "./env-editor";
import { EnvironmentHistory } from "./environment-history";

export default async function EnvironmentPage({
  params,
}: {
  params: Promise<{ id: string; envId: string }>;
}) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");
  const { id: projectId, envId } = await params;

  const owned = await getAccessibleEnvironment(userId, envId);
  if (!owned || owned.project.id !== projectId) notFound();

  const [vars, siblingEnvs] = await Promise.all([
    listVarRows(envId),
    db
      .select({
        id: environments.id,
        name: environments.name,
        varCount: count(envVars.id),
      })
      .from(environments)
      .leftJoin(
        envVars,
        and(eq(envVars.environmentId, environments.id), isNull(envVars.deletedAt)),
      )
      .where(eq(environments.projectId, projectId))
      .groupBy(environments.id)
      .orderBy(asc(environments.createdAt)),
  ]);

  const totalVars = siblingEnvs.reduce((sum, e) => sum + e.varCount, 0);
  const hasProdEnv = siblingEnvs.some((e) => isProdEnv(e.name));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <Link
          href="/dashboard"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← Projects
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <ProjectAvatar name={owned.project.name} />
            <h1 className="text-2xl font-semibold tracking-tight">
              {owned.project.name}
            </h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <EnvironmentTabs
              projectId={projectId}
              environments={siblingEnvs}
              activeEnvId={envId}
            />
            <CreateEnvironmentDialog projectId={projectId} />
            <ProjectActions
              project={{ id: projectId, name: owned.project.name }}
              environmentCount={siblingEnvs.length}
              variableCount={totalVars}
              hasProdEnv={hasProdEnv}
            />
          </div>
        </div>
      </div>

      <EnvironmentHistory environmentId={envId} />

      <EnvEditor
        environmentId={envId}
        projectId={projectId}
        initialVars={vars.map((v) => ({ ...v, updatedAt: v.updatedAt.toISOString() }))}
        envName={owned.env.name}
      />
    </div>
  );
}
