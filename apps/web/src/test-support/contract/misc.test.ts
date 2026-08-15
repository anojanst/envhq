import crypto from "node:crypto";
import { beforeAll, describe, expect, test } from "vitest";
import { setMyOrgs } from "@/test-support/mock-orgs";
import { setFakeUser } from "@/test-support/mock-clerk.setup";
import {
  resetContractWorld,
  createProject,
  createEnvironment,
  createEnvVar,
  createApiToken,
  grantOrgRole,
} from "@/test-support/contract-seed";
import { call, expectStatus } from "./helpers";

import { POST as cliAuthorize } from "@/app/api/cli/authorize/route";
import { POST as cliToken } from "@/app/api/cli/token/route";
import { GET as getMe } from "@/app/api/me/route";
import { GET as listOrgMembers } from "@/app/api/orgs/members/route";
import { GET as listMyOrgs } from "@/app/api/orgs/route";
import { GET as getMyUserKeys, POST as createMyUserKeys } from "@/app/api/users/me/keys/route";
import { PATCH as updateVar, DELETE as deleteVar } from "@/app/api/vars/[id]/route";

beforeAll(resetContractWorld);

describe("GET /api/me", () => {
  test("200 returns the caller's id", async () => {
    const userId = `user-${crypto.randomUUID()}`;
    const { token } = await createApiToken(userId);
    const { res, body } = await call(getMe, "/api/me", {}, { method: "GET", token });
    expectStatus(res, 200);
    expect(body).toEqual({ userId });
  });
});

describe("CLI browser-login exchange", () => {
  test("authorize mints a code, then token exchanges it for a 7-day session", async () => {
    const userId = `user-${crypto.randomUUID()}`;
    const { token } = await createApiToken(userId);
    const verifier = `verifier-${crypto.randomUUID()}`;
    const codeChallenge = crypto.createHash("sha256").update(verifier).digest("base64url");

    const authorize = await call(cliAuthorize, "/api/cli/authorize", {}, {
      method: "POST",
      token,
      json: { state: "xyz", codeChallenge, port: 51000 },
    });
    expectStatus(authorize.res, 200);
    const { code } = authorize.body as { code: string };

    const exchange = await call(cliToken, "/api/cli/token", {}, { method: "POST", json: { code, verifier } });
    expectStatus(exchange.res, 200);
    const exchanged = exchange.body as { token: string; userId: string };
    expect(exchanged.userId).toBe(userId);
    expect(exchanged.token).toMatch(/^envhq_/);
  });

  test("token exchange requires no auth at all", async () => {
    const { res } = await call(cliToken, "/api/cli/token", {}, { method: "POST", json: { code: "bogus", verifier: "bogus" } });
    // No bearer token supplied, yet this must NOT 401 — it's the one
    // deliberately public route. A bad code/verifier pair 400s instead.
    expectStatus(res, 400);
  });

  test("token exchange collapses every failure into invalid_grant", async () => {
    const { res, body } = await call(cliToken, "/api/cli/token", {}, { method: "POST", json: { code: "unknown-code", verifier: "wrong" } });
    expectStatus(res, 400);
    expect(body).toEqual({ error: "invalid_grant" });
  });
});

describe("GET /api/orgs, GET /api/orgs/members", () => {
  test("orgs 200 lists the caller's memberships", async () => {
    const userId = `user-${crypto.randomUUID()}`;
    const orgId = `org-${crypto.randomUUID()}`;
    setMyOrgs(userId, [{ id: orgId, name: "Acme", role: "admin" }]);
    const { token } = await createApiToken(userId);
    const { res, body } = await call(listMyOrgs, "/api/orgs", {}, { method: "GET", token });
    expectStatus(res, 200);
    expect(body).toEqual({ orgs: [{ id: orgId, name: "Acme", role: "admin" }] });
  });

  test("orgs/members 200 for an org-admin, 403 for a non-admin", async () => {
    const orgId = `org-${crypto.randomUUID()}`;
    const adminId = `user-${crypto.randomUUID()}`;
    const memberId = `user-${crypto.randomUUID()}`;
    grantOrgRole(adminId, orgId, "admin");
    grantOrgRole(memberId, orgId, "member");
    setFakeUser({ id: memberId, firstName: "Mem", email: "mem@example.test" });
    const { token: adminToken } = await createApiToken(adminId);
    const { token: memberToken } = await createApiToken(memberId);

    const path = `/api/orgs/members?orgId=${orgId}`;
    const ok = await call(listOrgMembers, path, {}, { method: "GET", token: adminToken });
    expectStatus(ok.res, 200);
    expect((ok.body as { members: { userId: string }[] }).members.map((m) => m.userId)).toContain(memberId);

    const forbidden = await call(listOrgMembers, path, {}, { method: "GET", token: memberToken });
    expectStatus(forbidden.res, 403);
  });
});

