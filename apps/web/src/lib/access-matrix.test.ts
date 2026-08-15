import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import fixture from "./access-matrix.fixtures.json";
import { testDb } from "@/test-support/db";
import { seedFixtureWorld, type FixtureWorld } from "@/test-support/seed-fixture";
import { setOrgRole } from "@/test-support/mock-orgs";
import { getAccessibleProject, getAccessibleEnvironment, getAccessibleVar, type Role } from "./access";
import type { TokenScope } from "./auth";

/**
 * Table-driven runner for the language-neutral corpus in
 * `access-matrix.fixtures.json` — the golden corpus ADR-008 says a future Go
 * authorization implementation must also replay and agree with. Every case
 * seeds real Postgres rows once (see `seedFixtureWorld`) and calls the real
 * `access.ts` exports; nothing here should reimplement or approximate the
 * authorization logic under test.
 */

type Surface = "project" | "environment" | "var";
type Target = { projectId?: string; environmentId?: string; envVarId?: string };
type ScopeInput = { projectId: string | null; capability: "read" | "write" } | null;
interface FixtureCase {
  name: string;
  dimension: string;
  surface: Surface;
  caller: { userId: string; orgId: string; isOrgAdmin: boolean };
  target: Target;
  requiredRole: string;
  scope: ScopeInput;
  expect: { outcome: "allow"; role: string } | { outcome: "deny" };
}

const cases = fixture.cases as FixtureCase[];

function resolveScope(world: FixtureWorld, scope: ScopeInput): TokenScope | undefined {
  if (!scope) return undefined;
  return {
    projectId: scope.projectId ? world.projectId.get(scope.projectId)! : null,
    capability: scope.capability,
  };
}

async function callSurface(c: FixtureCase, world: FixtureWorld): Promise<{ role: Role } | undefined> {
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

let world: FixtureWorld;

beforeAll(async () => {
  world = await seedFixtureWorld(testDb, fixture.entities);
});

// The "malformed_env_scope" row deliberately exercises parseEnvScope's
// console.error path (see access.ts) — silenced here so CI output stays
// clean; the log itself is asserted directly in access.helpers.test.ts.
beforeAll(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterAll(() => {
  vi.restoreAllMocks();
});

describe.each(cases)("$dimension: $name", (c) => {
  test("matches the expected outcome", async () => {
    setOrgRole(c.caller.userId, c.caller.orgId, c.caller.isOrgAdmin ? "admin" : "member");

    const result = await callSurface(c, world);

    if (c.expect.outcome === "allow") {
      expect(result).toBeDefined();
      expect(result?.role).toBe(c.expect.role);
    } else {
      expect(result).toBeUndefined();
    }
  });
});

test("fixture covers every required dimension", () => {
  const required = ["in_scope", "cross_project", "org_admin", "env_cap", "privilege_escalation", "malformed_env_scope"];
  const present = new Set(cases.map((c) => c.dimension));
  for (const dimension of required) {
    expect(present, `missing dimension: ${dimension}`).toContain(dimension);
  }
});

test("a nonexistent resource and an existing resource with insufficient role are indistinguishable to the caller", async () => {
  setOrgRole("user-nobody", "org-nobody", null);
  setOrgRole("user-alice", "org-1", "member");

  const nonexistent = await getAccessibleProject("user-nobody", crypto.randomUUID(), "viewer");
  const insufficientRole = await getAccessibleProject("user-alice", world.projectId.get("proj-a")!, "admin");

  // access.ts deliberately returns `undefined` for both "doesn't exist" and
  // "insufficient role" so callers 404 either way — a 403 here would
  // confirm a project id is real. This must never be "fixed" apart.
  expect(nonexistent).toBeUndefined();
  expect(insufficientRole).toBeUndefined();
});
