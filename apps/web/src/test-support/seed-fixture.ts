import { sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "@/db/schema";

export interface FixtureProject {
  id: string;
  orgId: string;
  name: string;
}
export interface FixtureEnvironment {
  id: string;
  projectId: string;
  name: string;
}
export interface FixtureEnvVar {
  id: string;
  environmentId: string;
  key: string;
}
export interface FixtureGroup {
  id: string;
  orgId: string;
  name: string;
}
export interface FixtureGroupMember {
  groupId: string;
  userId: string;
}
/**
 * `subjectId` is the literal caller userId for `subjectType: "user"` grants,
 * or the fixture's *logical* group id (e.g. `"group-eng"`) for
 * `subjectType: "group"` grants — `seedFixtureWorld` resolves the latter to
 * the group's real generated id so it survives `access.ts`'s
 * `subject_id = group_members.group_id::text` cast.
 */
export interface FixtureAccessGrant {
  id: string;
  projectId: string;
  subjectType: "user" | "group";
  subjectId: string;
  role: string;
  envScope: Record<string, string> | string | null;
}

export interface FixtureEntities {
  projects: FixtureProject[];
  environments: FixtureEnvironment[];
  envVars: FixtureEnvVar[];
  groups: FixtureGroup[];
  groupMembers: FixtureGroupMember[];
  accessGrants: FixtureAccessGrant[];
}

export interface FixtureWorld {
  projectId: Map<string, string>;
  environmentId: Map<string, string>;
  envVarId: Map<string, string>;
  groupId: Map<string, string>;
}

type Db = NodePgDatabase<typeof schema>;

function must<K, V>(map: Map<K, V>, key: K): V {
  const value = map.get(key);
  if (value === undefined) throw new Error(`seed-fixture: no id mapped for logical id ${String(key)}`);
  return value;
}

/**
 * Truncates and re-seeds every table `access.ts` reads, from a fixture's
 * `entities` block. Every function under test is a pure read, so one seed
 * per test file (rather than per case) is correct — see
 * apps/web/vitest.config.mts / the plan for why no per-test isolation is
 * needed.
 */
export async function seedFixtureWorld(db: Db, entities: FixtureEntities): Promise<FixtureWorld> {
  await db.execute(
    sql`TRUNCATE TABLE access_grants, group_members, env_vars, environments, groups, projects RESTART IDENTITY CASCADE`,
  );

  const projectId = new Map<string, string>();
  const environmentId = new Map<string, string>();
  const envVarId = new Map<string, string>();
  const groupId = new Map<string, string>();

  for (const p of entities.projects) {
    const [row] = await db.insert(schema.projects).values({ orgId: p.orgId, name: p.name, userId: "seed" }).returning({
      id: schema.projects.id,
    });
    projectId.set(p.id, row.id);
  }

  for (const e of entities.environments) {
    const [row] = await db
      .insert(schema.environments)
      .values({ projectId: must(projectId, e.projectId), name: e.name })
      .returning({ id: schema.environments.id });
    environmentId.set(e.id, row.id);
  }

  for (const v of entities.envVars) {
    const [row] = await db
      .insert(schema.envVars)
      .values({
        environmentId: must(environmentId, v.environmentId),
        key: v.key,
        valueCiphertext: "stub-ciphertext",
        iv: "stub-iv",
      })
      .returning({ id: schema.envVars.id });
    envVarId.set(v.id, row.id);
  }

  for (const g of entities.groups) {
    const [row] = await db.insert(schema.groups).values({ orgId: g.orgId, name: g.name }).returning({ id: schema.groups.id });
    groupId.set(g.id, row.id);
  }

  for (const m of entities.groupMembers) {
    await db.insert(schema.groupMembers).values({ groupId: must(groupId, m.groupId), userId: m.userId });
  }

  for (const grant of entities.accessGrants) {
    const subjectId = grant.subjectType === "group" ? must(groupId, grant.subjectId) : grant.subjectId;
    const envScope =
      grant.envScope === null
        ? null
        : typeof grant.envScope === "string"
          ? grant.envScope
          : JSON.stringify(grant.envScope);
    await db.insert(schema.accessGrants).values({
      orgId: entities.projects.find((p) => p.id === grant.projectId)!.orgId,
      projectId: must(projectId, grant.projectId),
      subjectType: grant.subjectType,
      subjectId,
      role: grant.role,
      envScope,
    });
  }

  return { projectId, environmentId, envVarId, groupId };
}
