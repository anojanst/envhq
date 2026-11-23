import { beforeEach, describe, expect, test } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import { testDb } from "@/test-support/db";
import { accessGrants, apiTokens, groupMembers, groups, orgMembers, orgs, projectKeys, projects } from "@/db/schema";
import { generateToken, hashToken } from "@/lib/crypto";
import { call, expectStatus } from "@/test-support/contract/helpers";
import { setFakeUser } from "@/test-support/mock-clerk.setup";
import { getOrgRole } from "./orgs";
import { GET as listMyOrgs, POST as createTeam } from "@/app/api/orgs/route";
import { PATCH as renameOrg, DELETE as deleteOrg } from "@/app/api/orgs/[id]/route";
import { GET as listTeamMembers } from "@/app/api/orgs/[id]/members/route";
import { PATCH as setRole, DELETE as removeMember } from "@/app/api/orgs/[id]/members/[userId]/route";
import { GET as listInvites, POST as createInvite } from "@/app/api/orgs/[id]/invites/route";
import { DELETE as revokeInvite } from "@/app/api/orgs/[id]/invites/[inviteId]/route";
import { POST as acceptInvite } from "@/app/api/invites/accept/route";

/**
 * Self-hosting phase 4: EnvHQ's own team management, end to end through the
 * real route handlers against real `orgs`/`org_members` rows. Every response
 * is checked against openapi.yaml by `call()`.
 */

async function tokenFor(userId: string, over: { capability?: "read" | "write"; projectId?: string } = {}) {
  const token = generateToken();
  await testDb.insert(apiTokens).values({
    userId,
    name: `t-${crypto.randomUUID()}`,
    tokenHash: hashToken(token),
    kind: "pat",
    capability: over.capability ?? "write",
    projectId: over.projectId ?? null,
  });
  return token;
}

async function newTeam(token: string, name = "Platform") {
  const { res, body } = await call(createTeam, "/api/orgs", {}, { method: "POST", token, json: { name } });
  expectStatus(res, 201);
  return (body as { org: { id: string } }).org.id;
}

async function invite(token: string, orgId: string, role: "admin" | "member" = "member") {
  const { res, body } = await call(createInvite, `/api/orgs/${orgId}/invites`, { id: orgId }, {
    method: "POST",
    token,
    json: { role },
  });
  expectStatus(res, 201);
  const url = (body as { url: string }).url;
  return url.slice(url.lastIndexOf("/") + 1);
}

async function join(token: string, inviteToken: string) {
  return call(acceptInvite, "/api/invites/accept", {}, { method: "POST", token, json: { token: inviteToken } });
}

let ada: string;
let bob: string;
let eve: string;

beforeEach(async () => {
  await testDb.execute(
    sql`TRUNCATE TABLE org_invites, org_members, orgs, api_tokens, access_grants, group_members, groups, project_keys, projects CASCADE`,
  );
  for (const [id, firstName] of [["user_ada", "Ada"], ["user_bob", "Bob"], ["user_eve", "Eve"]]) {
    setFakeUser({ id: id!, firstName, email: `${firstName!.toLowerCase()}@example.test` });
  }
  ada = await tokenFor("user_ada");
  bob = await tokenFor("user_bob");
  eve = await tokenFor("user_eve");
});

describe("creating and listing teams", () => {
  test("the creator is the team's only admin, and it shows in their org list", async () => {
    const orgId = await newTeam(ada);
    expect(await getOrgRole("user_ada", orgId)).toBe("admin");
    const { body } = await call(listMyOrgs, "/api/orgs", {}, { method: "GET", token: ada });
    expect((body as { orgs: { id: string; role: string }[] }).orgs).toContainEqual({ id: orgId, name: "Platform", role: "admin" });
  });

  test("a blank name is refused", async () => {
    const { res } = await call(createTeam, "/api/orgs", {}, { method: "POST", token: ada, json: { name: "  " } });
    expectStatus(res, 400);
  });

  test("a project-scoped or read-only token can't create a team", async () => {
    const readOnly = await tokenFor("user_ada", { capability: "read" });
    const { res } = await call(createTeam, "/api/orgs", {}, { method: "POST", token: readOnly, json: { name: "X" } });
    expectStatus(res, 403);
  });
});

