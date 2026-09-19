import { beforeAll, describe, expect, test } from "vitest";
import fixture from "./access-matrix.fixtures.json";
import { testDb, schema } from "@/test-support/db";
import { seedFixtureWorld, type FixtureEntities, type FixtureWorld } from "@/test-support/seed-fixture";
import { setOrgRole, setOrgAdminList, setMyOrgs } from "@/test-support/mock-orgs";
import {
  listAccessibleProjects,
  listAccessibleProjectsWithEnvs,
  listAccessibleProjectsWithEnvsAcrossOrgs,
  listAccessibleUserIds,
} from "./access";

/**
 * List-shaped surfaces of access.ts. Not part of the JSON golden corpus
 * (see access-matrix.fixtures.json's header comment / the ticket's ADR-008
 * rationale) since their assertions are set-membership, not a single
 * allow/deny row — but they share the same seeded topology and Clerk stub
 * infra as access-matrix.test.ts.
 */

let world: FixtureWorld;

beforeAll(async () => {
  world = await seedFixtureWorld(testDb, fixture.entities as FixtureEntities);
});

describe("listAccessibleProjects", () => {
  test("org admin sees every project in the org, with no access_grants row required", async () => {
    setOrgRole("user-dave", "org-1", "admin");
    const projects = await listAccessibleProjects("user-dave", "org-1");
    expect(projects.map((p) => p.id).sort()).toEqual([world.projectId.get("proj-a"), world.projectId.get("proj-b")].sort());
  });

  test("a grant holder sees only the project they have a grant on", async () => {
    setOrgRole("user-alice", "org-1", "member");
    const projects = await listAccessibleProjects("user-alice", "org-1");
    expect(projects.map((p) => p.id)).toEqual([world.projectId.get("proj-a")]);
  });

  test("a caller with no grants and no admin role sees nothing", async () => {
    setOrgRole("user-nobody", "org-1", "member");
    const projects = await listAccessibleProjects("user-nobody", "org-1");
    expect(projects).toEqual([]);
  });
});

describe("listAccessibleProjectsWithEnvs", () => {
  test("returns one row per (project, environment) pair the caller can see", async () => {
    setOrgRole("user-alice", "org-1", "member");
    const rows = await listAccessibleProjectsWithEnvs("user-alice", "org-1");
    expect(rows.every((r) => r.id === world.projectId.get("proj-a"))).toBe(true);
    expect(rows.map((r) => r.envName).sort()).toEqual(["dev", "prod"]);
  });

  test("a project with no environments still appears once, with a null envName", async () => {
    setOrgRole("user-dave", "org-1", "admin");
    const rows = await listAccessibleProjectsWithEnvs("user-dave", "org-1");
    const projBRows = rows.filter((r) => r.id === world.projectId.get("proj-b"));
    expect(projBRows).toEqual([expect.objectContaining({ envName: null })]);
  });
});

describe("listAccessibleProjectsWithEnvsAcrossOrgs", () => {
  test("merges accessible projects across every org the caller belongs to", async () => {
    // A second org, seeded directly (not via the shared JSON corpus, which
    // stays focused on the single-org authorization decision matrix) — orgId
    // is a plain, unmapped text column, so a second literal org id needs no
    // extra plumbing.
    const [orgTwoProject] = await testDb
      .insert(schema.projects)
      .values({ orgId: "org-2", name: "Project C", userId: "seed" })
      .returning({ id: schema.projects.id });
    await testDb.insert(schema.accessGrants).values({
      orgId: "org-2",
      projectId: orgTwoProject.id,
      subjectType: "user",
      subjectId: "user-alice",
      role: "viewer",
    });

    setOrgRole("user-alice", "org-1", "member");
    setOrgRole("user-alice", "org-2", "member");
    setMyOrgs("user-alice", [
      { id: "org-1", name: "Org 1", role: "member" },
      { id: "org-2", name: "Org 2", role: "member" },
    ]);

    const rows = await listAccessibleProjectsWithEnvsAcrossOrgs("user-alice");

    expect(new Set(rows.map((r) => r.orgId))).toEqual(new Set(["org-1", "org-2"]));
    expect(rows.some((r) => r.id === orgTwoProject.id && r.orgName === "Org 2")).toBe(true);
    expect(rows.some((r) => r.id === world.projectId.get("proj-a"))).toBe(true);
  });
});

