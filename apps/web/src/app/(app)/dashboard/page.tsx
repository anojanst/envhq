import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { desc, eq, count } from "drizzle-orm";
import { db } from "@/db";
import { projects, environments } from "@/db/schema";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { CreateProjectDialog } from "./create-project-dialog";
import { FolderTree } from "lucide-react";

export default async function DashboardPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const rows = await db
    .select({
      id: projects.id,
      name: projects.name,
      createdAt: projects.createdAt,
      envCount: count(environments.id),
    })
    .from(projects)
    .leftJoin(environments, eq(environments.projectId, projects.id))
    .where(eq(projects.userId, userId))
    .groupBy(projects.id)
    .orderBy(desc(projects.createdAt));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Projects</h1>
          <p className="text-sm text-muted-foreground">
            Each project groups its own set of environments.
          </p>
        </div>
        <CreateProjectDialog />
      </div>

      {rows.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed py-16 text-center">
          <FolderTree className="size-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            No projects yet. Create your first one to get started.
          </p>
          <CreateProjectDialog />
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((project) => (
            <Link key={project.id} href={`/projects/${project.id}`}>
              <Card className="h-full transition-colors hover:border-primary">
                <CardHeader>
                  <CardTitle>{project.name}</CardTitle>
                  <CardDescription>
                    {project.envCount} environment{project.envCount === 1 ? "" : "s"}
                  </CardDescription>
                </CardHeader>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
