import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { apiTokens, projects } from "@/db/schema";
import { TokensManager } from "./tokens-manager";

export default async function TokensPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const [tokens, projectRows] = await Promise.all([
    db
      .select({
        id: apiTokens.id,
        name: apiTokens.name,
        kind: apiTokens.kind,
        capability: apiTokens.capability,
        projectId: apiTokens.projectId,
        projectName: projects.name,
        expiresAt: apiTokens.expiresAt,
        lastUsedAt: apiTokens.lastUsedAt,
        createdAt: apiTokens.createdAt,
      })
      .from(apiTokens)
      .leftJoin(projects, eq(apiTokens.projectId, projects.id))
      .where(eq(apiTokens.userId, userId))
      .orderBy(desc(apiTokens.createdAt)),
    db
      .select({ id: projects.id, name: projects.name })
      .from(projects)
      .where(eq(projects.userId, userId))
      .orderBy(desc(projects.createdAt)),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">CLI Tokens</h1>
        <p className="text-sm text-muted-foreground">
          Personal access tokens let the <code>envsync</code> CLI authenticate — scope one to a
          single project and to read-only for CI. A token is shown only once when created.
        </p>
      </div>
      <TokensManager
        projects={projectRows}
        initialTokens={tokens.map((t) => ({
          ...t,
          expiresAt: t.expiresAt?.toISOString() ?? null,
          lastUsedAt: t.lastUsedAt?.toISOString() ?? null,
          createdAt: t.createdAt.toISOString(),
        }))}
      />
    </div>
  );
}