/**
 * RM-7 folded the dashboard's per-org loop into a single query. Its gotcha:
 * "this is the highest-risk query in the product — a dropped scoping predicate
 * here leaks another org's projects." These cases exist to fail loudly if that
 * ever happens, so they deliberately mix every membership shape at once and
 * assert on the exact project set, not just that the expected ones are present.
 */
describe("cross-org visibility is scoped to the caller's own memberships", () => {
  const caller = "user-mixed";

  /** Four orgs, one of each shape the single query has to tell apart. */
  async function seedMixedWorld() {
    const suffix = crypto.randomUUID().slice(0, 8);
    const org = {
      admin: `mix-admin-${suffix}`,
      granted: `mix-granted-${suffix}`,
      ungranted: `mix-ungranted-${suffix}`,
      foreign: `mix-foreign-${suffix}`,
    };

    const project = async (orgId: string, name: string) => {
      const [row] = await testDb
        .insert(schema.projects)
        .values({ orgId, name: `${name}-${suffix}`, userId: "seed" })
        .returning({ id: schema.projects.id });
      return row!.id;
    };

    const ids = {
      // Org admin: both projects visible with no grant row at all.
      adminA: await project(org.admin, "admin-a"),
      adminB: await project(org.admin, "admin-b"),
      // Plain member: only the granted project is visible.
      grantedYes: await project(org.granted, "granted-yes"),
      grantedNo: await project(org.granted, "granted-no"),
      // Member of the org, but holding no grant anywhere in it.
      ungranted: await project(org.ungranted, "ungranted"),
      // An org the caller is not a member of — and to make it a real trap, a
      // grant row naming this very caller. Membership is what must exclude it.
      foreign: await project(org.foreign, "foreign"),
    };

    await testDb.insert(schema.accessGrants).values([
      { orgId: org.granted, projectId: ids.grantedYes, subjectType: "user", subjectId: caller, role: "viewer" },
      { orgId: org.foreign, projectId: ids.foreign, subjectType: "user", subjectId: caller, role: "admin" },
    ]);

    setOrgRole(caller, org.admin, "admin");
    setOrgRole(caller, org.granted, "member");
    setOrgRole(caller, org.ungranted, "member");
    setMyOrgs(caller, [
      { id: org.admin, name: "Admin Org", role: "admin" },
      { id: org.granted, name: "Granted Org", role: "member" },
      { id: org.ungranted, name: "Ungranted Org", role: "member" },
    ]);

    return { org, ids };
  }

  test("admin orgs, granted projects, and nothing else", async () => {
    const { ids } = await seedMixedWorld();
    const rows = await listAccessibleProjectsWithEnvsAcrossOrgs(caller);
    const seen = new Set(rows.map((r) => r.id));

    // Admin in that org: every project, no grant needed.
    expect(seen.has(ids.adminA)).toBe(true);
    expect(seen.has(ids.adminB)).toBe(true);
    // Member with a grant: exactly the granted one.
    expect(seen.has(ids.grantedYes)).toBe(true);
    expect(seen.has(ids.grantedNo)).toBe(false);
    // Member with no grant anywhere in the org.
    expect(seen.has(ids.ungranted)).toBe(false);
    // The leak case: a grant naming this caller, in an org they don't belong to.
    expect(seen.has(ids.foreign), "a project from a non-member org must never appear").toBe(false);
  });

  test("a caller who is admin everywhere needs no grant rows at all", async () => {
    // The mirror of the mixed case: `grantOrgIds` is empty, so the query is
    // built from the admin branch alone. Worth its own case because an
    // all-admin caller is the common shape for a solo account — every org
    // they are in is one they created.
    const suffix = crypto.randomUUID().slice(0, 8);
    const orgA = `all-admin-a-${suffix}`;
    const orgB = `all-admin-b-${suffix}`;
    const owner = `user-allamin-${suffix}`;

    const made: string[] = [];
    for (const [orgId, name] of [[orgA, "a"], [orgB, "b"]] as const) {
      const [row] = await testDb
        .insert(schema.projects)
        .values({ orgId, name: `${name}-${suffix}`, userId: "seed" })
        .returning({ id: schema.projects.id });
      made.push(row!.id);
    }

    setOrgRole(owner, orgA, "admin");
    setOrgRole(owner, orgB, "admin");
    setMyOrgs(owner, [
      { id: orgA, name: "A", role: "admin" },
      { id: orgB, name: "B", role: "admin" },
    ]);

    const rows = await listAccessibleProjectsWithEnvsAcrossOrgs(owner);
    const seen = new Set(rows.map((r) => r.id));
    for (const id of made) expect(seen.has(id)).toBe(true);
    // And still nothing from the fixture corpus' orgs, which this user is not in.
    expect(seen.has(world.projectId.get("proj-a")!)).toBe(false);
  });

  test("a caller who belongs to no orgs sees nothing at all", async () => {
    // The `or()`-of-nothing case: if the visibility predicate were ever built
    // empty, the query would have no WHERE clause and return every project in
    // the database.
    setMyOrgs("user-orgless", []);
    const rows = await listAccessibleProjectsWithEnvsAcrossOrgs("user-orgless");
    expect(rows).toEqual([]);
  });

  test("a group grant is honoured, and only for actual group members", async () => {
    const suffix = crypto.randomUUID().slice(0, 8);
    const orgId = `mix-group-${suffix}`;
    const [proj] = await testDb
      .insert(schema.projects)
      .values({ orgId, name: `group-proj-${suffix}`, userId: "seed" })
      .returning({ id: schema.projects.id });
    const [group] = await testDb
      .insert(schema.groups)
      .values({ orgId, name: `group-${suffix}` })
      .returning({ id: schema.groups.id });
    await testDb.insert(schema.accessGrants).values({
      orgId,
      projectId: proj!.id,
      subjectType: "group",
      subjectId: group!.id,
      role: "viewer",
    });

    const member = `user-ingroup-${suffix}`;
    const outsider = `user-outgroup-${suffix}`;
    await testDb.insert(schema.groupMembers).values({ groupId: group!.id, userId: member });
    for (const u of [member, outsider]) {
      setOrgRole(u, orgId, "member");
      setMyOrgs(u, [{ id: orgId, name: "Group Org", role: "member" }]);
    }

    const memberRows = await listAccessibleProjectsWithEnvsAcrossOrgs(member);
    expect(memberRows.map((r) => r.id)).toContain(proj!.id);

    const outsiderRows = await listAccessibleProjectsWithEnvsAcrossOrgs(outsider);
    expect(outsiderRows.map((r) => r.id)).not.toContain(proj!.id);
  });
});

describe("listAccessibleUserIds", () => {
  test("includes org admins, direct grant holders, and group-derived members — even though org admins have no access_grants row", async () => {
    setOrgAdminList("org-1", ["user-dave"]);
    const userIds = await listAccessibleUserIds("org-1", world.projectId.get("proj-a")!);
    expect(new Set(userIds)).toEqual(new Set(["user-dave", "user-alice", "user-bob", "user-carol", "user-erin"]));
  });

  test("a project with no org admins configured returns only its grant holders", async () => {
    setOrgAdminList("org-1", []);
    const userIds = await listAccessibleUserIds("org-1", world.projectId.get("proj-a")!);
    expect(new Set(userIds)).toEqual(new Set(["user-alice", "user-bob", "user-carol", "user-erin"]));
  });
});
