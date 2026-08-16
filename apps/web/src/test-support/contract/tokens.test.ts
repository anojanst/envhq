import { beforeAll, describe, expect, test } from "vitest";
import { grantOrgRole, resetContractWorld, createProject, createApiToken } from "@/test-support/contract-seed";
import { call, expectStatus } from "./helpers";

import { DELETE as deleteToken } from "@/app/api/v1/tokens/[id]/route";
import { GET as listTokens, POST as createToken } from "@/app/api/v1/tokens/route";

beforeAll(resetContractWorld);

async function setup() {
  const orgId = `org-${crypto.randomUUID()}`;
  const userId = `user-${crypto.randomUUID()}`;
  grantOrgRole(userId, orgId, "admin");
  const project = await createProject(orgId);
  const { token } = await createApiToken(userId);
  const { token: scopedToken } = await createApiToken(userId, { projectId: project.id });
  return { orgId, userId, project, token, scopedToken };
}

describe("GET/POST /api/v1/tokens", () => {
  test("GET 200 lists the caller's tokens without the secret", async () => {
    const { token } = await setup();
    const path = "/api/v1/tokens";
    const { res, body } = await call(listTokens, path, {}, { method: "GET", token });
    expectStatus(res, 200);
    const rows = (body as { tokens: Record<string, unknown>[] }).tokens;
    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(rows.every((r) => !("tokenHash" in r) && !("token" in r))).toBe(true);
  });

  test("POST 201 creates a token and returns the plaintext secret exactly once", async () => {
    const { token } = await setup();
    const path = "/api/v1/tokens";
    const { res, body } = await call(createToken, path, {}, { method: "POST", token, json: { name: "ci" } });
    expectStatus(res, 201);
    expect((body as { token: string }).token).toMatch(/^envhq_/);
  });

  test("POST 403 for a project-scoped token trying to create another token", async () => {
    const { scopedToken } = await setup();
    const path = "/api/v1/tokens";
    const { res } = await call(createToken, path, {}, { method: "POST", token: scopedToken, json: { name: "escalation attempt" } });
    expectStatus(res, 403);
  });

  test("POST 400 for an unknown projectId", async () => {
    const { token } = await setup();
    const path = "/api/v1/tokens";
    const { res } = await call(createToken, path, {}, { method: "POST", token, json: { name: "ci", projectId: crypto.randomUUID() } });
    expectStatus(res, 400);
  });
});

describe("DELETE /api/v1/tokens/{id}", () => {
  test("200 revokes the caller's own token", async () => {
    const { userId, token } = await setup();
    const { row } = await createApiToken(userId, { name: "to-delete" });
    const path = `/api/v1/tokens/${row.id}`;
    const { res, body } = await call(deleteToken, path, { id: row.id }, { method: "DELETE", token });
    expectStatus(res, 200);
    expect(body).toEqual({ ok: true });
  });

  test("403 for a project-scoped token trying to manage tokens", async () => {
    const { scopedToken } = await setup();
    const path = `/api/v1/tokens/${crypto.randomUUID()}`;
    const { res } = await call(deleteToken, path, { id: crypto.randomUUID() }, { method: "DELETE", token: scopedToken });
    expectStatus(res, 403);
  });

  test("404 for a token owned by someone else", async () => {
    const { token } = await setup();
    const otherUserId = `user-${crypto.randomUUID()}`;
    const { row } = await createApiToken(otherUserId);
    const path = `/api/v1/tokens/${row.id}`;
    const { res } = await call(deleteToken, path, { id: row.id }, { method: "DELETE", token });
    expectStatus(res, 404);
  });
});
