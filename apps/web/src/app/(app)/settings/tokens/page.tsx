import { requireSessionUserId } from "@/lib/identity";
import { and, desc, eq, ne } from "drizzle-orm";
import { db } from "@/db";
import { apiTokens, projects } from "@/db/schema";
import { listAccessibleProjectsWithEnvsAcrossOrgs } from "@/lib/access";
import { TokensManager } from "./tokens-manager";

export default async function TokensPage() {
  const userId = await requireSessionUserId();

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
      // A deploy key's token belongs to the deploy key: revoking it here would
      // break a pipeline while leaving the key listed as active. It's managed
      // (and revoked, together) on the project's Deploy keys tab.
      .where(and(eq(apiTokens.userId, userId), ne(apiTokens.kind, "deploy")))
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
      <p className="max-w-2xl text-sm text-muted-foreground">
        Tokens let the <code>envhq</code> CLI act as you from scripts. Each is shown once. CI
        pipelines should use a project&rsquo;s deploy key instead: it&rsquo;s the only credential that
        can decrypt without you there.
      </p>
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
