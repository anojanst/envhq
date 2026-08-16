import { beforeAll, describe, expect, test } from "vitest";
import { grantOrgRole, resetContractWorld, createProject, createEnvironment, createEnvVar, createApiToken } from "@/test-support/contract-seed";
import { call, expectStatus } from "./helpers";

import { POST as commit } from "@/app/api/v1/environments/[id]/commit/route";
import { GET as exportEnv } from "@/app/api/v1/environments/[id]/export/route";
import { POST as importEnv } from "@/app/api/v1/environments/[id]/import/route";
import { GET as getEnv, PATCH as patchEnv, DELETE as deleteEnv } from "@/app/api/v1/environments/[id]/route";
import { POST as upsertVar } from "@/app/api/v1/environments/[id]/vars/route";
import { POST as rollback } from "@/app/api/v1/environments/[id]/versions/[version]/rollback/route";
import { GET as listVersions } from "@/app/api/v1/environments/[id]/versions/route";

beforeAll(resetContractWorld);

async function setup() {
  const orgId = `org-${crypto.randomUUID()}`;
  const userId = `user-${crypto.randomUUID()}`;
  grantOrgRole(userId, orgId, "admin");
  const project = await createProject(orgId);
  const environment = await createEnvironment(project.id);
  const { token } = await createApiToken(userId);
  const { token: readOnlyToken } = await createApiToken(userId, { capability: "read" });
  return { orgId, userId, project, environment, token, readOnlyToken };
}

describe("POST /api/v1/environments/{id}/commit", () => {
  test("200 commits and bumps the version", async () => {
    const { environment, token } = await setup();
    const path = `/api/v1/environments/${environment.id}/commit`;
    const { res, body } = await call(
      commit,
      path,
      { id: environment.id },
      { method: "POST", token, json: { baseVersion: 0, upsert: [{ key: "A", ciphertext: "c", iv: "i" }] } },
    );
    expectStatus(res, 200);
    expect((body as { version: number }).version).toBe(1);
    expect((body as { created: number }).created).toBe(1);
  });

  test("403 for a read-only token", async () => {
    const { environment, readOnlyToken } = await setup();
    const path = `/api/v1/environments/${environment.id}/commit`;
    const { res } = await call(commit, path, { id: environment.id }, { method: "POST", token: readOnlyToken, json: { baseVersion: 0 } });
    expectStatus(res, 403);
  });

  test("404 for an environment the caller has no role on", async () => {
    const { token } = await setup();
    const otherOrgProject = await createProject(`org-${crypto.randomUUID()}`);
    const otherEnvironment = await createEnvironment(otherOrgProject.id);
    const path = `/api/v1/environments/${otherEnvironment.id}/commit`;
    const { res } = await call(commit, path, { id: otherEnvironment.id }, { method: "POST", token, json: { baseVersion: 0 } });
    expectStatus(res, 404);
  });

  test("409 version_conflict includes currentVersion and serverPairs for the touched keys", async () => {
    const { environment, token } = await setup();
    await createEnvVar(environment.id, { key: "EXISTING" });
    const path = `/api/v1/environments/${environment.id}/commit`;
    // Stale baseVersion (0) after the fixture var's insert didn't bump the
    // environment's version — force a real conflict by committing once first.
    await call(commit, path, { id: environment.id }, { method: "POST", token, json: { baseVersion: 0, upsert: [{ key: "B", ciphertext: "c", iv: "i" }] } });
    const { res, body } = await call(commit, path, { id: environment.id }, {
      method: "POST",
      token,
      json: { baseVersion: 0, upsert: [{ key: "EXISTING", ciphertext: "new", iv: "i" }] },
    });
    expectStatus(res, 409);
    const conflict = body as { error: string; currentVersion: number; serverPairs: unknown[] };
    expect(conflict.error).toBe("version_conflict");
    expect(conflict.currentVersion).toBe(1);
    expect(Array.isArray(conflict.serverPairs)).toBe(true);
  });
});

describe("GET /api/v1/environments/{id}/export", () => {
  test("200 returns ciphertext pairs", async () => {
    const { environment, token } = await setup();
    await createEnvVar(environment.id, { key: "A" });
    const path = `/api/v1/environments/${environment.id}/export`;
    const { res, body } = await call(exportEnv, path, { id: environment.id }, { method: "GET", token });
    expectStatus(res, 200);
    expect((body as { count: number }).count).toBe(1);
  });
});

describe("POST /api/v1/environments/{id}/import", () => {
  test("200 upserts a batch", async () => {
    const { environment, token } = await setup();
    const path = `/api/v1/environments/${environment.id}/import`;
    const { res, body } = await call(importEnv, path, { id: environment.id }, {
      method: "POST",
      token,
      json: { pairs: [{ key: "A", ciphertext: "c", iv: "i" }] },
    });
    expectStatus(res, 200);
    expect((body as { total: number }).total).toBe(1);
  });

  test("409 the generic versionConflict() shape (no currentVersion field)", async () => {
    const { environment, token } = await setup();
    const path = `/api/v1/environments/${environment.id}/import`;
    // import always commits against the *live* version, so racing it against
    // itself (two started from the same read) reproduces the CAS loss.
    const [first, second] = await Promise.all([
      call(importEnv, path, { id: environment.id }, { method: "POST", token, json: { pairs: [{ key: "A", ciphertext: "c", iv: "i" }] } }),
      call(importEnv, path, { id: environment.id }, { method: "POST", token, json: { pairs: [{ key: "B", ciphertext: "c", iv: "i" }] } }),
    ]);
    const conflicted = [first, second].find((r) => r.res.status === 409);
    expect(conflicted).toBeDefined();
    expect(conflicted!.body).toEqual({
      error: "This environment changed elsewhere — refresh and try again.",
      code: "version_conflict",
    });
  });
});

