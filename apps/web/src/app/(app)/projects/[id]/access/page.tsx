import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { redirect, notFound } from "next/navigation";
import { eq } from "drizzle-orm";
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
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");
  const { id } = await params;

  const owned = await getAccessibleProject(userId, id, "admin");
  if (!owned) notFound();

  const [grants, envs] = await Promise.all([
    listGrants(id).then(withGrantNames),
    db
      .select({ id: environments.id, name: environments.name })
      .from(environments)
      .where(eq(environments.projectId, id)),
  ]);

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
          <span className="text-foreground">Access</span>
        </nav>
        <h1 className="text-2xl font-semibold tracking-tight">Manage access</h1>
        <p className="text-sm text-muted-foreground">
          Grant org members or groups a role on this project, with optional per-environment
          restrictions.
        </p>
      </div>

      <AccessManager
        projectId={id}
        initialGrants={grants.map((g) => ({ ...g, createdAt: g.createdAt.toISOString() }))}
        initialEnvironments={envs}
      />
    </div>
  );
}