describe("GET/POST /api/users/me/keys", () => {
  test("404 before onboarding, 201 to create, 200 after, 409 on a second attempt", async () => {
    const userId = `user-${crypto.randomUUID()}`;
    const { token } = await createApiToken(userId);
    const path = "/api/users/me/keys";

    const before = await call(getMyUserKeys, path, {}, { method: "GET", token });
    expectStatus(before.res, 404);

    const payload = {
      publicKey: "pub",
      kdfSalt: "salt",
      kdfT: 3,
      kdfM: 65536,
      kdfP: 4,
      wrappedPrivateKey: "wpk",
      wrappedPrivateKeyNonce: "wpkn",
      wrappedPrivateKeyByRecovery: "wpkr",
      wrappedPrivateKeyByRecoveryNonce: "wpkrn",
    };
    const created = await call(createMyUserKeys, path, {}, { method: "POST", token, json: payload });
    expectStatus(created.res, 201);

    const after = await call(getMyUserKeys, path, {}, { method: "GET", token });
    expectStatus(after.res, 200);
    expect((after.body as { publicKey: string }).publicKey).toBe("pub");

    const again = await call(createMyUserKeys, path, {}, { method: "POST", token, json: payload });
    expectStatus(again.res, 409);
  });
});

describe("PATCH/DELETE /api/vars/{id}", () => {
  async function setup() {
    const orgId = `org-${crypto.randomUUID()}`;
    const userId = `user-${crypto.randomUUID()}`;
    grantOrgRole(userId, orgId, "admin");
    const project = await createProject(orgId);
    const environment = await createEnvironment(project.id);
    const variable = await createEnvVar(environment.id, { key: "ORIGINAL" });
    const { token } = await createApiToken(userId);
    const { token: readOnlyToken } = await createApiToken(userId, { capability: "read" });
    return { environment, variable, token, readOnlyToken };
  }

  test("PATCH 200 updates the value, 400 for an invalid key rename", async () => {
    const { variable, token } = await setup();
    const path = `/api/vars/${variable.id}`;
    const { res, body } = await call(updateVar, path, { id: variable.id }, { method: "PATCH", token, json: { ciphertext: "new", iv: "newiv" } });
    expectStatus(res, 200);
    expect((body as { variable: { id: string } }).variable.id).toBe(variable.id);

    const invalid = await call(updateVar, path, { id: variable.id }, { method: "PATCH", token, json: { key: "not valid!" } });
    expectStatus(invalid.res, 400);
  });

  test("PATCH 403 for a read-only token", async () => {
    const { variable, readOnlyToken } = await setup();
    const path = `/api/vars/${variable.id}`;
    const { res } = await call(updateVar, path, { id: variable.id }, { method: "PATCH", token: readOnlyToken, json: { ciphertext: "x", iv: "y" } });
    expectStatus(res, 403);
  });

  test("DELETE 200 soft-deletes, then 404 on a second delete", async () => {
    const { variable, token } = await setup();
    const path = `/api/vars/${variable.id}`;
    const first = await call(deleteVar, path, { id: variable.id }, { method: "DELETE", token });
    expectStatus(first.res, 200);
    const second = await call(deleteVar, path, { id: variable.id }, { method: "DELETE", token });
    expectStatus(second.res, 404);
  });
});
