import fixture from "@/lib/access-matrix.fixtures.json";
import type { FixtureWorld } from "./seed-fixture";
import { getAccessibleProject, getAccessibleEnvironment, getAccessibleVar, type Role } from "@/lib/access";
import type { TokenScope } from "@/lib/auth";

/**
 * The fixture cases and the one way to call `access.ts` for each — shared by
 * `access-matrix.test.ts` (org roles from the mocked `@/lib/orgs`) and
 * `access-matrix.orgs-db.test.ts` (org roles from real `org_members` rows),
 * so the corpus is replayed identically against both role sources.
 */

type Surface = "project" | "environment" | "var";
type Target = { projectId?: string; environmentId?: string; envVarId?: string };
type ScopeInput = { projectId: string | null; capability: "read" | "write" } | null;
export interface FixtureCase {
  name: string;
  dimension: string;
  surface: Surface;
  caller: { userId: string; orgId: string; isOrgAdmin: boolean };
  target: Target;
  requiredRole: string;
  scope: ScopeInput;
  expect: { outcome: "allow"; role: string } | { outcome: "deny" };
}

export const cases = fixture.cases as FixtureCase[];

function resolveScope(world: FixtureWorld, scope: ScopeInput): TokenScope | undefined {
  if (!scope) return undefined;
  return {
    projectId: scope.projectId ? world.projectId.get(scope.projectId)! : null,
    capability: scope.capability,
  };
}

export async function callSurface(c: FixtureCase, world: FixtureWorld): Promise<{ role: Role } | undefined> {
  const scope = resolveScope(world, c.scope);
  const requiredRole = c.requiredRole as Role;
  switch (c.surface) {
    case "project":
      return getAccessibleProject(c.caller.userId, world.projectId.get(c.target.projectId!)!, requiredRole, scope);
    case "environment":
      return getAccessibleEnvironment(
        c.caller.userId,
        world.environmentId.get(c.target.environmentId!)!,
        requiredRole,
        scope,
      );
    case "var":
      return getAccessibleVar(c.caller.userId, world.envVarId.get(c.target.envVarId!)!, requiredRole, scope);
  }
}
