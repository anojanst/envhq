import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { accessGrants } from "@/db/schema";
import type { Role } from "@/lib/access";

/**
 * `access_grants` CRUD (M5 PR2 direct users, PR3b groups). Kept separate
 * from `access.ts`, which stays the read-path role-resolution module — this
 * is the management/write side, same split as `env-store.ts` vs. the
 * read-heavy parts of `access.ts`.
 */

export type SubjectType = "user" | "group";

export interface GrantRow {
  id: string;
  subjectType: SubjectType;
  subjectId: string;
  role: Role;
  createdAt: Date;
}

function toGrantRow(row: typeof accessGrants.$inferSelect): GrantRow {
  return {
    id: row.id,
    subjectType: row.subjectType as SubjectType,
    subjectId: row.subjectId,
    role: row.role as Role,
    createdAt: row.createdAt,
  };
}

/** Direct + group grants for a project, oldest first. */
export async function listGrants(projectId: string): Promise<GrantRow[]> {
  const rows = await db
    .select()
    .from(accessGrants)
    .where(eq(accessGrants.projectId, projectId))
    .orderBy(asc(accessGrants.createdAt));
  return rows.map(toGrantRow);
}

/** Grant (or update the role of) a user or group on a project. */
export async function upsertGrant(
  orgId: string,
  projectId: string,
  subjectType: SubjectType,
  subjectId: string,
  role: Role,
): Promise<GrantRow> {
  const [row] = await db
    .insert(accessGrants)
    .values({ orgId, projectId, subjectType, subjectId, role })
    .onConflictDoUpdate({
      target: [accessGrants.projectId, accessGrants.subjectType, accessGrants.subjectId],
      set: { role, updatedAt: new Date() },
    })
    .returning();
  return toGrantRow(row!);
}

/** Revoke a grant. Returns whether a row was actually deleted (for a 404 vs. no-op). */
export async function deleteGrant(projectId: string, grantId: string): Promise<boolean> {
  const deleted = await db
    .delete(accessGrants)
    .where(and(eq(accessGrants.id, grantId), eq(accessGrants.projectId, projectId)))
    .returning({ id: accessGrants.id });
  return deleted.length > 0;
}
