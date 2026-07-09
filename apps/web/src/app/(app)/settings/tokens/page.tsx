import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { apiTokens } from "@/db/schema";
import { TokensManager } from "./tokens-manager";

export default async function TokensPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const tokens = await db
    .select({
      id: apiTokens.id,
      name: apiTokens.name,
      lastUsedAt: apiTokens.lastUsedAt,
      createdAt: apiTokens.createdAt,
    })
    .from(apiTokens)
    .where(eq(apiTokens.userId, userId))
    .orderBy(desc(apiTokens.createdAt));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">CLI Tokens</h1>
        <p className="text-sm text-muted-foreground">
          Personal access tokens let the <code>envsync</code> CLI authenticate. A token is
          shown only once when created.
        </p>
      </div>
      <TokensManager
        initialTokens={tokens.map((t) => ({
          ...t,
          lastUsedAt: t.lastUsedAt?.toISOString() ?? null,
          createdAt: t.createdAt.toISOString(),
        }))}
      />
    </div>
  );
}
