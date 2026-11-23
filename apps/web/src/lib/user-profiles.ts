import { inArray } from "drizzle-orm";
import { db } from "@/db";
import { userProfiles } from "@/db/schema";

/**
 * The local mirror of the identity provider's user fields (RM-6), written from
 * OIDC claims at every sign-in (`app/auth/callback`). Server-only.
 *
 * WHY THIS EXISTS: `resolveDisplayNames` used to call `users.getUser` once per
 * distinct user id. A version history with fifty authors meant fifty Clerk
 * round-trips on the request path — a third party's latency and rate limit
 * sitting in front of a page that is otherwise one database query.
 *
 * THE RULE THIS MODULE MUST NOT BREAK: names are decorative, access decisions
 * are not. Nothing here is an authorization input. Org role is resolved live
 * from `org_members` on every request (`lib/orgs.ts`); a stale or missing row
 * here degrades a label, never a permission. Do not add a role, a membership
 * or any other access-bearing field to `user_profiles` — the moment it feeds
 * a decision, this table's staleness becomes a security property.
 */

export interface UserProfile {
  userId: string;
  name: string | null;
  email: string | null;
  imageUrl: string | null;
}

/** Name, else the raw id. */
function displayName(p: { name: string | null; userId: string }): string {
  return p.name || p.userId;
}

/** Writes (or refreshes) one profile — at every sign-in. */
export async function upsertUserProfile(profile: UserProfile): Promise<void> {
  await db
    .insert(userProfiles)
    .values({ ...profile, syncedAt: new Date() })
    .onConflictDoUpdate({
      target: userProfiles.userId,
      set: {
        name: profile.name,
        email: profile.email,
        imageUrl: profile.imageUrl,
        syncedAt: new Date(),
      },
    });
}

/** Drops a profile — the `user.deleted` webhook. History keeps rendering the raw id. */
export async function deleteUserProfile(userId: string): Promise<void> {
  await db.delete(userProfiles).where(inArray(userProfiles.userId, [userId]));
}

/** Reads whatever profiles we already hold. Never calls the identity provider. */
export async function readLocalProfiles(userIds: string[]): Promise<Map<string, UserProfile>> {
  if (userIds.length === 0) return new Map();
  const rows = await db
    .select({
      userId: userProfiles.userId,
      name: userProfiles.name,
      email: userProfiles.email,
      imageUrl: userProfiles.imageUrl,
    })
    .from(userProfiles)
    .where(inArray(userProfiles.userId, userIds));
  return new Map(rows.map((r) => [r.userId, r]));
}

/**
 * Profiles for `userIds`, from the local mirror only. Since self-hosting
 * phase 3 every profile is written at sign-in from the identity provider's
 * claims, so there is nothing further to fetch: OIDC has no standard "look
 * up another user" call. Ids with no profile (never signed in) are absent.
 */
export async function getUserProfiles(userIds: string[]): Promise<Map<string, UserProfile>> {
  const unique = [...new Set(userIds)];
  if (unique.length === 0) return new Map();
  return readLocalProfiles(unique);
}

/**
 * `userId → display name`, with the raw id as the fallback for anyone we
 * can't resolve. Every id in the input appears in the output, so a caller can
 * index the map without a null check — the pre-RM-6 contract, unchanged.
 */
export async function getDisplayNames(userIds: string[]): Promise<Record<string, string>> {
  const unique = [...new Set(userIds)];
  if (unique.length === 0) return {};
  const profiles = await getUserProfiles(unique);
  return Object.fromEntries(
    unique.map((id) => [id, displayName({ name: profiles.get(id)?.name ?? null, userId: id })]),
  );
}

export interface MemberDescription {
  userId: string;
  name: string;
  email: string;
  imageUrl: string;
}

/**
 * Display fields for a member picker (`OrgMember` in openapi.yaml), in the
 * order given. Decorative only, like everything in this module: the list of
 * *who* is a member comes from `lib/orgs.ts`; this only labels them. Same
 * fallbacks the Clerk-backed pickers used — a name falls back to the email,
 * then to the raw id — and empty strings rather than nulls, as the schema
 * has always promised.
 */
export async function describeMembers(members: { userId: string }[]): Promise<MemberDescription[]> {
  const profiles = await getUserProfiles(members.map((m) => m.userId));
  return members.map(({ userId }) => {
    const p = profiles.get(userId);
    return {
      userId,
      name: p?.name || p?.email || userId,
      email: p?.email ?? "",
      imageUrl: p?.imageUrl ?? "",
    };
  });
}
