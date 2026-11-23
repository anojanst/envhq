import { beforeAll, describe, expect, test } from "vitest";
import { testDb } from "@/test-support/db";
import { environmentVersions, userProfiles } from "@/db/schema";
import {
  grantOrgRole,
  resetContractWorld,
  createProject,
  createEnvironment,
  createApiToken,
} from "@/test-support/contract-seed";
import { getDisplayNames } from "@/lib/user-profiles";
import { call, expectStatus } from "./helpers";

import { GET as listVersions } from "@/app/api/environments/[id]/versions/route";

/**
 * RM-6: display names come from the local `user_profiles` mirror. Since
 * self-hosting phase 3 that mirror is written at every sign-in from the
 * identity provider's claims, and nothing on the request path asks the
 * provider anything.
 */

const AUTHOR_COUNT = 50;

beforeAll(resetContractWorld);

async function environmentWithAuthors(authorIds: string[]) {
  const orgId = `org-${crypto.randomUUID()}`;
  const userId = `user-${crypto.randomUUID()}`;
  await grantOrgRole(userId, orgId, "admin");
  const project = await createProject(orgId);
  const environment = await createEnvironment(project.id);
  const { token } = await createApiToken(userId);

  await testDb.insert(environmentVersions).values(
    authorIds.map((createdBy, i) => ({
      environmentId: environment.id,
      version: i + 1,
      snapshot: [],
      createdBy,
    })),
  );
  return { environment, token };
}

function authorIds(n: number, prefix: string): string[] {
  return Array.from({ length: n }, (_, i) => `${prefix}_${String(i).padStart(3, "0")}`);
}

describe("version history with many distinct authors", () => {
  test(`${AUTHOR_COUNT} authors with profiles are all named`, async () => {
    const ids = authorIds(AUTHOR_COUNT, "user_known");
    const { environment, token } = await environmentWithAuthors(ids);

    // The steady state: every author has signed in at least once.
    await testDb
      .insert(userProfiles)
      .values(ids.map((userId, i) => ({ userId, name: `Author ${i}`, email: null, imageUrl: null })));

    const path = `/api/environments/${environment.id}/versions`;
    const { res, body } = await call(listVersions, path, { id: environment.id }, { method: "GET", token });

    expectStatus(res, 200);
    const versions = (body as { versions: { createdBy: string; createdByName: string }[] }).versions;
    expect(versions).toHaveLength(AUTHOR_COUNT);
    expect(new Set(versions.map((v) => v.createdBy)).size).toBe(AUTHOR_COUNT);
    for (const v of versions) expect(v.createdByName).toMatch(/^Author \d+$/);
  });

  test("authors who never signed in show as raw ids and don't fail the page", async () => {
    const ids = authorIds(3, "user_unknown");
    const { environment, token } = await environmentWithAuthors(ids);

    const path = `/api/environments/${environment.id}/versions`;
    const { res, body } = await call(listVersions, path, { id: environment.id }, { method: "GET", token });

    expectStatus(res, 200);
    const versions = (body as { versions: { createdBy: string; createdByName: string }[] }).versions;
    for (const v of versions) expect(v.createdByName).toBe(v.createdBy);
  });

  test("getDisplayNames returns an entry for every id asked for", async () => {
    const names = await getDisplayNames(["user_absent_a", "user_absent_b", "user_absent_a"]);
    expect(Object.keys(names).sort()).toEqual(["user_absent_a", "user_absent_b"]);
    expect(names.user_absent_a).toBe("user_absent_a");
  });
});
