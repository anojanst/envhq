import { eq } from "drizzle-orm";
import { db } from "@/db";
import { apiTokens } from "@/db/schema";
import { hashToken } from "./crypto";
import { sessionUserId } from "./identity";

/** The capability + project scope carried by a CLI token (null project = all). */
export interface TokenScope {
  projectId: string | null;
  capability: "read" | "write";
}

/**
 * Result of resolving the acting user:
 *   - `userId` set  → authenticated (via CLI token or Clerk session)
 *   - `expired`     → a CLI token matched but is past its `expiresAt`; callers
 *                     should return a distinct `token_expired` 401 so the CLI
 *                     knows to re-run the browser login rather than give up
 *   - `scope`       → present only for CLI tokens; used to enforce PAT scoping
 */
export interface AuthResult {
  userId: string | null;
  expired?: boolean;
  scope?: TokenScope;
}

/**
 * Resolve the acting user for a request from EITHER source:
 *   1. `Authorization: Bearer <token>` — used by the CLI (personal token)
 *   2. The identity provider's session cookie — used by the web app
 *
 * This is the single seam that lets both clients share the same API routes.
 */
export async function getUserId(req: Request): Promise<AuthResult> {
  const header = req.headers.get("authorization");
  if (header?.startsWith("Bearer ")) {
    const token = header.slice("Bearer ".length).trim();
    if (!token) return { userId: null };
    const rows = await db
      .select()
      .from(apiTokens)
      .where(eq(apiTokens.tokenHash, hashToken(token)))
      .limit(1);
    const record = rows[0];
    if (!record) return { userId: null };
    if (record.expiresAt && record.expiresAt.getTime() <= Date.now()) {
      return { userId: null, expired: true };
    }
    // Best-effort last-used tracking; don't block the request on it.
    void db
      .update(apiTokens)
      .set({ lastUsedAt: new Date() })
      .where(eq(apiTokens.id, record.id));
    return {
      userId: record.userId,
      scope: {
        projectId: record.projectId,
        capability: record.capability === "read" ? "read" : "write",
      },
    };
  }

  return { userId: await sessionUserId() };
}

/**
 * Resolve Clerk user ids to a display name for history/blame UI — same
 * fallback chain as before (`firstName || username || <id>`), but served from
 * the local `user_profiles` mirror instead of one Clerk call per id (RM-6).
 *
 * Kept here as a thin re-export so the ~four call sites don't all have to
 * move; the store itself lives in `lib/user-profiles.ts`.
 */
export { getDisplayNames as resolveDisplayNames } from "@/lib/user-profiles";
