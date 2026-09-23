import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { redirect, notFound } from "next/navigation";
import { eq } from "drizzle-orm";
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
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");
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
      .where(eq(environments.projectId, id)),
  ]);
  const names = await getDisplayNames([...new Set(keys.map((k) => k.createdByUserId))]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <nav className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <Link href="/dashboard" className="hover:text-foreground">
            Projects
          </Link>
          <span>/</span>
          <Link href={`/projects/${id}`} className="hover:text-foreground">
            {owned.project.name}
          </Link>
          <span>/</span>
          <span className="text-foreground">Deploy keys</span>
        </nav>
        <h1 className="text-2xl font-semibold tracking-tight">Deploy keys</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          A deploy key lets a CI pipeline decrypt this project&rsquo;s values without a person
          present. Each one is generated in your browser — EnvHQ never receives the private half
          and cannot show it to you twice.
        </p>
      </div>

      <DeployKeysManager
        projectId={id}
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
