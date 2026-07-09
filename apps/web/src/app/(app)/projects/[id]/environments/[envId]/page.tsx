import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { redirect, notFound } from "next/navigation";
import { getOwnedEnvironment } from "@/lib/access";
import { listVarRows } from "@/lib/env-store";
import { EnvEditor } from "./env-editor";

export default async function EnvironmentPage({
  params,
}: {
  params: Promise<{ id: string; envId: string }>;
}) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");
  const { id: projectId, envId } = await params;

  const owned = await getOwnedEnvironment(userId, envId);
  if (!owned || owned.project.id !== projectId) notFound();

  const vars = await listVarRows(envId);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <Link
          href={`/projects/${projectId}`}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← {owned.project.name}
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">
          {owned.project.name}{" "}
          <span className="text-muted-foreground">/ {owned.env.name}</span>
        </h1>
      </div>

      <EnvEditor environmentId={envId} initialVars={vars} envName={owned.env.name} />
    </div>
  );
}
