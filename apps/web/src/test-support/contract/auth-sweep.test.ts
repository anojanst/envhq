import { describe, test } from "vitest";
import { call, expectStatus, type Handler } from "./helpers";

import { POST as cliAuthorize } from "@/app/api/cli/authorize/route";
import { POST as commitEnvironment } from "@/app/api/environments/[id]/commit/route";
import { GET as exportEnvironment } from "@/app/api/environments/[id]/export/route";
import { POST as importEnvironment } from "@/app/api/environments/[id]/import/route";
import {
  GET as getEnvironment,
  PATCH as patchEnvironment,
  DELETE as deleteEnvironment,
} from "@/app/api/environments/[id]/route";
import { POST as upsertEnvironmentVar } from "@/app/api/environments/[id]/vars/route";
import { POST as rollbackEnvironment } from "@/app/api/environments/[id]/versions/[version]/rollback/route";
import { GET as listEnvironmentVersions } from "@/app/api/environments/[id]/versions/route";
import { DELETE as removeGroupMember } from "@/app/api/groups/[id]/members/[userId]/route";
import { GET as listGroupMembers, POST as addGroupMember } from "@/app/api/groups/[id]/members/route";
import { DELETE as deleteGroup } from "@/app/api/groups/[id]/route";
import { GET as listGroups, POST as createGroup } from "@/app/api/groups/route";
import { GET as getMe } from "@/app/api/me/route";
import { GET as listOrgMembers } from "@/app/api/orgs/members/route";
import { GET as listMyOrgs } from "@/app/api/orgs/route";
import { DELETE as deleteAccessGrant } from "@/app/api/projects/[id]/access/[grantId]/route";
import { GET as listAccessGroupOptions } from "@/app/api/projects/[id]/access/groups/route";
import { GET as listAccessMemberOptions } from "@/app/api/projects/[id]/access/members/route";
import { GET as listProjectAccess, POST as upsertProjectAccess } from "@/app/api/projects/[id]/access/route";
import { POST as createProjectEnvironment } from "@/app/api/projects/[id]/environments/route";
import { GET as getMyProjectKey } from "@/app/api/projects/[id]/keys/me/route";
import { GET as listProjectKeyMembers } from "@/app/api/projects/[id]/keys/members/route";
import { GET as listPendingProjectKeyMembers } from "@/app/api/projects/[id]/keys/pending/route";
import { POST as finalizeRotation } from "@/app/api/projects/[id]/keys/rotate/finalize/route";
import { POST as migrateRotationBatch } from "@/app/api/projects/[id]/keys/rotate/route";
import { GET as getRotationStatus } from "@/app/api/projects/[id]/keys/rotation-status/route";
import { POST as registerProjectKey } from "@/app/api/projects/[id]/keys/route";
import { GET as getProject, PATCH as patchProject, DELETE as deleteProject } from "@/app/api/projects/[id]/route";
import { GET as listProjects, POST as createProject } from "@/app/api/projects/route";
import { DELETE as deleteToken } from "@/app/api/tokens/[id]/route";
import { GET as listTokens, POST as createToken } from "@/app/api/tokens/route";
import { GET as getMyUserKeys, POST as createMyUserKeys } from "@/app/api/users/me/keys/route";
import { PATCH as updateVar, DELETE as deleteVar } from "@/app/api/vars/[id]/route";

