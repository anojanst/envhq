import { auth, clerkClient } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { timeClerk } from "@/lib/perf";
import type { DirectoryUser } from "./index";

/**
 * The Clerk adapter behind `lib/identity` — the only module that asks Clerk
 * who someone is. Server-only.
 */

/** Clerk caps `getUserList({ userId })` at 100 ids per call. */
const CLERK_ID_BATCH = 100;

/** The signed-in user's id from the session cookie, or null when there is no session. */
export async function sessionUserId(): Promise<string | null> {
  const { userId } = await auth();
  return userId ?? null;
}

/** The signed-in user's id; sends anyone without a session to sign in. For pages. */
export async function requireSessionUserId(): Promise<string> {
  const userId = await sessionUserId();
  if (!userId) redirect("/sign-in");
  return userId;
}

/**
 * One user, straight from the provider. Throws if the provider can't be
 * reached — for callers where a missing answer must not be papered over.
 */
export async function getDirectoryUser(userId: string): Promise<DirectoryUser> {
  const client = await clerkClient();
  return toDirectoryUser(await timeClerk("users.getUser", () => client.users.getUser(userId)));
}

/**
 * Many users, in batches of 100: fifty unknown ids cost one call, not fifty.
 *
 * Never throws. A batch that fails (outage, rate limit, a deleted id) is
 * skipped and its ids are simply absent from the result, so a caller
 * degrades to raw ids instead of failing its page.
 */
export async function lookupDirectoryUsers(userIds: string[]): Promise<DirectoryUser[]> {
  if (userIds.length === 0) return [];
  const client = await clerkClient();
  const found: DirectoryUser[] = [];
  for (let i = 0; i < userIds.length; i += CLERK_ID_BATCH) {
    const batch = userIds.slice(i, i + CLERK_ID_BATCH);
    try {
      const { data } = await timeClerk("users.getUserList", () =>
        client.users.getUserList({ userId: batch, limit: batch.length }),
      );
      found.push(...data.map(toDirectoryUser));
    } catch {
      continue;
    }
  }
  return found;
}

/** Clerk's user shape → ours. Name falls back first name → username, as it always has. */
export function toDirectoryUser(user: {
  id: string;
  firstName: string | null;
  username: string | null;
  imageUrl?: string;
  primaryEmailAddress?: { emailAddress: string } | null;
  emailAddresses?: { id: string; emailAddress: string }[];
  primaryEmailAddressId?: string | null;
}): DirectoryUser {
  const email =
    user.primaryEmailAddress?.emailAddress ??
    user.emailAddresses?.find((e) => e.id === user.primaryEmailAddressId)?.emailAddress ??
    null;
  return {
    id: user.id,
    name: user.firstName || user.username || null,
    email,
    imageUrl: user.imageUrl ?? null,
  };
}
