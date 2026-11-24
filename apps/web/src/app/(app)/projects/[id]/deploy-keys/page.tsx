import Link from "next/link";
import { requireSessionUserId } from "@/lib/identity";
import { ProjectHeader } from "@/components/project-header";
import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { environments } from "@/db/schema";
import { getAccessibleProject } from "@/lib/access";
import { listDeployKeys } from "@/lib/deploy-keys";
import { getDisplayNames } from "@/lib/user-profiles";
import { DeployKeysManager } from "./deploy-keys-manager";

/**
 * Deploy keys get their own page rather than a section on "Manage access"
 * (RM-11). It is a list with inline mutation plus a multi-field create flow
 * and a one-time reveal — the shape CLAUDE.md says belongs on a page with a
 * breadcrumb, not inside a dialog — and the access page is already carrying
 * grants and the rotation controls.
 */
export default async function DeployKeysPage({ params }: { params: Promise<{ id: string }> }) {
  const userId = await requireSessionUserId();
  const { id } = await params;

  // Admin-only, matching the API: a deploy key is a standing credential for
  // the whole project.
  const owned = await getAccessibleProject(userId, id, "admin");
  if (!owned) notFound();

  const [keys, envs] = await Promise.all([
    listDeployKeys(id),
    db
      .select({ id: environments.id, name: environments.name })
      .from(environments)
      .where(eq(environments.projectId, id))
      .orderBy(asc(environments.createdAt)),
  ]);
  const firstEnvId = envs[0]?.id ?? null;
  const names = await getDisplayNames([...new Set(keys.map((k) => k.createdByUserId))]);

  return (
    <div className="flex flex-col gap-6">
      <ProjectHeader project={{ id, name: owned.project.name }} section="deploy-keys" isAdmin firstEnvironmentId={firstEnvId} />
      <p className="max-w-2xl text-sm text-muted-foreground">
        A deploy key lets a CI pipeline decrypt this project without a person present. It&rsquo;s
        generated in your browser: EnvHQ never receives the private half, so it&rsquo;s shown once.{" "}
        <Link href="/docs/ci" className="underline underline-offset-2 hover:text-foreground">
          How pipelines use it
        </Link>
      </p>

      <DeployKeysManager
        projectId={id}
        projectName={owned.project.name}
        initialKeys={keys.map((k) => ({
          id: k.id,
          label: k.label,
          environmentId: k.environmentId,
          environmentName: k.environmentName,
          publicKey: k.publicKey,
          createdBy: names[k.createdByUserId] ?? k.createdByUserId,
          createdAt: k.createdAt.toISOString(),
          lastUsedAt: k.lastUsedAt?.toISOString() ?? null,
          revokedAt: k.revokedAt?.toISOString() ?? null,
        }))}
        environments={envs}
      />
    </div>
  );
}
