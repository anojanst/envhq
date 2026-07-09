import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { projects, environments, envVars } from "@/db/schema";

/**
 * Ownership-scoped lookups. Every read/write path goes through one of these so
 * a user can only ever touch rows that roll up to their own `userId` (v1 is
 * personal-only). Each returns the row or `undefined` if it doesn't exist or
 * isn't owned by the caller — callers treat `undefined` as 404.
 */

export async function getOwnedProject(userId: string, projectId: string) {
  const rows = await db
    .select()
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.userId, userId)))
    .limit(1);
  return rows[0];
}

export async function getOwnedEnvironment(userId: string, environmentId: string) {
  const rows = await db
    .select({ env: environments, project: projects })
    .from(environments)
    .innerJoin(projects, eq(environments.projectId, projects.id))
    .where(and(eq(environments.id, environmentId), eq(projects.userId, userId)))
    .limit(1);
  return rows[0];
}

export async function getOwnedVar(userId: string, varId: string) {
  const rows = await db
    .select({ envVar: envVars, environment: environments })
    .from(envVars)
    .innerJoin(environments, eq(envVars.environmentId, environments.id))
    .innerJoin(projects, eq(environments.projectId, projects.id))
    .where(and(eq(envVars.id, varId), eq(projects.userId, userId)))
    .limit(1);
  return rows[0];
}
