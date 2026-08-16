import { beforeAll, describe, expect, test } from "vitest";
import { setOrgAdminList } from "@/test-support/mock-orgs";
import {
  resetContractWorld,
  createProject as seedProject,
  createEnvironment as seedEnvironment,
  createEnvVar,
  createAccessGrant,
  createUserKeys,
  createProjectKey,
  createApiToken,
  grantOrgRole,
} from "@/test-support/contract-seed";
import { call, expectStatus } from "./helpers";

import { DELETE as deleteAccessGrant } from "@/app/api/v1/projects/[id]/access/[grantId]/route";
import { GET as listAccess, POST as upsertAccess } from "@/app/api/v1/projects/[id]/access/route";
import { POST as createEnvironmentRoute } from "@/app/api/v1/projects/[id]/environments/route";
import { GET as getMyProjectKey } from "@/app/api/v1/projects/[id]/keys/me/route";
import { GET as listProjectKeyMembers } from "@/app/api/v1/projects/[id]/keys/members/route";
import { GET as listPendingProjectKeyMembers } from "@/app/api/v1/projects/[id]/keys/pending/route";
import { POST as finalizeRotation } from "@/app/api/v1/projects/[id]/keys/rotate/finalize/route";
import { POST as migrateRotationBatch } from "@/app/api/v1/projects/[id]/keys/rotate/route";
import { GET as getRotationStatus } from "@/app/api/v1/projects/[id]/keys/rotation-status/route";
import { POST as registerProjectKey } from "@/app/api/v1/projects/[id]/keys/route";
import { GET as getProject, PATCH as patchProject, DELETE as deleteProject } from "@/app/api/v1/projects/[id]/route";
import { GET as listProjects, POST as createProjectRoute } from "@/app/api/v1/projects/route";

beforeAll(resetContractWorld);

async function setup() {
  const orgId = `org-${crypto.randomUUID()}`;
  const userId = `user-${crypto.randomUUID()}`;
  grantOrgRole(userId, orgId, "admin");
  // listAccessibleUserIds (used by keys/members, keys/pending, and
  // finalize's membership check) enumerates org admins via a *separate*
  // list from the role check above — populate both so DEK-wrap
  // reconciliation sees this caller as a project member.
  setOrgAdminList(orgId, [userId]);
  const project = await seedProject(orgId);
  const { token } = await createApiToken(userId);
  const { token: readOnlyToken } = await createApiToken(userId, { capability: "read" });
  return { orgId, userId, project, token, readOnlyToken };
}

describe("GET/PATCH/DELETE /api/v1/projects/{id}", () => {
  test("GET 200", async () => {
    const { project, token } = await setup();
    const path = `/api/v1/projects/${project.id}`;
    const { res, body } = await call(getProject, path, { id: project.id }, { method: "GET", token });
    expectStatus(res, 200);
    expect((body as { project: { id: string } }).project.id).toBe(project.id);
  });

  test("PATCH 200 renames", async () => {
    const { project, token } = await setup();
    const path = `/api/v1/projects/${project.id}`;
    const { res, body } = await call(patchProject, path, { id: project.id }, { method: "PATCH", token, json: { name: "renamed" } });
    expectStatus(res, 200);
    expect((body as { project: { name: string } }).project.name).toBe("renamed");
  });

  test("PATCH 409 on a duplicate name — the fixed rename-collision bug (was an uncaught 500)", async () => {
    const { orgId, project, token } = await setup();
    const other = await seedProject(orgId, "taken-name");
    const path = `/api/v1/projects/${project.id}`;
    const { res } = await call(patchProject, path, { id: project.id }, { method: "PATCH", token, json: { name: other.name } });
    expectStatus(res, 409);
  });

  test("DELETE 200", async () => {
    const { project, token } = await setup();
    const path = `/api/v1/projects/${project.id}`;
    const { res, body } = await call(deleteProject, path, { id: project.id }, { method: "DELETE", token });
    expectStatus(res, 200);
    expect(body).toEqual({ ok: true });
  });
});

