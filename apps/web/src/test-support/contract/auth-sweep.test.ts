import { describe, test } from "vitest";
import { call, expectStatus, type Handler } from "./helpers";

import { POST as cliAuthorize } from "@/app/api/v1/cli/authorize/route";
import { POST as commitEnvironment } from "@/app/api/v1/environments/[id]/commit/route";
import { GET as exportEnvironment } from "@/app/api/v1/environments/[id]/export/route";
import { POST as importEnvironment } from "@/app/api/v1/environments/[id]/import/route";
import {
  GET as getEnvironment,
  PATCH as patchEnvironment,
  DELETE as deleteEnvironment,
} from "@/app/api/v1/environments/[id]/route";
import { POST as upsertEnvironmentVar } from "@/app/api/v1/environments/[id]/vars/route";
import { POST as rollbackEnvironment } from "@/app/api/v1/environments/[id]/versions/[version]/rollback/route";
import { GET as listEnvironmentVersions } from "@/app/api/v1/environments/[id]/versions/route";
import { DELETE as removeGroupMember } from "@/app/api/v1/groups/[id]/members/[userId]/route";
import { GET as listGroupMembers, POST as addGroupMember } from "@/app/api/v1/groups/[id]/members/route";
import { DELETE as deleteGroup } from "@/app/api/v1/groups/[id]/route";
import { GET as listGroups, POST as createGroup } from "@/app/api/v1/groups/route";
import { GET as getMe } from "@/app/api/v1/me/route";
import { GET as listOrgMembers } from "@/app/api/v1/orgs/members/route";
import { GET as listMyOrgs } from "@/app/api/v1/orgs/route";
import { DELETE as deleteAccessGrant } from "@/app/api/v1/projects/[id]/access/[grantId]/route";
import { GET as listAccessGroupOptions } from "@/app/api/v1/projects/[id]/access/groups/route";
import { GET as listAccessMemberOptions } from "@/app/api/v1/projects/[id]/access/members/route";
import { GET as listProjectAccess, POST as upsertProjectAccess } from "@/app/api/v1/projects/[id]/access/route";
import { POST as createProjectEnvironment } from "@/app/api/v1/projects/[id]/environments/route";
import { GET as getMyProjectKey } from "@/app/api/v1/projects/[id]/keys/me/route";
import { GET as listProjectKeyMembers } from "@/app/api/v1/projects/[id]/keys/members/route";
import { GET as listPendingProjectKeyMembers } from "@/app/api/v1/projects/[id]/keys/pending/route";
import { POST as finalizeRotation } from "@/app/api/v1/projects/[id]/keys/rotate/finalize/route";
import { POST as migrateRotationBatch } from "@/app/api/v1/projects/[id]/keys/rotate/route";
import { GET as getRotationStatus } from "@/app/api/v1/projects/[id]/keys/rotation-status/route";
import { POST as registerProjectKey } from "@/app/api/v1/projects/[id]/keys/route";
import { GET as getProject, PATCH as patchProject, DELETE as deleteProject } from "@/app/api/v1/projects/[id]/route";
import { GET as listProjects, POST as createProject } from "@/app/api/v1/projects/route";
import { DELETE as deleteToken } from "@/app/api/v1/tokens/[id]/route";
import { GET as listTokens, POST as createToken } from "@/app/api/v1/tokens/route";
import { GET as getMyUserKeys, POST as createMyUserKeys } from "@/app/api/v1/users/me/keys/route";
import { PATCH as updateVar, DELETE as deleteVar } from "@/app/api/v1/vars/[id]/route";

/**
 * Every route except `POST /api/v1/cli/token` calls `getUserId(req)` and 401s
 * before touching path params, body, or the database — so a single sweep
 * with fabricated ids and no bearer token exercises all of them cheaply,
 * without needing any seeded state. Per-route success paths and the
 * business-logic error cases live in the resource-grouped test files.
 */

const id = () => crypto.randomUUID();

type Case = [name: string, method: string, path: string, handler: Handler, params: Record<string, string>];

const cases: Case[] = [];

// Generic over each route's real params shape (e.g. `{ id: string }` vs.
// `{ id: string; grantId: string }`) so the concrete handlers imported
// above type-check here, then erased to `Handler` for storage since the
// array itself is heterogeneous — every case is still invoked with the
// exact params object it was registered with.
function unauthed<P extends Record<string, string>>(
  name: string,
  method: string,
  path: string,
  handler: Handler<P>,
  params: P = {} as P,
) {
  cases.push([name, method, path, handler as Handler, params]);
}

const envId = id();
const versionParam = "1";
const groupId = id();
const memberUserId = id();
const grantId = id();
const projectId = id();
const tokenId = id();
const varId = id();

