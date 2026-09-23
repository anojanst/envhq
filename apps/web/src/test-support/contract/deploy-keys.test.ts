import { beforeAll, describe, expect, test } from "vitest";
import { generateDek, generateKeypair, sealToPublicKey, unsealWithPrivateKey, encodeBase64, decodeBase64 } from "@envhq/crypto";
import { setOrgAdminList } from "@/test-support/mock-orgs";
import {
  resetContractWorld,
  createProject as seedProject,
  createEnvironment as seedEnvironment,
  createEnvVar,
  createApiToken,
  createUserKeys,
  grantOrgRole,
} from "@/test-support/contract-seed";
import { call, expectStatus } from "./helpers";
import { and, eq } from "drizzle-orm";
import { testDb } from "@/test-support/db";
import { apiTokens, projectKeys } from "@/db/schema";
import { deploySubjectId } from "@/lib/deploy-keys";
import { hashToken } from "@/lib/crypto";

import { GET as listDeployKeys, POST as createDeployKeyRoute } from "@/app/api/projects/[id]/deploy-keys/route";
import { DELETE as revokeDeployKeyRoute } from "@/app/api/projects/[id]/deploy-keys/[keyId]/route";
import { GET as exportEnvironment } from "@/app/api/environments/[id]/export/route";
import { GET as getRotationStatus } from "@/app/api/projects/[id]/keys/rotation-status/route";
import { GET as listProjectKeyMembers } from "@/app/api/projects/[id]/keys/members/route";
import { POST as finalizeRotation } from "@/app/api/projects/[id]/keys/rotate/finalize/route";
import { POST as migrateRotationBatch } from "@/app/api/projects/[id]/keys/rotate/route";

/**
 * RM-11's acceptance criteria, against real route handlers and real Postgres.
 *
 * The crypto here is real too — actual X25519 keypairs, actual sealed DEKs,
 * actually unsealed at the end. A test that stubbed the sealing would prove
 * the plumbing moves strings around, which is not the claim. The claim is
 * that a pipeline holding the private half can decrypt and that nothing else
 * can, and that only survives being checked with the real primitives.
 */

beforeAll(resetContractWorld);

async function setup() {
  const orgId = `org-${crypto.randomUUID()}`;
  const userId = `user-${crypto.randomUUID()}`;
  grantOrgRole(userId, orgId, "admin");
  setOrgAdminList(orgId, [userId]);
  // A real curve point: this suite seals to it for the rotation tests, and
  // the placeholder the helper uses by default is not a valid X25519 key.
  const memberKeypair = await generateKeypair();
  await createUserKeys(userId, memberKeypair.publicKey);
  const project = await seedProject(orgId);
  const env = await seedEnvironment(project.id, "prod");
  const staging = await seedEnvironment(project.id, "staging");
  const envVar = await createEnvVar(env.id, { key: "DATABASE_URL" });
  const { token } = await createApiToken(userId);
  return { orgId, userId, project, env, staging, token, memberKeypair, envVar };
}

/** Issues a deploy key the way the browser does: real keypair, DEK sealed client-side. */
async function issue(
  projectId: string,
  token: string,
  opts: { label?: string; environmentId?: string | null; dek?: Uint8Array } = {},
) {
  const dek = opts.dek ?? (await generateDek());
  const keypair = await generateKeypair();
  const wrappedDek = await sealToPublicKey(encodeBase64(dek), keypair.publicKey);
  const { res, body } = await call(
    createDeployKeyRoute,
    `/api/projects/${projectId}/deploy-keys`,
    { id: projectId },
    {
      method: "POST",
      token,
      json: {
        label: opts.label ?? "GitHub Actions",
        environmentId: opts.environmentId ?? null,
        publicKey: keypair.publicKey,
        wrappedDek,
      },
    },
  );
  return { res, body: body as { id: string; token: string }, keypair, dek };
}

/** The CI fetch: a bearer token plus the deploy key's public half in its header. */
async function ciExport(environmentId: string, token: string, publicKey?: string) {
  const req = new Request(`http://test.local/api/environments/${environmentId}/export`, {
    method: "GET",
    headers: {
      authorization: `Bearer ${token}`,
      ...(publicKey ? { "x-envhq-deploy-key": publicKey } : {}),
    },
  });
  const res = await exportEnvironment(req, { params: Promise.resolve({ id: environmentId }) });
  return { res, body: (await res.json().catch(() => null)) as Record<string, unknown> | null };
}

