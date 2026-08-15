import { beforeAll, describe, expect, test } from "vitest";
import { resetContractWorld, createGroup as seedGroup, addGroupMember as seedGroupMember, createApiToken, grantOrgRole } from "@/test-support/contract-seed";
import { call, expectStatus } from "./helpers";

import { DELETE as removeMember } from "@/app/api/groups/[id]/members/[userId]/route";
import { GET as listMembers, POST as addMember } from "@/app/api/groups/[id]/members/route";
import { DELETE as deleteGroup } from "@/app/api/groups/[id]/route";
import { GET as listGroups, POST as createGroup } from "@/app/api/groups/route";

beforeAll(resetContractWorld);

async function setup() {
  const orgId = `org-${crypto.randomUUID()}`;
  const adminUserId = `user-${crypto.randomUUID()}`;
  const memberUserId = `user-${crypto.randomUUID()}`;
  grantOrgRole(adminUserId, orgId, "admin");
  grantOrgRole(memberUserId, orgId, "member");
  const group = await seedGroup(orgId);
  const { token: adminToken } = await createApiToken(adminUserId);
  const { token: memberToken } = await createApiToken(memberUserId);
  return { orgId, adminUserId, memberUserId, group, adminToken, memberToken };
}

describe("GET/POST /api/groups", () => {
  test("GET 200 lists an org's groups", async () => {
    const { orgId, adminToken } = await setup();
    const path = `/api/groups?orgId=${orgId}`;
    const { res, body } = await call(listGroups, path, {}, { method: "GET", token: adminToken });
    expectStatus(res, 200);
    expect((body as { groups: unknown[] }).groups.length).toBeGreaterThanOrEqual(1);
  });

  test("GET 403 (not 404) for a non-admin — no id in the URL to hide", async () => {
    const { orgId, memberToken } = await setup();
    const path = `/api/groups?orgId=${orgId}`;
    const { res } = await call(listGroups, path, {}, { method: "GET", token: memberToken });
    expectStatus(res, 403);
  });

  test("POST 201 creates a group", async () => {
    const { orgId, adminToken } = await setup();
    const path = "/api/groups";
    const { res, body } = await call(createGroup, path, {}, { method: "POST", token: adminToken, json: { orgId, name: `New ${crypto.randomUUID()}` } });
    expectStatus(res, 201);
    expect((body as { group: { id: string } }).group.id).toBeDefined();
  });

  test("POST 409 on a duplicate name within the org", async () => {
    const { orgId, group, adminToken } = await setup();
    const path = "/api/groups";
    const { res } = await call(createGroup, path, {}, { method: "POST", token: adminToken, json: { orgId, name: group.name } });
    expectStatus(res, 409);
  });
});

describe("GET/POST /api/groups/{id}/members, DELETE /api/groups/{id}/members/{userId}", () => {
  test("GET 200 lists members", async () => {
    const { group, memberUserId, adminToken } = await setup();
    await seedGroupMember(group.id, memberUserId);
    const path = `/api/groups/${group.id}/members`;
    const { res, body } = await call(listMembers, path, { id: group.id }, { method: "GET", token: adminToken });
    expectStatus(res, 200);
    expect((body as { members: unknown[] }).members).toHaveLength(1);
  });

  test("GET 404 (not 403) for a non-admin on a real group id", async () => {
    const { group, memberToken } = await setup();
    const path = `/api/groups/${group.id}/members`;
    const { res } = await call(listMembers, path, { id: group.id }, { method: "GET", token: memberToken });
    expectStatus(res, 404);
  });

  test("POST 201 adds a member and returns the full updated list", async () => {
    const { orgId, group, adminToken } = await setup();
    const newMemberId = `user-${crypto.randomUUID()}`;
    grantOrgRole(newMemberId, orgId, "member");
    const path = `/api/groups/${group.id}/members`;
    const { res, body } = await call(addMember, path, { id: group.id }, { method: "POST", token: adminToken, json: { userId: newMemberId } });
    expectStatus(res, 201);
    expect((body as { members: unknown[] }).members).toHaveLength(1);
  });

  test("DELETE 200 removes a member", async () => {
    const { group, memberUserId, adminToken } = await setup();
    await seedGroupMember(group.id, memberUserId);
    const path = `/api/groups/${group.id}/members/${memberUserId}`;
    const { res, body } = await call(removeMember, path, { id: group.id, userId: memberUserId }, { method: "DELETE", token: adminToken });
    expectStatus(res, 200);
    expect(body).toEqual({ ok: true });
  });

  test("DELETE 404 for a userId that was never a member", async () => {
    const { group, adminToken } = await setup();
    const path = `/api/groups/${group.id}/members/${crypto.randomUUID()}`;
    const { res } = await call(removeMember, path, { id: group.id, userId: crypto.randomUUID() }, { method: "DELETE", token: adminToken });
    expectStatus(res, 404);
  });
});

describe("DELETE /api/groups/{id}", () => {
  test("200 deletes the group", async () => {
    const { group, adminToken } = await setup();
    const path = `/api/groups/${group.id}`;
    const { res, body } = await call(deleteGroup, path, { id: group.id }, { method: "DELETE", token: adminToken });
    expectStatus(res, 200);
    expect(body).toEqual({ ok: true });
  });
});