describe("GET/PATCH/DELETE /api/v1/environments/{id}", () => {
  test("GET 200 returns the environment, project, and vars", async () => {
    const { environment, project, token } = await setup();
    const path = `/api/v1/environments/${environment.id}`;
    const { res, body } = await call(getEnv, path, { id: environment.id }, { method: "GET", token });
    expectStatus(res, 200);
    expect((body as { project: { id: string } }).project.id).toBe(project.id);
  });

  test("PATCH 200 renames", async () => {
    const { environment, token } = await setup();
    const path = `/api/v1/environments/${environment.id}`;
    const { res, body } = await call(patchEnv, path, { id: environment.id }, { method: "PATCH", token, json: { name: "renamed" } });
    expectStatus(res, 200);
    expect((body as { environment: { name: string } }).environment.name).toBe("renamed");
  });

  test("PATCH 409 on a name collision within the project", async () => {
    const { project, environment, token } = await setup();
    const other = await createEnvironment(project.id, "taken");
    const path = `/api/v1/environments/${environment.id}`;
    const { res } = await call(patchEnv, path, { id: environment.id }, { method: "PATCH", token, json: { name: other.name } });
    expectStatus(res, 409);
  });

  test("DELETE 200", async () => {
    const { environment, token } = await setup();
    const path = `/api/v1/environments/${environment.id}`;
    const { res, body } = await call(deleteEnv, path, { id: environment.id }, { method: "DELETE", token });
    expectStatus(res, 200);
    expect(body).toEqual({ ok: true });
  });
});

describe("POST /api/v1/environments/{id}/vars", () => {
  test("201 on first create, 200 on update — the one status-branching route", async () => {
    const { environment, token } = await setup();
    const path = `/api/v1/environments/${environment.id}/vars`;
    const created = await call(upsertVar, path, { id: environment.id }, {
      method: "POST",
      token,
      json: { key: "NEW_KEY", ciphertext: "c", iv: "i" },
    });
    expectStatus(created.res, 201);
    expect((created.body as { created: boolean }).created).toBe(true);

    const updated = await call(upsertVar, path, { id: environment.id }, {
      method: "POST",
      token,
      json: { key: "NEW_KEY", ciphertext: "c2", iv: "i2" },
    });
    expectStatus(updated.res, 200);
    expect((updated.body as { created: boolean }).created).toBe(false);
  });

  test("400 for a key that fails the identifier pattern", async () => {
    const { environment, token } = await setup();
    const path = `/api/v1/environments/${environment.id}/vars`;
    const { res } = await call(upsertVar, path, { id: environment.id }, {
      method: "POST",
      token,
      json: { key: "not valid!", ciphertext: "c", iv: "i" },
    });
    expectStatus(res, 400);
  });
});

describe("POST /api/v1/environments/{id}/versions/{version}/rollback", () => {
  // A rollback target must have a real snapshot — only versions produced by
  // a completed commit have one (the implicit starting version 0 doesn't).
  test("200 rolls forward to a new version", async () => {
    const { environment, token } = await setup();
    const commitPath = `/api/v1/environments/${environment.id}/commit`;
    await call(commit, commitPath, { id: environment.id }, { method: "POST", token, json: { baseVersion: 0, upsert: [{ key: "A", ciphertext: "c", iv: "i" }] } });
    await call(commit, commitPath, { id: environment.id }, { method: "POST", token, json: { baseVersion: 1, upsert: [{ key: "B", ciphertext: "c", iv: "i" }] } });

    const path = `/api/v1/environments/${environment.id}/versions/1/rollback`;
    const { res, body } = await call(rollback, path, { id: environment.id, version: "1" }, { method: "POST", token, json: { baseVersion: 2 } });
    expectStatus(res, 200);
    expect((body as { version: number }).version).toBe(3);
  });

  test("409 VersionConflictSimple has no serverPairs field", async () => {
    const { environment, token } = await setup();
    const commitPath = `/api/v1/environments/${environment.id}/commit`;
    await call(commit, commitPath, { id: environment.id }, { method: "POST", token, json: { baseVersion: 0, upsert: [{ key: "A", ciphertext: "c", iv: "i" }] } });

    const path = `/api/v1/environments/${environment.id}/versions/1/rollback`;
    const { res, body } = await call(rollback, path, { id: environment.id, version: "1" }, { method: "POST", token, json: { baseVersion: 0 } });
    expectStatus(res, 409);
    const conflict = body as { error: string; currentVersion: number; serverPairs?: unknown };
    expect(conflict.error).toBe("version_conflict");
    expect(conflict.currentVersion).toBe(1);
    expect(conflict.serverPairs).toBeUndefined();
  });
});

describe("GET /api/v1/environments/{id}/versions", () => {
  test("200 lists version history newest first", async () => {
    const { environment, token } = await setup();
    const commitPath = `/api/v1/environments/${environment.id}/commit`;
    await call(commit, commitPath, { id: environment.id }, { method: "POST", token, json: { baseVersion: 0, upsert: [{ key: "A", ciphertext: "c", iv: "i" }] } });

    const path = `/api/v1/environments/${environment.id}/versions`;
    const { res, body } = await call(listVersions, path, { id: environment.id }, { method: "GET", token });
    expectStatus(res, 200);
    expect((body as { versions: unknown[] }).versions).toHaveLength(1);
  });
});
