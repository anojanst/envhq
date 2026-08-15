import { sql } from "drizzle-orm";
import { testDb } from "./db";
import {
  projects,
  environments,
  envVars,
  groups,
  groupMembers,
  accessGrants,
  apiTokens,
  userKeys,
  projectKeys,
  type Project,
  type Environment,
  type Group,
  type ApiToken,
} from "@/db/schema";
import { generateToken, hashToken } from "@/lib/crypto";
import type { Role } from "@/lib/access";
import { setOrgRole } from "@/test-support/mock-orgs";
import { setFakeOrgMembership } from "@/test-support/mock-clerk.setup";

/**
 * Programmatic DB builders for the HQ-53 contract suite — one concrete,
 * realistic scenario per route rather than `access-matrix.fixtures.json`'s
 * combinatorial dimensions (that file is purpose-built for the authorization
 * matrix). Every insert goes through real Drizzle queries against the same
 * `testDb` the "authz-db" project uses (`mock-db.setup.ts` substitutes it
 * for the production client) — no test doubles for the database itself.
 */

function uniqueSuffix(): string {
  return crypto.randomUUID().slice(0, 8);
}

export async function resetContractWorld(): Promise<void> {
  await testDb.execute(sql`
    TRUNCATE TABLE
      project_keys, user_keys, api_tokens, cli_auth_requests,
      environment_versions, env_vars, environments,
      access_grants, group_members, groups,
      projects, personal_orgs
    RESTART IDENTITY CASCADE
  `);
}

export async function createProject(orgId: string, name = `Project ${uniqueSuffix()}`): Promise<Project> {
  const [row] = await testDb.insert(projects).values({ orgId, name, userId: "seed" }).returning();
  return row!;
}

export async function createEnvironment(projectId: string, name = `env-${uniqueSuffix()}`): Promise<Environment> {
  const [row] = await testDb.insert(environments).values({ projectId, name }).returning();
  return row!;
}

export async function createEnvVar(
  environmentId: string,
  overrides: Partial<{ key: string; ciphertext: string; iv: string }> = {},
) {
  const [row] = await testDb
    .insert(envVars)
    .values({
      environmentId,
      key: overrides.key ?? `KEY_${uniqueSuffix().toUpperCase()}`,
      valueCiphertext: overrides.ciphertext ?? "stub-ciphertext",
      iv: overrides.iv ?? "stub-iv",
    })
    .returning();
  return row!;
}

export async function createGroup(orgId: string, name = `Group ${uniqueSuffix()}`): Promise<Group> {
  const [row] = await testDb.insert(groups).values({ orgId, name }).returning();
  return row!;
}

export async function addGroupMember(groupId: string, userId: string): Promise<void> {
  await testDb.insert(groupMembers).values({ groupId, userId });
}

export async function createAccessGrant(params: {
  orgId: string;
  projectId: string;
  subjectType: "user" | "group";
  subjectId: string;
  role: Role;
  envScope?: Record<string, Role> | null;
}): Promise<void> {
  await testDb.insert(accessGrants).values({
    orgId: params.orgId,
    projectId: params.projectId,
    subjectType: params.subjectType,
    subjectId: params.subjectId,
    role: params.role,
    envScope: params.envScope === undefined ? null : JSON.stringify(params.envScope),
  });
}

/** Inserts a real, hashed PAT row and returns the plaintext token to send as a Bearer header. */
export async function createApiToken(
  userId: string,
  overrides: Partial<{
    name: string;
    capability: "read" | "write";
    projectId: string | null;
    expiresAt: Date | null;
  }> = {},
): Promise<{ token: string; row: ApiToken }> {
  const token = generateToken();
  const [row] = await testDb
    .insert(apiTokens)
    .values({
      userId,
      name: overrides.name ?? `token-${uniqueSuffix()}`,
      tokenHash: hashToken(token),
      kind: "pat",
      capability: overrides.capability ?? "write",
      projectId: overrides.projectId ?? null,
      expiresAt: overrides.expiresAt ?? null,
    })
    .returning();
  return { token, row: row! };
}

export async function createUserKeys(userId: string): Promise<void> {
  await testDb.insert(userKeys).values({
    userId,
    publicKey: `pub-${uniqueSuffix()}`,
    kdfSalt: `salt-${uniqueSuffix()}`,
    kdfT: 3,
    kdfM: 65536,
    kdfP: 4,
    wrappedPrivateKey: `wpk-${uniqueSuffix()}`,
    wrappedPrivateKeyNonce: `wpkn-${uniqueSuffix()}`,
    wrappedPrivateKeyByRecovery: `wpkr-${uniqueSuffix()}`,
    wrappedPrivateKeyByRecoveryNonce: `wpkrn-${uniqueSuffix()}`,
  });
}

export async function createProjectKey(projectId: string, subjectUserId: string, wrappedByUserId = subjectUserId): Promise<void> {
  await testDb.insert(projectKeys).values({
    projectId,
    subjectUserId,
    wrappedDek: `wrapped-dek-${uniqueSuffix()}`,
    wrappedByUserId,
  });
}

/** Bearer auth header for a plaintext token from `createApiToken`. */
export function bearer(token: string): HeadersInit {
  return { authorization: `Bearer ${token}` };
}

/**
 * Grants `userId` a Clerk org role for `orgId`, keeping both fakes that
 * back it in sync: `mock-orgs.ts`'s map (read by every `@/lib/orgs` export
 * called through its normal module boundary, e.g. from `access.ts`) and
 * `mock-clerk.setup.ts`'s fake membership list (read by `getClerkOrgRole`
 * when it's reached via `resolveRequestedOrgId`'s same-module call, which
 * bypasses the `@/lib/orgs` mock entirely). Always use this instead of
 * calling `setOrgRole` directly in contract tests.
 */
export function grantOrgRole(userId: string, orgId: string, role: "admin" | "member"): void {
  setOrgRole(userId, orgId, role);
  setFakeOrgMembership({ userId, orgId, role });
}
