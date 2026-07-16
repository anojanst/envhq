import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { apiTokens, projects } from "@/db/schema";
import { listAccessibleProjectsWithEnvsAcrossOrgs } from "@/lib/access";
import { TokensManager } from "./tokens-manager";

export default async function TokensPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  // Project-scoping dropdown: every project the user can access across every
  // org they belong to, not just ones they personally created (this used to
  // be `eq(projects.userId, userId)`, which missed projects reachable only
  // via an org role or an access_grants row). Tokens are user-owned, not
  // org-scoped, so there's no need to pick "which org" first here the way
  // Settings > Groups has to — showing every accessible project at once
  // sidesteps that entirely.
  const [tokens, accessibleRows] = await Promise.all([
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
    listAccessibleProjectsWithEnvsAcrossOrgs(userId),
  ]);
  const projectRows = [...new Map(accessibleRows.map((p) => [p.id, p])).values()].map((p) => ({
    id: p.id,
    name: p.name,
    orgName: p.orgName,
  }));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">CLI Tokens</h1>
        <p className="text-sm text-muted-foreground">
          Personal access tokens let the <code>envhq</code> CLI authenticate — scope one to a
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
