import { beforeAll, describe, expect, test } from "vitest";
import fixture from "./access-matrix.fixtures.json";
import { testDb, schema } from "@/test-support/db";
import { seedFixtureWorld, type FixtureWorld } from "@/test-support/seed-fixture";
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
  world = await seedFixtureWorld(testDb, fixture.entities);
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