describe("GET/POST /api/v1/projects", () => {
  test("GET 200 lists accessible projects", async () => {
    const { orgId, token } = await setup();
    const path = `/api/v1/projects?orgId=${orgId}`;
    const { res, body } = await call(listProjects, path, {}, { method: "GET", token });
    expectStatus(res, 200);
    expect((body as { projects: unknown[] }).projects.length).toBeGreaterThanOrEqual(1);
  });

  test("POST 201 creates a project with its default environment", async () => {
    const orgId = `org-${crypto.randomUUID()}`;
    const userId = `user-${crypto.randomUUID()}`;
    grantOrgRole(userId, orgId, "admin");
    const { token } = await createApiToken(userId);
    const path = "/api/v1/projects";
    const { res, body } = await call(createProjectRoute, path, {}, { method: "POST", token, json: { name: `New ${crypto.randomUUID()}`, orgId } });
    expectStatus(res, 201);
    const created = body as { project: { id: string }; environments: { name: string }[] };
    expect(created.environments.map((e) => e.name)).toEqual(["dev"]);
  });

  test("POST 409 on a duplicate project name in the org", async () => {
    const { orgId, project, token } = await setup();
    const path = "/api/v1/projects";
    const { res } = await call(createProjectRoute, path, {}, { method: "POST", token, json: { name: project.name, orgId } });
    expectStatus(res, 409);
  });
});

describe("POST /api/v1/projects/{id}/environments", () => {
  test("201 creates an environment, optionally cloning another's variables", async () => {
    const { project, token } = await setup();
    const source = await seedEnvironment(project.id, "source");
    await createEnvVar(source.id, { key: "A" });
    const path = `/api/v1/projects/${project.id}/environments`;
    const { res, body } = await call(createEnvironmentRoute, path, { id: project.id }, {
      method: "POST",
      token,
      json: { name: "cloned", from: source.id },
    });
    expectStatus(res, 201);
    expect((body as { environment: { name: string } }).environment.name).toBe("cloned");
  });
});

describe("GET/POST /api/v1/projects/{id}/access, DELETE /api/v1/projects/{id}/access/{grantId}", () => {
  test("GET 200 lists grants and environments", async () => {
    const { project, token } = await setup();
    const path = `/api/v1/projects/${project.id}/access`;
    const { res, body } = await call(listAccess, path, { id: project.id }, { method: "GET", token });
    expectStatus(res, 200);
    expect((body as { grants: unknown[] }).grants).toEqual([]);
  });

  test("POST 201 grants a user a role", async () => {
    const { orgId, project, token } = await setup();
    const subjectId = `user-${crypto.randomUUID()}`;
    grantOrgRole(subjectId, orgId, "member");
    const path = `/api/v1/projects/${project.id}/access`;
    const { res, body } = await call(upsertAccess, path, { id: project.id }, {
      method: "POST",
      token,
      json: { subjectId, role: "editor" },
    });
    expectStatus(res, 201);
    expect((body as { grant: { role: string } }).grant.role).toBe("editor");
  });

  test("DELETE 200 revokes a grant", async () => {
    const { orgId, project, token } = await setup();
    const subjectId = `user-${crypto.randomUUID()}`;
    await createAccessGrant({ orgId, projectId: project.id, subjectType: "user", subjectId, role: "viewer" });
    const [{ id: grantId }] = await (async () => {
      const listPath = `/api/v1/projects/${project.id}/access`;
      const { body } = await call(listAccess, listPath, { id: project.id }, { method: "GET", token });
      return (body as { grants: { id: string }[] }).grants;
    })();
    const path = `/api/v1/projects/${project.id}/access/${grantId}`;
    const { res, body } = await call(deleteAccessGrant, path, { id: project.id, grantId }, { method: "DELETE", token });
    expectStatus(res, 200);
    expect(body).toEqual({ ok: true });
  });
});

