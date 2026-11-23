import { inArray } from "drizzle-orm";
import { db } from "@/db";
import { userProfiles } from "@/db/schema";
import { lookupDirectoryUsers } from "@/lib/identity";

/**
 * The local mirror of the identity provider's user fields (RM-6; Clerk today). Server-only.
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

/** The display-name fallback chain, kept identical to what Clerk gave us before. */
function displayName(p: { name: string | null; userId: string }): string {
  return p.name || p.userId;
}

/** Writes (or refreshes) one profile. Used by the Clerk webhook and the lazy fill. */
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
 * Fetches profiles the identity provider knows about that we don't, and
 * stores them — the "lazy fill for users who predate the webhook" the ticket
 * asks for. Batched inside `lookupDirectoryUsers`, so fifty unknown authors
 * cost one provider call, not fifty; once filled, later renders cost zero.
 *
 * Never throws: ids the provider can't resolve stay unresolved, and the
 * caller falls back to raw ids — a degraded label, not a failed page.
 */
async function fillFromDirectory(missing: string[]): Promise<Map<string, UserProfile>> {
  const filled = new Map<string, UserProfile>();
  for (const user of await lookupDirectoryUsers(missing)) {
    filled.set(user.id, { userId: user.id, name: user.name, email: user.email, imageUrl: user.imageUrl });
  }

  // Persisted best-effort and awaited: the whole point is that the *next*
  // request costs nothing, and these are small rows on a path that already
  // went to the provider. A write failure is not worth failing the page over.
  await Promise.all(
    [...filled.values()].map((p) => upsertUserProfile(p).catch(() => undefined)),
  );
  return filled;
}

/**
 * Profiles for `userIds`, local-first. Anything we already hold costs zero
 * provider calls; anything we don't is filled in batches of 100 and cached for
 * next time. Ids the provider can't resolve are simply absent from the result.
 */
export async function getUserProfiles(userIds: string[]): Promise<Map<string, UserProfile>> {
  const unique = [...new Set(userIds)];
  if (unique.length === 0) return new Map();

  const local = await readLocalProfiles(unique);
  const missing = unique.filter((id) => !local.has(id));
  if (missing.length === 0) return local;

  for (const [id, profile] of await fillFromDirectory(missing)) local.set(id, profile);
  return local;
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