describe("invite links", () => {
  test("an invite adds the person with the invite's role, once", async () => {
    const orgId = await newTeam(ada);
    const link = await invite(ada, orgId, "member");

    const first = await join(bob, link);
    expectStatus(first.res, 200);
    expect(await getOrgRole("user_bob", orgId)).toBe("member");

    const second = await join(eve, link);
    expectStatus(second.res, 404); // single use
    expect(await getOrgRole("user_eve", orgId)).toBeNull();
  });

  test("an expired invite is refused", async () => {
    const orgId = await newTeam(ada);
    const link = await invite(ada, orgId);
    await testDb.execute(sql`UPDATE org_invites SET expires_at = now() - interval '1 minute'`);
    expectStatus((await join(bob, link)).res, 404);
  });

  test("a revoked invite is refused, and pending invites never expose their token", async () => {
    const orgId = await newTeam(ada);
    const link = await invite(ada, orgId);
    const { body } = await call(listInvites, `/api/orgs/${orgId}/invites`, { id: orgId }, { method: "GET", token: ada });
    const pending = (body as { invites: { id: string }[] }).invites;
    expect(pending).toHaveLength(1);
    expect(JSON.stringify(body)).not.toContain(link);

    const { res } = await call(revokeInvite, `/api/orgs/${orgId}/invites/${pending[0]!.id}`, { id: orgId, inviteId: pending[0]!.id }, {
      method: "DELETE",
      token: ada,
    });
    expectStatus(res, 200);
    expectStatus((await join(bob, link)).res, 404);
  });

  test("joining never demotes an existing admin", async () => {
    const orgId = await newTeam(ada);
    const link = await invite(ada, orgId, "member");
    await join(ada, link);
    expect(await getOrgRole("user_ada", orgId)).toBe("admin");
  });

  test("only admins invite; a personal workspace can't invite at all", async () => {
    const orgId = await newTeam(ada);
    await join(bob, await invite(ada, orgId));
    const asMember = await call(createInvite, `/api/orgs/${orgId}/invites`, { id: orgId }, { method: "POST", token: bob, json: {} });
    expectStatus(asMember.res, 403);

    await testDb.insert(orgs).values({ id: "org_personal", name: "Ada", personal: true });
    await testDb.insert(orgMembers).values({ orgId: "org_personal", userId: "user_ada", role: "admin" });
    const personal = await call(createInvite, "/api/orgs/org_personal/invites", { id: "org_personal" }, {
      method: "POST",
      token: ada,
      json: {},
    });
    expectStatus(personal.res, 409);
  });
});