describe("issuing a deploy key", () => {
  test("returns a token once and lists the key", async () => {
    const { project, token } = await setup();
    const { res, body } = await issue(project.id, token, { label: "Prod deploys" });
    expectStatus(res, 201);
    expect(body.token).toMatch(/^envhq_/);

    const listed = await call(
      listDeployKeys,
      `/api/projects/${project.id}/deploy-keys`,
      { id: project.id },
      { method: "GET", token },
    );
    expectStatus(listed.res, 200);
    const keys = (listed.body as { deployKeys: { id: string; label: string; revokedAt: string | null }[] }).deployKeys;
    expect(keys).toHaveLength(1);
    expect(keys[0]).toMatchObject({ id: body.id, label: "Prod deploys", revokedAt: null });
  });

  test("the listing never carries anything that decrypts", async () => {
    // Show-once means show-once, including for support. The list endpoint is
    // the obvious place for a private half to leak back out by accident.
    const { project, token } = await setup();
    const { keypair } = await issue(project.id, token);
    const listed = await call(
      listDeployKeys,
      `/api/projects/${project.id}/deploy-keys`,
      { id: project.id },
      { method: "GET", token },
    );
    const wire = JSON.stringify(listed.body);
    expect(wire).not.toContain(keypair.privateKey);
    expect(wire).toContain(keypair.publicKey);
  });
});

describe("the CI path", () => {
  test("a deploy key gets a wrap it can actually open", async () => {
    const { project, env, token } = await setup();
    const { body, keypair, dek } = await issue(project.id, token);
    expect(body.token).toBeTruthy();

    const { res, body: exported } = await ciExport(env.id, body.token, keypair.publicKey);
    expectStatus(res, 200);
    expect(exported?.pairs).toBeTruthy();

    // The end-to-end claim: this sealed blob, and the private half that never
    // touched the server, produce the project DEK.
    const opened = await unsealWithPrivateKey(exported!.wrappedDek as string, keypair.publicKey, keypair.privateKey);
    expect(decodeBase64(opened)).toEqual(dek);
    expect(exported!.keyVersion).toBe(1);
  });

  test("a token alone yields ciphertext and no wrap", async () => {
    // The two-secret split, stated as a test: authentication is not
    // decryption, and the fetch succeeding proves nothing about plaintext.
    const { project, env, token } = await setup();
    const { body } = await issue(project.id, token);
    const { res, body: exported } = await ciExport(env.id, body.token);
    expectStatus(res, 200);
    expect(exported?.pairs).toBeTruthy();
    expect(exported?.wrappedDek).toBeUndefined();
  });

  test("a token scoped to project A cannot fetch project B", async () => {
    const { orgId, userId } = await setup();
    const projectA = await seedProject(orgId, `a-${crypto.randomUUID()}`);
    const projectB = await seedProject(orgId, `b-${crypto.randomUUID()}`);
    const envB = await seedEnvironment(projectB.id, "prod");
    await createEnvVar(envB.id);
    const { token: scopedToA } = await createApiToken(userId, { projectId: projectA.id, capability: "read" });

    const { res } = await ciExport(envB.id, scopedToA);
    expectStatus(res, 404);

    // And the same token reaches its own project, so the 404 above is the
    // scope talking and not a broken fixture.
    const envA = await seedEnvironment(projectA.id, "prod");
    expectStatus((await ciExport(envA.id, scopedToA)).res, 200);
  });

  test("a deploy key from another project is refused even with a valid token", async () => {
    const { orgId, project, env, token } = await setup();
    const other = await seedProject(orgId, `other-${crypto.randomUUID()}`);
    const { keypair: otherKeypair } = await issue(other.id, token);
    const { body } = await issue(project.id, token);

    // Public keys are public; being able to name one must be worth nothing.
    const { res } = await ciExport(env.id, body.token, otherKeypair.publicKey);
    expectStatus(res, 403);
  });

  test("an environment cap is enforced by the API", async () => {
    const { project, env, staging, token } = await setup();
    const { body, keypair } = await issue(project.id, token, { environmentId: staging.id });

    expectStatus((await ciExport(staging.id, body.token, keypair.publicKey)).res, 200);
    expectStatus((await ciExport(env.id, body.token, keypair.publicKey)).res, 403);
  });

  test("an unknown key and a revoked key are indistinguishable", async () => {
    // Telling them apart would confirm to whoever holds a revoked key that
    // it was once real on this project.
    const { project, env, token } = await setup();
    const { body, keypair } = await issue(project.id, token);
    await call(
      revokeDeployKeyRoute,
      `/api/projects/${project.id}/deploy-keys/${body.id}`,
      { id: project.id, keyId: body.id },
      { method: "DELETE", token },
    );
    // Both with the same still-valid token, so the only difference is the
    // key presented. (The revoked key's own token is dead too — asserted in
    // the revocation suite below.)
    const revoked = await ciExport(env.id, token, keypair.publicKey);
    const madeUp = await ciExport(env.id, token, (await generateKeypair()).publicKey);
    expect(revoked.res.status).toBe(403);
    expect(madeUp.res.status).toBe(403);
    expect(revoked.body).toEqual(madeUp.body);
  });
});

