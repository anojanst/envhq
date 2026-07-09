import { auth } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { apiTokens } from "@/db/schema";
import { hashToken } from "./crypto";

/**
 * Resolve the acting user for a request from EITHER source:
 *   1. `Authorization: Bearer <token>` — used by the CLI (personal token)
 *   2. Clerk session cookie — used by the web app
 *
 * This is the single seam that lets both clients share the same API routes.
 * Returns the Clerk userId, or null if unauthenticated.
 */
export async function getUserId(req: Request): Promise<string | null> {
  const header = req.headers.get("authorization");
  if (header?.startsWith("Bearer ")) {
    const token = header.slice("Bearer ".length).trim();
    if (!token) return null;
    const rows = await db
      .select()
      .from(apiTokens)
      .where(eq(apiTokens.tokenHash, hashToken(token)))
      .limit(1);
    const record = rows[0];
    if (!record) return null;
    // Best-effort last-used tracking; don't block the request on it.
    void db
      .update(apiTokens)
      .set({ lastUsedAt: new Date() })
      .where(eq(apiTokens.id, record.id));
    return record.userId;
  }

  const { userId } = await auth();
  return userId ?? null;
}
