import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { groups, groupMembers } from "@/db/schema";
import { resolveDisplayNames } from "@/lib/auth";

/**
 * `groups`/`group_members` CRUD (M5 PR3; group-based grants wired up in
 * PR3b via `lib/grants.ts`). Parallels `grants.ts`'s split from the
 * read-path role resolution in `access.ts`.
 */

export interface GroupRow {
  id: string;
  name: string;
  memberCount: number;
  createdAt: Date;
}

export interface GroupMemberRow {
  userId: string;
  name: string;
  createdAt: Date;
}

/** Groups in an org, with member counts, ordered by name. */
export async function listGroups(orgId: string): Promise<GroupRow[]> {
  const rows = await db
    .select({
      id: groups.id,
      name: groups.name,
      createdAt: groups.createdAt,
      memberCount: sql<number>`count(${groupMembers.id})::int`,
    })
    .from(groups)
    .leftJoin(groupMembers, eq(groupMembers.groupId, groups.id))
    .where(eq(groups.orgId, orgId))
    .groupBy(groups.id)
    .orderBy(asc(groups.name));
  return rows;
}

/**
 * Batch id → name lookup (M5 PR3b) — mirrors `resolveDisplayNames`'s shape
 * in `lib/auth.ts` so `api/projects/[id]/access/route.ts` can resolve a
 * grant's display name the same way regardless of whether the grant targets
 * a user or a group.
 */
export async function getGroupNames(groupIds: string[]): Promise<Record<string, string>> {
  const unique = [...new Set(groupIds)];
  if (unique.length === 0) return {};
  const rows = await db
    .select({ id: groups.id, name: groups.name })
    .from(groups)
    .where(inArray(groups.id, unique));
  return Object.fromEntries(rows.map((r) => [r.id, r.name]));
}

/** Look up a single group, scoped to its org (so a caller can't probe another org's group id). */
export async function getGroup(orgId: string, groupId: string) {
  const rows = await db
    .select()
    .from(groups)
    .where(and(eq(groups.id, groupId), eq(groups.orgId, orgId)))
    .limit(1);
  return rows[0];
}

/**
 * A group's own org id, or `null` if it doesn't exist. For routes that
 * target a specific group by id (delete, member list/add/remove) — the
 * group's own org is the source of truth for which org to check the
 * caller's admin role against, not a session-level "active org" (there is
 * none now that the org switcher is gone, and even when there was one, a
 * group in a *different* org than whatever happened to be active would
 * have 404'd incorrectly).
 */
export async function getGroupOrgId(groupId: string): Promise<string | null> {
  const rows = await db.select({ orgId: groups.orgId }).from(groups).where(eq(groups.id, groupId)).limit(1);
  return rows[0]?.orgId ?? null;
}

/** Create a group. Throws on duplicate name within the org (23505) — caller catches. */
export async function createGroup(orgId: string, name: string): Promise<GroupRow> {
  const [row] = await db.insert(groups).values({ orgId, name }).returning();
  return { id: row!.id, name: row!.name, createdAt: row!.createdAt, memberCount: 0 };
}

/** Delete a group (cascades to `group_members`). Returns whether a row was deleted. */
export async function deleteGroup(orgId: string, groupId: string): Promise<boolean> {
  const deleted = await db
    .delete(groups)
    .where(and(eq(groups.id, groupId), eq(groups.orgId, orgId)))
    .returning({ id: groups.id });
  return deleted.length > 0;
}

/** A group's members, with resolved display names, ordered by join date. */
export async function listGroupMembers(groupId: string): Promise<GroupMemberRow[]> {
  const rows = await db
    .select()
    .from(groupMembers)
    .where(eq(groupMembers.groupId, groupId))
    .orderBy(asc(groupMembers.createdAt));

  const names = await resolveDisplayNames(rows.map((r) => r.userId));
  return rows.map((r) => ({
    userId: r.userId,
    name: names[r.userId] ?? r.userId,
    createdAt: r.createdAt,
  }));
}

/** Idempotent add — a no-op if already a member. */
export async function addGroupMember(groupId: string, userId: string): Promise<void> {
  await db
    .insert(groupMembers)
    .values({ groupId, userId })
    .onConflictDoNothing({ target: [groupMembers.groupId, groupMembers.userId] });
}

/** Returns whether a row was actually removed (for a 404 vs. no-op). */
export async function removeGroupMember(groupId: string, userId: string): Promise<boolean> {
  const deleted = await db
    .delete(groupMembers)
    .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, userId)))
    .returning({ id: groupMembers.id });
  return deleted.length > 0;
}
