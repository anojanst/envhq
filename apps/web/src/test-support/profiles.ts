import { testDb } from "./db";
import { userProfiles } from "@/db/schema";

/**
 * Seeds what a user's identity provider said at their last sign-in — the
 * `user_profiles` row `app/auth/callback` writes. Since self-hosting phase 3
 * this is the only place display names come from, so tests seed it directly.
 */
export async function setProfile(p: { id: string; name?: string | null; email?: string | null }): Promise<void> {
  await testDb
    .insert(userProfiles)
    .values({ userId: p.id, name: p.name ?? null, email: p.email ?? null, imageUrl: null })
    .onConflictDoUpdate({ target: userProfiles.userId, set: { name: p.name ?? null, email: p.email ?? null } });
}
