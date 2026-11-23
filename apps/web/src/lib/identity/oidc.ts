import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { inArray } from "drizzle-orm";
import { db } from "@/db";
import { userProfiles } from "@/db/schema";
import { SESSION_COOKIE, openSession } from "@/lib/session";
import type { DirectoryUser } from "./index";

/**
 * The OIDC adapter behind `lib/identity` (self-hosting phase 3). Server-only.
 *
 * Who is signed in comes from EnvHQ's own session cookie (`lib/session.ts`),
 * issued at `/auth/callback` after the identity provider vouched for them.
 * What we know about a person — name, email, avatar — is what their provider
 * said at their last sign-in, kept in `user_profiles`. OIDC has no standard
 * "look up another user" call, so a user who has never signed in has no
 * profile, and callers fall back to their raw id.
 */

/** The signed-in user's id from the session cookie, or null. For server components. */
export async function sessionUserId(): Promise<string | null> {
  const jar = await cookies();
  return (await openSession(jar.get(SESSION_COOKIE)?.value))?.userId ?? null;
}

/** The same, read from a route handler's own `Request` — no request-scope magic needed. */
export async function requestSessionUserId(req: Request): Promise<string | null> {
  return (await openSession(readCookie(req.headers.get("cookie"), SESSION_COOKIE)))?.userId ?? null;
}

function readCookie(header: string | null, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq > 0 && part.slice(0, eq).trim() === name) return decodeURIComponent(part.slice(eq + 1).trim());
  }
  return undefined;
}

/** The signed-in user's id; anyone without a session is sent to sign in. For pages. */
export async function requireSessionUserId(): Promise<string> {
  const userId = await sessionUserId();
  if (!userId) redirect("/sign-in");
  return userId;
}

/** One user, as of their last sign-in. Never throws: an unknown id has empty display fields. */
export async function getDirectoryUser(userId: string): Promise<DirectoryUser> {
  const [found] = await lookupDirectoryUsers([userId]);
  return found ?? { id: userId, name: null, email: null, imageUrl: null };
}

/** Many users, as of their last sign-ins. Ids with no profile are absent. */
export async function lookupDirectoryUsers(userIds: string[]): Promise<DirectoryUser[]> {
  if (userIds.length === 0) return [];
  const rows = await db.select().from(userProfiles).where(inArray(userProfiles.userId, userIds));
  return rows.map((r) => ({ id: r.userId, name: r.name, email: r.email, imageUrl: r.imageUrl }));
}
