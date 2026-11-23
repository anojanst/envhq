import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { orgMembers, orgs } from "@/db/schema";

/**
 * Orgs and memberships in Postgres (self-hosting phase 2). Server-only, and
 * nothing but SQL: no Clerk, no caching. `lib/orgs.ts` is the read side;
 * `lib/org-admin.ts` holds the mutations with their invariants.
 *
 * These rows are authorization inputs — see the note on `orgs` in
 * `db/schema.ts`. Every read here is a live query; `lib/orgs.ts` wraps the
 * per-user read in a request-scoped `cache()` and nothing wider.
 */

export type OrgRole = "admin" | "member";

export interface StoredMembership {
  id: string;
  name: string;
  role: OrgRole;
}

export interface StoredMember {
  userId: string;
  role: OrgRole;
}

export interface OrgSnapshot {
  id: string;
  name: string;
  personal: boolean;
  createdByUserId: string | null;
  members: StoredMember[];
}

/** Every org a user belongs to, with their role — oldest membership first, so the order is stable. */
export async function readMemberships(userId: string): Promise<StoredMembership[]> {
  return db
    .select({ id: orgs.id, name: orgs.name, role: orgMembers.role })
    .from(orgMembers)
    .innerJoin(orgs, eq(orgs.id, orgMembers.orgId))
    .where(eq(orgMembers.userId, userId))
    .orderBy(asc(orgMembers.createdAt), asc(orgs.id));
}

/** Every member of one org. Unpaginated on purpose: an org's member list is small, and a truncated list is an authorization bug. */
export async function readOrgMembers(orgId: string): Promise<StoredMember[]> {
  return db
    .select({ userId: orgMembers.userId, role: orgMembers.role })
    .from(orgMembers)
    .where(eq(orgMembers.orgId, orgId))
    .orderBy(asc(orgMembers.createdAt), asc(orgMembers.userId));
}

/**
 * Makes Postgres hold exactly `snapshot` for one org: the org row upserted,
 * its member list replaced. One transaction, so a concurrent role check sees
 * the old list or the new one, never half of each. Idempotent.
 */
export async function replaceOrg(snapshot: OrgSnapshot): Promise<void> {
  await db.transaction(async (tx) => {
    await tx
      .insert(orgs)
      .values({
        id: snapshot.id,
        name: snapshot.name,
        personal: snapshot.personal,
        createdByUserId: snapshot.createdByUserId,
      })
      .onConflictDoUpdate({
        target: orgs.id,
        set: { name: snapshot.name, personal: snapshot.personal, updatedAt: new Date() },
      });
    await tx.delete(orgMembers).where(eq(orgMembers.orgId, snapshot.id));
    if (snapshot.members.length > 0) {
      await tx
        .insert(orgMembers)
        .values(snapshot.members.map((m) => ({ orgId: snapshot.id, userId: m.userId, role: m.role })));
    }
  });
}

/** One org's own fields, or null. */
export async function readOrg(orgId: string): Promise<{ id: string; name: string; personal: boolean } | null> {
  const [org] = await db
    .select({ id: orgs.id, name: orgs.name, personal: orgs.personal })
    .from(orgs)
    .where(eq(orgs.id, orgId))
    .limit(1);
  return org ?? null;
}