/**
 * Every route except `POST /api/cli/token` calls `getUserId(req)` and 401s
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

unauthed("POST /api/cli/authorize", "POST", "/api/cli/authorize", cliAuthorize);
unauthed("POST /api/environments/{id}/commit", "POST", `/api/environments/${envId}/commit`, commitEnvironment, { id: envId });
unauthed("GET /api/environments/{id}/export", "GET", `/api/environments/${envId}/export`, exportEnvironment, { id: envId });
unauthed("POST /api/environments/{id}/import", "POST", `/api/environments/${envId}/import`, importEnvironment, { id: envId });
unauthed("GET /api/environments/{id}", "GET", `/api/environments/${envId}`, getEnvironment, { id: envId });
unauthed("PATCH /api/environments/{id}", "PATCH", `/api/environments/${envId}`, patchEnvironment, { id: envId });
unauthed("DELETE /api/environments/{id}", "DELETE", `/api/environments/${envId}`, deleteEnvironment, { id: envId });
unauthed("POST /api/environments/{id}/vars", "POST", `/api/environments/${envId}/vars`, upsertEnvironmentVar, { id: envId });
unauthed(
  "POST /api/environments/{id}/versions/{version}/rollback",
  "POST",
  `/api/environments/${envId}/versions/${versionParam}/rollback`,
  rollbackEnvironment,
  { id: envId, version: versionParam },
);
unauthed("GET /api/environments/{id}/versions", "GET", `/api/environments/${envId}/versions`, listEnvironmentVersions, { id: envId });
unauthed(
  "DELETE /api/groups/{id}/members/{userId}",
  "DELETE",
  `/api/groups/${groupId}/members/${memberUserId}`,
  removeGroupMember,
  { id: groupId, userId: memberUserId },
);
unauthed("GET /api/groups/{id}/members", "GET", `/api/groups/${groupId}/members`, listGroupMembers, { id: groupId });
unauthed("POST /api/groups/{id}/members", "POST", `/api/groups/${groupId}/members`, addGroupMember, { id: groupId });
unauthed("DELETE /api/groups/{id}", "DELETE", `/api/groups/${groupId}`, deleteGroup, { id: groupId });
unauthed("GET /api/groups", "GET", "/api/groups", listGroups);
unauthed("POST /api/groups", "POST", "/api/groups", createGroup);
unauthed("GET /api/me", "GET", "/api/me", getMe);
unauthed("GET /api/orgs/members", "GET", "/api/orgs/members", listOrgMembers);
unauthed("GET /api/orgs", "GET", "/api/orgs", listMyOrgs);
unauthed(
  "DELETE /api/projects/{id}/access/{grantId}",
  "DELETE",
  `/api/projects/${projectId}/access/${grantId}`,
  deleteAccessGrant,
  { id: projectId, grantId },
);
unauthed("GET /api/projects/{id}/access/groups", "GET", `/api/projects/${projectId}/access/groups`, listAccessGroupOptions, { id: projectId });
unauthed("GET /api/projects/{id}/access/members", "GET", `/api/projects/${projectId}/access/members`, listAccessMemberOptions, { id: projectId });
unauthed("GET /api/projects/{id}/access", "GET", `/api/projects/${projectId}/access`, listProjectAccess, { id: projectId });
unauthed("POST /api/projects/{id}/access", "POST", `/api/projects/${projectId}/access`, upsertProjectAccess, { id: projectId });
unauthed("POST /api/projects/{id}/environments", "POST", `/api/projects/${projectId}/environments`, createProjectEnvironment, { id: projectId });
unauthed("GET /api/projects/{id}/keys/me", "GET", `/api/projects/${projectId}/keys/me`, getMyProjectKey, { id: projectId });
unauthed("GET /api/projects/{id}/keys/members", "GET", `/api/projects/${projectId}/keys/members`, listProjectKeyMembers, { id: projectId });
unauthed("GET /api/projects/{id}/keys/pending", "GET", `/api/projects/${projectId}/keys/pending`, listPendingProjectKeyMembers, { id: projectId });
unauthed("POST /api/projects/{id}/keys/rotate/finalize", "POST", `/api/projects/${projectId}/keys/rotate/finalize`, finalizeRotation, { id: projectId });
unauthed("POST /api/projects/{id}/keys/rotate", "POST", `/api/projects/${projectId}/keys/rotate`, migrateRotationBatch, { id: projectId });
unauthed("GET /api/projects/{id}/keys/rotation-status", "GET", `/api/projects/${projectId}/keys/rotation-status`, getRotationStatus, { id: projectId });
unauthed("POST /api/projects/{id}/keys", "POST", `/api/projects/${projectId}/keys`, registerProjectKey, { id: projectId });
unauthed("GET /api/projects/{id}", "GET", `/api/projects/${projectId}`, getProject, { id: projectId });
unauthed("PATCH /api/projects/{id}", "PATCH", `/api/projects/${projectId}`, patchProject, { id: projectId });
unauthed("DELETE /api/projects/{id}", "DELETE", `/api/projects/${projectId}`, deleteProject, { id: projectId });
unauthed("GET /api/projects", "GET", "/api/projects", listProjects);
unauthed("POST /api/projects", "POST", "/api/projects", createProject);
unauthed("DELETE /api/tokens/{id}", "DELETE", `/api/tokens/${tokenId}`, deleteToken, { id: tokenId });
unauthed("GET /api/tokens", "GET", "/api/tokens", listTokens);
unauthed("POST /api/tokens", "POST", "/api/tokens", createToken);
unauthed("GET /api/users/me/keys", "GET", "/api/users/me/keys", getMyUserKeys);
unauthed("POST /api/users/me/keys", "POST", "/api/users/me/keys", createMyUserKeys);
unauthed("PATCH /api/vars/{id}", "PATCH", `/api/vars/${varId}`, updateVar, { id: varId });
unauthed("DELETE /api/vars/{id}", "DELETE", `/api/vars/${varId}`, deleteVar, { id: varId });

describe("401 without a bearer token", () => {
  test.each(cases)("%s", async (_name, method, path, handler, params) => {
    const { res } = await call(handler, path, params, { method });
    expectStatus(res, 401);
  });
});