describe("Project key management", () => {
  test("POST /api/v1/projects/{id}/keys 201 self-registers, then 409 on a second registration", async () => {
    const { project, token } = await setup();
    const path = `/api/v1/projects/${project.id}/keys`;
    const first = await call(registerProjectKey, path, { id: project.id }, { method: "POST", token, json: { wrappedDek: "wrapped" } });
    expectStatus(first.res, 201);
    const second = await call(registerProjectKey, path, { id: project.id }, { method: "POST", token, json: { wrappedDek: "wrapped-again" } });
    expectStatus(second.res, 409);
  });

  test("POST /api/v1/projects/{id}/keys 403 for a read-only token — the fixed isReadOnly gate", async () => {
    const { project, readOnlyToken } = await setup();
    const path = `/api/v1/projects/${project.id}/keys`;
    const { res } = await call(registerProjectKey, path, { id: project.id }, { method: "POST", token: readOnlyToken, json: { wrappedDek: "wrapped" } });
    expectStatus(res, 403);
  });

  test("GET /api/v1/projects/{id}/keys/me 404 ProjectKeyNotFound before registering, 200 after", async () => {
    const { project, token } = await setup();
    const path = `/api/v1/projects/${project.id}/keys/me`;
    const before = await call(getMyProjectKey, path, { id: project.id }, { method: "GET", token });
    expectStatus(before.res, 404);
    expect((before.body as { anyKeyExists: boolean }).anyKeyExists).toBe(false);

    await call(registerProjectKey, `/api/v1/projects/${project.id}/keys`, { id: project.id }, { method: "POST", token, json: { wrappedDek: "wrapped" } });
    const after = await call(getMyProjectKey, path, { id: project.id }, { method: "GET", token });
    expectStatus(after.res, 200);
    expect((after.body as { wrappedDek: string }).wrappedDek).toBe("wrapped");
  });

  test("GET /api/v1/projects/{id}/keys/members and /pending reflect onboarding + wrap state", async () => {
    const { project, userId, token } = await setup();
    await createUserKeys(userId);
    const pendingPath = `/api/v1/projects/${project.id}/keys/pending`;
    const beforeWrap = await call(listPendingProjectKeyMembers, pendingPath, { id: project.id }, { method: "GET", token });
    expectStatus(beforeWrap.res, 200);
    expect((beforeWrap.body as { pending: { userId: string }[] }).pending.map((p) => p.userId)).toContain(userId);

    await createProjectKey(project.id, userId);
    const membersPath = `/api/v1/projects/${project.id}/keys/members`;
    const { res, body } = await call(listProjectKeyMembers, membersPath, { id: project.id }, { method: "GET", token });
    expectStatus(res, 200);
    expect((body as { members: { userId: string }[] }).members.map((m) => m.userId)).toContain(userId);
  });

  test("GET /api/v1/projects/{id}/keys/rotation-status 200", async () => {
    const { project, token } = await setup();
    const path = `/api/v1/projects/${project.id}/keys/rotation-status`;
    const { res, body } = await call(getRotationStatus, path, { id: project.id }, { method: "GET", token });
    expectStatus(res, 200);
    expect(body).toEqual({ currentKeyVersion: 1, rotationPending: false });
  });

  test("POST /api/v1/projects/{id}/keys/rotate 200 migrates a batch, 403 for a read-only token", async () => {
    const { project, token, readOnlyToken } = await setup();
    const environment = await seedEnvironment(project.id);
    const variable = await createEnvVar(environment.id);
    const path = `/api/v1/projects/${project.id}/keys/rotate`;

    const readOnly = await call(migrateRotationBatch, path, { id: project.id }, {
      method: "POST",
      token: readOnlyToken,
      json: { targetKeyVersion: 2, rows: [{ id: variable.id, ciphertext: "c", iv: "i" }] },
    });
    expectStatus(readOnly.res, 403);

    const { res, body } = await call(migrateRotationBatch, path, { id: project.id }, {
      method: "POST",
      token,
      json: { targetKeyVersion: 2, rows: [{ id: variable.id, ciphertext: "c", iv: "i" }] },
    });
    expectStatus(res, 200);
    expect(body).toEqual({ ok: true, migrated: 1 });
  });

  test("POST /api/v1/projects/{id}/keys/rotate/finalize 403 for a read-only token, 200 once nothing is pending", async () => {
    const { project, token, readOnlyToken } = await setup();
    const path = `/api/v1/projects/${project.id}/keys/rotate/finalize`;

    const readOnly = await call(finalizeRotation, path, { id: project.id }, {
      method: "POST",
      token: readOnlyToken,
      json: { targetKeyVersion: 2, wraps: [] },
    });
    expectStatus(readOnly.res, 403);

    const { res, body } = await call(finalizeRotation, path, { id: project.id }, {
      method: "POST",
      token,
      json: { targetKeyVersion: 2, wraps: [] },
    });
    expectStatus(res, 200);
    expect(body).toEqual({ ok: true });
  });
});
