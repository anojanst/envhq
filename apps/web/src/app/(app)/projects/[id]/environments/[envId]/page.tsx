import { requireSessionUserId } from "@/lib/identity";
import { notFound } from "next/navigation";
import { and, asc, eq, count, isNull } from "drizzle-orm";
import { db } from "@/db";
import { deployKeys, environments, envVars } from "@/db/schema";
import { getAccessibleEnvironment } from "@/lib/access";
import { withPerf } from "@/lib/perf";
import { getOrCreatePersonalOrg, listMyOrgs } from "@/lib/orgs";
import { listVarRows } from "@/lib/env-store";
import { isProdEnv } from "@/components/project-visuals";
import { ProjectHeader } from "@/components/project-header";
import { EnvironmentTabs } from "@/components/environment-tabs";
import { CreateEnvironmentDialog } from "../../create-environment-dialog";
import { EnvEditor } from "./env-editor";
import { EnvironmentHistory } from "./environment-history";
import { EnvironmentActions } from "./environment-actions";
import { EnvironmentPanel } from "./environment-panel";

export default async function EnvironmentPage(props: {
  params: Promise<{ id: string; envId: string }>;
}) {
  return withPerf("projects/[id]/environments/[envId]", () => renderEnvironment(props));
}

async function renderEnvironment({
  params,
}: {
  params: Promise<{ id: string; envId: string }>;
}) {
  const userId = await requireSessionUserId();
  const { id: projectId, envId } = await params;

  const owned = await getAccessibleEnvironment(userId, envId);
  if (!owned || owned.project.id !== projectId) notFound();

  const isAdmin = owned.role === "admin";
  const [vars, siblingEnvs, cliOrg, deployKeyCount] = await Promise.all([
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
    cliOrgName(userId, owned.project.orgId),
    isAdmin
      ? db
          .select({ n: count() })
          .from(deployKeys)
          .where(and(eq(deployKeys.projectId, projectId), isNull(deployKeys.revokedAt)))
          .then((r) => r[0]?.n ?? 0)
      : 0,
  ]);

  const totalVars = siblingEnvs.reduce((sum, e) => sum + e.varCount, 0);
  const hasProdEnv = siblingEnvs.some((e) => isProdEnv(e.name));
  // Changes whenever a value is added, edited or removed, so the version bar
  // (a client component that fetches its own data) knows to refetch after
  // the editor asks the page to refresh.
  const revision = `${vars.length}:${vars.reduce((m, v) => Math.max(m, v.updatedAt.getTime()), 0)}`;

  return (
    <div className="flex flex-col gap-6">
      <ProjectHeader
        project={{ id: projectId, name: owned.project.name }}
        section="variables"
        isAdmin={isAdmin}
        firstEnvironmentId={siblingEnvs[0]?.id}
        stats={{ environmentCount: siblingEnvs.length, variableCount: totalVars, hasProdEnv }}
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px] xl:items-start">
        <div className="flex min-w-0 flex-col gap-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <EnvironmentTabs projectId={projectId} environments={siblingEnvs} activeEnvId={envId} />
            <div className="flex items-center gap-1">
              <CreateEnvironmentDialog projectId={projectId} existingNames={siblingEnvs.map((e) => e.name)} />
              <EnvironmentActions
                projectId={projectId}
                environmentId={envId}
                envName={owned.env.name}
                variableCount={vars.length}
              />
            </div>
          </div>

          <EnvEditor
            environmentId={envId}
            projectId={projectId}
            initialVars={vars.map((v) => ({ ...v, updatedAt: v.updatedAt.toISOString() }))}
            envName={owned.env.name}
          />
        </div>

        <EnvironmentPanel
          history={<EnvironmentHistory environmentId={envId} revision={revision} />}
          commands={cliCommands(owned.project.name, cliOrg, owned.env.name)}
          admin={
            isAdmin
              ? {
                  accessHref: `/projects/${projectId}/access`,
                  deployKeysHref: `/projects/${projectId}/deploy-keys`,
                  deployKeyCount,
                }
              : undefined
          }
        />
      </div>
    </div>
  );
}

/**
 * `envhq link` looks in your personal org unless told otherwise, so a team
 * project's commands name the team. Null for a personal project.
 */
async function cliOrgName(userId: string, orgId: string): Promise<string | null> {
  const personal = await getOrCreatePersonalOrg(userId);
  if (orgId === personal) return null;
  return (await listMyOrgs(userId)).find((o) => o.id === orgId)?.name ?? null;
}

function shellArg(s: string): string {
  return /^[\w.@:/=-]+$/.test(s) ? s : `'${s.replace(/'/g, `'\\''`)}'`;
}

function cliCommands(project: string, org: string | null, env: string): string[] {
  return [
    `envhq link -p ${shellArg(project)}${org ? ` --org ${shellArg(org)}` : ""}`,
    `envhq pull ${shellArg(env)}`,
    `envhq run -e ${shellArg(env)} -- npm start`,
  ];
}