describe("members and roles", () => {
  test("any member can list members with roles and names; a stranger gets 404", async () => {
    const orgId = await newTeam(ada);
    await join(bob, await invite(ada, orgId));

    const { res, body } = await call(listTeamMembers, `/api/orgs/${orgId}/members`, { id: orgId }, { method: "GET", token: bob });
    expectStatus(res, 200);
    expect((body as { members: unknown[] }).members).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ userId: "user_ada", name: "Ada", role: "admin" }),
        expect.objectContaining({ userId: "user_bob", name: "Bob", role: "member" }),
      ]),
    );

    const stranger = await call(listTeamMembers, `/api/orgs/${orgId}/members`, { id: orgId }, { method: "GET", token: eve });
    expectStatus(stranger.res, 404);
  });

  test("an admin can promote; the last admin can't demote themselves or leave", async () => {
    const orgId = await newTeam(ada);
    await join(bob, await invite(ada, orgId));

    const demoteSelf = await call(setRole, `/api/orgs/${orgId}/members/user_ada`, { id: orgId, userId: "user_ada" }, {
      method: "PATCH",
      token: ada,
      json: { role: "member" },
    });
    expectStatus(demoteSelf.res, 409);
    const leave = await call(removeMember, `/api/orgs/${orgId}/members/user_ada`, { id: orgId, userId: "user_ada" }, {
      method: "DELETE",
      token: ada,
    });
    expectStatus(leave.res, 409);

    const promote = await call(setRole, `/api/orgs/${orgId}/members/user_bob`, { id: orgId, userId: "user_bob" }, {
      method: "PATCH",
      token: ada,
      json: { role: "admin" },
    });
    expectStatus(promote.res, 200);
    expect(await getOrgRole("user_bob", orgId)).toBe("admin");
  });

  test("a member can leave, but can't remove anyone else", async () => {
    const orgId = await newTeam(ada);
    await join(bob, await invite(ada, orgId));
    await join(eve, await invite(ada, orgId));

    const kick = await call(removeMember, `/api/orgs/${orgId}/members/user_eve`, { id: orgId, userId: "user_eve" }, {
      method: "DELETE",
      token: bob,
    });
    expectStatus(kick.res, 403);

    const leave = await call(removeMember, `/api/orgs/${orgId}/members/user_bob`, { id: orgId, userId: "user_bob" }, {
      method: "DELETE",
      token: bob,
    });
    expectStatus(leave.res, 200);
    expect(await getOrgRole("user_bob", orgId)).toBeNull();
  });

  test("removing a member takes their grants, group memberships and key wraps in the team with them", async () => {
    const orgId = await newTeam(ada);
    await join(bob, await invite(ada, orgId));
    const [project] = await testDb.insert(projects).values({ orgId, userId: "user_ada", name: "api" }).returning();
    const [group] = await testDb.insert(groups).values({ orgId, name: "devs" }).returning();
    await testDb.insert(groupMembers).values({ groupId: group!.id, userId: "user_bob" });
    await testDb.insert(accessGrants).values({ orgId, projectId: project!.id, subjectType: "user", subjectId: "user_bob", role: "editor" });
    await testDb.insert(projectKeys).values({
      projectId: project!.id,
      subjectUserId: "user_bob",
      wrappedByUserId: "user_ada",
      wrappedDek: "sealed",
      keyVersion: 1,
    });

    const { res } = await call(removeMember, `/api/orgs/${orgId}/members/user_bob`, { id: orgId, userId: "user_bob" }, {
      method: "DELETE",
      token: ada,
    });
    expectStatus(res, 200);

    expect(await testDb.select().from(accessGrants).where(eq(accessGrants.subjectId, "user_bob"))).toEqual([]);
    expect(await testDb.select().from(groupMembers).where(eq(groupMembers.userId, "user_bob"))).toEqual([]);
    expect(
      await testDb
        .select()
        .from(projectKeys)
        .where(and(eq(projectKeys.projectId, project!.id), eq(projectKeys.subjectUserId, "user_bob"))),
    ).toEqual([]);
    const [after] = await testDb.select().from(projects).where(eq(projects.id, project!.id));
    expect(after?.keyRotationPending).toBe(true);
  });
});

describe("renaming and deleting", () => {
  test("an admin can rename; a member can't", async () => {
    const orgId = await newTeam(ada);
    await join(bob, await invite(ada, orgId));
    const asMember = await call(renameOrg, `/api/orgs/${orgId}`, { id: orgId }, { method: "PATCH", token: bob, json: { name: "X" } });
    expectStatus(asMember.res, 403);
    const asAdmin = await call(renameOrg, `/api/orgs/${orgId}`, { id: orgId }, { method: "PATCH", token: ada, json: { name: "Core" } });
    expectStatus(asAdmin.res, 200);
    const [org] = await testDb.select().from(orgs).where(eq(orgs.id, orgId));
    expect(org?.name).toBe("Core");
  });

  test("a team that owns projects can't be deleted; an empty one can", async () => {
    const orgId = await newTeam(ada);
    const [project] = await testDb.insert(projects).values({ orgId, userId: "user_ada", name: "api" }).returning();
    const blocked = await call(deleteOrg, `/api/orgs/${orgId}`, { id: orgId }, { method: "DELETE", token: ada });
    expectStatus(blocked.res, 409);

    await testDb.delete(projects).where(eq(projects.id, project!.id));
    const ok = await call(deleteOrg, `/api/orgs/${orgId}`, { id: orgId }, { method: "DELETE", token: ada });
    expectStatus(ok.res, 200);
    expect(await getOrgRole("user_ada", orgId)).toBeNull();
  });
});
