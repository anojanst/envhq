import { requireSessionUserId } from "@/lib/identity";
import { ProjectHeader } from "@/components/project-header";
import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { environments } from "@/db/schema";
import { getAccessibleProject } from "@/lib/access";
import { listGrants, withGrantNames } from "@/lib/grants";
import { AccessManager } from "./access-manager";

export default async function AccessPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const userId = await requireSessionUserId();
  const { id } = await params;

  const owned = await getAccessibleProject(userId, id, "admin");
  if (!owned) notFound();

  const [grants, envs] = await Promise.all([
    listGrants(id).then(withGrantNames),
    db
      .select({ id: environments.id, name: environments.name })
      .from(environments)
      .where(eq(environments.projectId, id))
      .orderBy(asc(environments.createdAt)),
  ]);
  const firstEnvId = envs[0]?.id ?? null;

  return (
    <div className="flex flex-col gap-6">
      <ProjectHeader project={{ id, name: owned.project.name }} section="access" isAdmin firstEnvironmentId={firstEnvId} />
      <p className="max-w-2xl text-sm text-muted-foreground">
        Give team members or groups a role on this project. A role can be limited per environment,
        for example read-only in <code>prod</code>.
      </p>

      <AccessManager
        projectId={id}
        initialGrants={grants.map((g) => ({ ...g, createdAt: g.createdAt.toISOString() }))}
        initialEnvironments={envs}
      />
    </div>
  );
}