describe("revocation", () => {
  test("a revoked key decrypts nothing afterwards, and the project is flagged for rotation", async () => {
    const { project, env, token } = await setup();
    const { body, keypair } = await issue(project.id, token);

    // Working before.
    expectStatus((await ciExport(env.id, body.token, keypair.publicKey)).res, 200);

    const revoked = await call(
      revokeDeployKeyRoute,
      `/api/projects/${project.id}/deploy-keys/${body.id}`,
      { id: project.id, keyId: body.id },
      { method: "DELETE", token },
    );
    expectStatus(revoked.res, 200);
    expect(revoked.body).toMatchObject({ rotationRequired: true });

    // Its token died with it, so it cannot even fetch ciphertext any more —
    // ADR-020 is explicit that leaving the token alive is a live credential.
    const after = await ciExport(env.id, body.token, keypair.publicKey);
    expect(after.res.status).toBe(401);

    // And with a still-valid token it gets no wrap, so it decrypts nothing.
    const withGoodToken = await ciExport(env.id, token, keypair.publicKey);
    expectStatus(withGoodToken.res, 403);

    const status = await call(
      getRotationStatus,
      `/api/projects/${project.id}/keys/rotation-status`,
      { id: project.id },
      { method: "GET", token },
    );
    expect(status.body).toMatchObject({ rotationPending: true });

    // Checked at the table, not through the API. Every assertion above is
    // satisfied by the `revoked_at` flag alone, so on its own this suite
    // would still pass if revocation left the sealed DEK sitting in
    // `project_keys` — a wrap that a later change to the resolve path could
    // start honouring again. ADR-020 makes deleting it step one of
    // revocation; this is what holds that.
    const wraps = await testDb
      .select()
      .from(projectKeys)
      .where(and(eq(projectKeys.projectId, project.id), eq(projectKeys.subjectUserId, deploySubjectId(body.id))));
    expect(wraps).toHaveLength(0);

    // And the token row is gone, not merely unusable — two records, one
    // action, per ADR-020.
    const tokens = await testDb.select().from(apiTokens).where(eq(apiTokens.tokenHash, hashToken(body.token)));
    expect(tokens).toHaveLength(0);
  });

  test("revoking twice is not an error", async () => {
    const { project, token } = await setup();
    const { body } = await issue(project.id, token);
    const path = `/api/projects/${project.id}/deploy-keys/${body.id}`;
    const params = { id: project.id, keyId: body.id };
    expectStatus((await call(revokeDeployKeyRoute, path, params, { method: "DELETE", token })).res, 200);
    expectStatus((await call(revokeDeployKeyRoute, path, params, { method: "DELETE", token })).res, 200);
  });
});