unauthed("POST /api/v1/cli/authorize", "POST", "/api/v1/cli/authorize", cliAuthorize);
unauthed("POST /api/v1/environments/{id}/commit", "POST", `/api/v1/environments/${envId}/commit`, commitEnvironment, { id: envId });
unauthed("GET /api/v1/environments/{id}/export", "GET", `/api/v1/environments/${envId}/export`, exportEnvironment, { id: envId });
unauthed("POST /api/v1/environments/{id}/import", "POST", `/api/v1/environments/${envId}/import`, importEnvironment, { id: envId });
unauthed("GET /api/v1/environments/{id}", "GET", `/api/v1/environments/${envId}`, getEnvironment, { id: envId });
unauthed("PATCH /api/v1/environments/{id}", "PATCH", `/api/v1/environments/${envId}`, patchEnvironment, { id: envId });
unauthed("DELETE /api/v1/environments/{id}", "DELETE", `/api/v1/environments/${envId}`, deleteEnvironment, { id: envId });
unauthed("POST /api/v1/environments/{id}/vars", "POST", `/api/v1/environments/${envId}/vars`, upsertEnvironmentVar, { id: envId });
unauthed(
  "POST /api/v1/environments/{id}/versions/{version}/rollback",
  "POST",
  `/api/v1/environments/${envId}/versions/${versionParam}/rollback`,
  rollbackEnvironment,
  { id: envId, version: versionParam },
);
unauthed("GET /api/v1/environments/{id}/versions", "GET", `/api/v1/environments/${envId}/versions`, listEnvironmentVersions, { id: envId });
unauthed(
  "DELETE /api/v1/groups/{id}/members/{userId}",
  "DELETE",
  `/api/v1/groups/${groupId}/members/${memberUserId}`,
  removeGroupMember,
  { id: groupId, userId: memberUserId },
);
unauthed("GET /api/v1/groups/{id}/members", "GET", `/api/v1/groups/${groupId}/members`, listGroupMembers, { id: groupId });
unauthed("POST /api/v1/groups/{id}/members", "POST", `/api/v1/groups/${groupId}/members`, addGroupMember, { id: groupId });
unauthed("DELETE /api/v1/groups/{id}", "DELETE", `/api/v1/groups/${groupId}`, deleteGroup, { id: groupId });
unauthed("GET /api/v1/groups", "GET", "/api/v1/groups", listGroups);
unauthed("POST /api/v1/groups", "POST", "/api/v1/groups", createGroup);
unauthed("GET /api/v1/me", "GET", "/api/v1/me", getMe);
unauthed("GET /api/v1/orgs/members", "GET", "/api/v1/orgs/members", listOrgMembers);
unauthed("GET /api/v1/orgs", "GET", "/api/v1/orgs", listMyOrgs);
unauthed(
  "DELETE /api/v1/projects/{id}/access/{grantId}",
  "DELETE",
  `/api/v1/projects/${projectId}/access/${grantId}`,
  deleteAccessGrant,
  { id: projectId, grantId },
);
unauthed("GET /api/v1/projects/{id}/access/groups", "GET", `/api/v1/projects/${projectId}/access/groups`, listAccessGroupOptions, { id: projectId });
unauthed("GET /api/v1/projects/{id}/access/members", "GET", `/api/v1/projects/${projectId}/access/members`, listAccessMemberOptions, { id: projectId });
unauthed("GET /api/v1/projects/{id}/access", "GET", `/api/v1/projects/${projectId}/access`, listProjectAccess, { id: projectId });
unauthed("POST /api/v1/projects/{id}/access", "POST", `/api/v1/projects/${projectId}/access`, upsertProjectAccess, { id: projectId });
unauthed("POST /api/v1/projects/{id}/environments", "POST", `/api/v1/projects/${projectId}/environments`, createProjectEnvironment, { id: projectId });
unauthed("GET /api/v1/projects/{id}/keys/me", "GET", `/api/v1/projects/${projectId}/keys/me`, getMyProjectKey, { id: projectId });
unauthed("GET /api/v1/projects/{id}/keys/members", "GET", `/api/v1/projects/${projectId}/keys/members`, listProjectKeyMembers, { id: projectId });
unauthed("GET /api/v1/projects/{id}/keys/pending", "GET", `/api/v1/projects/${projectId}/keys/pending`, listPendingProjectKeyMembers, { id: projectId });
unauthed("POST /api/v1/projects/{id}/keys/rotate/finalize", "POST", `/api/v1/projects/${projectId}/keys/rotate/finalize`, finalizeRotation, { id: projectId });
unauthed("POST /api/v1/projects/{id}/keys/rotate", "POST", `/api/v1/projects/${projectId}/keys/rotate`, migrateRotationBatch, { id: projectId });
unauthed("GET /api/v1/projects/{id}/keys/rotation-status", "GET", `/api/v1/projects/${projectId}/keys/rotation-status`, getRotationStatus, { id: projectId });
unauthed("POST /api/v1/projects/{id}/keys", "POST", `/api/v1/projects/${projectId}/keys`, registerProjectKey, { id: projectId });
unauthed("GET /api/v1/projects/{id}", "GET", `/api/v1/projects/${projectId}`, getProject, { id: projectId });
unauthed("PATCH /api/v1/projects/{id}", "PATCH", `/api/v1/projects/${projectId}`, patchProject, { id: projectId });
unauthed("DELETE /api/v1/projects/{id}", "DELETE", `/api/v1/projects/${projectId}`, deleteProject, { id: projectId });
unauthed("GET /api/v1/projects", "GET", "/api/v1/projects", listProjects);
unauthed("POST /api/v1/projects", "POST", "/api/v1/projects", createProject);
unauthed("DELETE /api/v1/tokens/{id}", "DELETE", `/api/v1/tokens/${tokenId}`, deleteToken, { id: tokenId });
unauthed("GET /api/v1/tokens", "GET", "/api/v1/tokens", listTokens);
unauthed("POST /api/v1/tokens", "POST", "/api/v1/tokens", createToken);
unauthed("GET /api/v1/users/me/keys", "GET", "/api/v1/users/me/keys", getMyUserKeys);
unauthed("POST /api/v1/users/me/keys", "POST", "/api/v1/users/me/keys", createMyUserKeys);
unauthed("PATCH /api/v1/vars/{id}", "PATCH", `/api/v1/vars/${varId}`, updateVar, { id: varId });
unauthed("DELETE /api/v1/vars/{id}", "DELETE", `/api/v1/vars/${varId}`, deleteVar, { id: varId });

describe("401 without a bearer token", () => {
  test.each(cases)("%s", async (_name, method, path, handler, params) => {
    const { res } = await call(handler, path, params, { method });
    expectStatus(res, 401);
  });
});
