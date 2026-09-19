import { inArray } from "drizzle-orm";
import { clerkClient } from "@clerk/nextjs/server";
import { db } from "@/db";
import { userProfiles } from "@/db/schema";
import { timeClerk } from "@/lib/perf";

/**
 * The local mirror of Clerk's user fields (RM-6). Server-only.
 *
 * WHY THIS EXISTS: `resolveDisplayNames` used to call `users.getUser` once per
 * distinct user id. A version history with fifty authors meant fifty Clerk
 * round-trips on the request path — a third party's latency and rate limit
 * sitting in front of a page that is otherwise one database query.
 *
 * THE RULE THIS MODULE MUST NOT BREAK: names are decorative, access decisions
 * are not. Nothing here is an authorization input. Org role is still resolved
 * live against Clerk on every request (`lib/orgs.ts`); a stale or missing row
 * here degrades a label, never a permission. Do not add a role, a membership
 * or any other access-bearing field to `user_profiles` — the moment it feeds
 * a decision, this table's staleness becomes a security property.
 */

/** Clerk caps `getUserList({ userId })` at 100 ids per call. */
const CLERK_ID_BATCH = 100;

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

/** Clerk's user shape → the fields we mirror. Same chain `getOrCreatePersonalOrg` uses. */
function toProfile(user: {
  id: string;
  firstName: string | null;
  username: string | null;
  imageUrl?: string;
  primaryEmailAddress?: { emailAddress: string } | null;
  emailAddresses?: { id: string; emailAddress: string }[];
  primaryEmailAddressId?: string | null;
}): UserProfile {
  const primary =
    user.primaryEmailAddress?.emailAddress ??
    user.emailAddresses?.find((e) => e.id === user.primaryEmailAddressId)?.emailAddress ??
    null;
  return {
    userId: user.id,
    name: user.firstName || user.username || null,
    email: primary,
    imageUrl: user.imageUrl ?? null,
  };
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

/** Reads whatever profiles we already hold. Never calls Clerk. */
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
 * Fetches profiles Clerk knows about that we don't, and stores them — the
 * "lazy fill for users who predate the webhook" the ticket asks for.
 *
 * Batched: `getUserList({ userId: [...] })` takes up to 100 ids per call, so
 * filling fifty unknown authors costs ONE Clerk call, not fifty. Once filled,
 * subsequent renders cost zero.
 *
 * Never throws. A Clerk outage during a fill leaves the ids unresolved, and
 * the caller falls back to raw ids — a degraded label, not a failed page.
 */
async function fillFromClerk(missing: string[]): Promise<Map<string, UserProfile>> {
  const filled = new Map<string, UserProfile>();
  if (missing.length === 0) return filled;

  const client = await clerkClient();
  for (let i = 0; i < missing.length; i += CLERK_ID_BATCH) {
    const batch = missing.slice(i, i + CLERK_ID_BATCH);
    try {
      const { data } = await timeClerk("users.getUserList", () =>
        client.users.getUserList({ userId: batch, limit: batch.length }),
      );
      for (const user of data) {
        const profile = toProfile(user);
        filled.set(profile.userId, profile);
      }
    } catch {
      // Outage, rate limit, or a batch containing a deleted id. Leave these
      // unresolved rather than failing the caller's page.
      continue;
    }
  }

  // Persisted best-effort and awaited: the whole point is that the *next*
  // request costs nothing, and these are small rows on a path that already
  // went to Clerk. A write failure is not worth failing the page over.
  await Promise.all(
    [...filled.values()].map((p) => upsertUserProfile(p).catch(() => undefined)),
  );
  return filled;
}

/**
 * Profiles for `userIds`, local-first. Anything we already hold costs zero
 * Clerk calls; anything we don't is filled in batches of 100 and cached for
 * next time. Ids Clerk can't resolve are simply absent from the result.
 */
export async function getUserProfiles(userIds: string[]): Promise<Map<string, UserProfile>> {
  const unique = [...new Set(userIds)];
  if (unique.length === 0) return new Map();

  const local = await readLocalProfiles(unique);
  const missing = unique.filter((id) => !local.has(id));
  if (missing.length === 0) return local;

  for (const [id, profile] of await fillFromClerk(missing)) local.set(id, profile);
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