describe("rotation", () => {
  /**
   * A whole rotation: re-encrypt the project's variables to a new DEK, then
   * finalize with a wrap set. Finalize refuses to run until every row is
   * migrated, so the first phase is not optional scaffolding — skipping it
   * makes every one of these tests fail on the wrong check.
   */
  async function rotate(
    projectId: string,
    token: string,
    newDek: Uint8Array,
    include: { subjectUserId: string; publicKey: string }[],
    varIds: string[] = [],
  ) {
    if (varIds.length > 0) {
      await call(
        migrateRotationBatch,
        `/api/projects/${projectId}/keys/rotate`,
        { id: projectId },
        {
          method: "POST",
          token,
          json: {
            targetKeyVersion: 2,
            rows: varIds.map((id) => ({ id, ciphertext: `rotated-${id}`, iv: `iv-${id}` })),
          },
        },
      );
    }
    const newDekB64 = encodeBase64(newDek);
    const wraps = await Promise.all(
      include.map(async (s) => ({
        subjectUserId: s.subjectUserId,
        wrappedDek: await sealToPublicKey(newDekB64, s.publicKey),
      })),
    );
    return call(
      finalizeRotation,
      `/api/projects/${projectId}/keys/rotate/finalize`,
      { id: projectId },
      { method: "POST", token, json: { targetKeyVersion: 2, wraps } },
    );
  }

  test("the expected wrap set includes active deploy keys and excludes revoked ones", async () => {
    const { project, token } = await setup();
    const active = await issue(project.id, token, { label: "live" });
    const doomed = await issue(project.id, token, { label: "about to go" });
    await call(
      revokeDeployKeyRoute,
      `/api/projects/${project.id}/deploy-keys/${doomed.body.id}`,
      { id: project.id, keyId: doomed.body.id },
      { method: "DELETE", token },
    );

    const { body } = await call(
      listProjectKeyMembers,
      `/api/projects/${project.id}/keys/members`,
      { id: project.id },
      { method: "GET", token },
    );
    const deployKeys = (body as { deployKeys: { subjectId: string; publicKey: string }[] }).deployKeys;
    expect(deployKeys).toHaveLength(1);
    expect(deployKeys[0]!.publicKey).toBe(active.keypair.publicKey);
  });

  test("a rotation that forgets a deploy key is rejected rather than silently breaking it", async () => {
    // The failure mode ADR-020 warns about: a `project_keys` row the
    // expected-set computation doesn't know about fails every rotation, and
    // then gets deleted by finalize once someone works around that.
    const { project, userId, token, envVar } = await setup();
    await issue(project.id, token);

    const members = await call(
      listProjectKeyMembers,
      `/api/projects/${project.id}/keys/members`,
      { id: project.id },
      { method: "GET", token },
    );
    const memberKeys = (members.body as { members: { userId: string; publicKey: string }[] }).members;
    expect(memberKeys.map((m) => m.userId)).toContain(userId);

    const { res, body } = await rotate(
      project.id,
      token,
      await generateDek(),
      memberKeys.map((m) => ({ subjectUserId: m.userId, publicKey: m.publicKey })),
      [envVar.id],
    );
    expectStatus(res, 409);
    expect((body as { error: string }).error).toMatch(/don't match the project's current members/);
  });

  test("rotation re-seals to a live deploy key and the pipeline keeps working", async () => {
    const { project, env, token, envVar } = await setup();
    const issued = await issue(project.id, token);

    const members = await call(
      listProjectKeyMembers,
      `/api/projects/${project.id}/keys/members`,
      { id: project.id },
      { method: "GET", token },
    );
    const parsed = members.body as {
      members: { userId: string; publicKey: string }[];
      deployKeys: { subjectId: string; publicKey: string }[];
    };

    const newDek = await generateDek();
    const { res } = await rotate(
      project.id,
      token,
      newDek,
      [
        ...parsed.members.map((m) => ({ subjectUserId: m.userId, publicKey: m.publicKey })),
        ...parsed.deployKeys.map((d) => ({ subjectUserId: d.subjectId, publicKey: d.publicKey })),
      ],
      [envVar.id],
    );
    expectStatus(res, 200);

    // Same pipeline credential, new DEK, and it opens — which is the whole
    // point: rotating a project must not require re-issuing every CI secret.
    const exported = await ciExport(env.id, issued.body.token, issued.keypair.publicKey);
    expectStatus(exported.res, 200);
    const opened = await unsealWithPrivateKey(
      exported.body!.wrappedDek as string,
      issued.keypair.publicKey,
      issued.keypair.privateKey,
    );
    expect(decodeBase64(opened)).toEqual(newDek);
    expect(exported.body!.keyVersion).toBe(2);
  });
});
