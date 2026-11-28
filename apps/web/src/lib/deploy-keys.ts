import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/db";
import { apiTokens, deployKeys, environments, projectKeys, projects, type DeployKey } from "@/db/schema";
import { generateToken, hashToken } from "@/lib/crypto";

/**
 * Deploy keys (RM-11) — the machine half of pipeline access, designed in
 * docs/DEPLOY_KEYS.md (ADR-020).
 *
 * A pipeline holds two secrets and needs both: an **API token** to fetch
 * ciphertext, and a **deploy key** to decrypt it. The split is the design's
 * main security property. They live in the same place, so a total CI
 * compromise yields both and this claims nothing otherwise — what it buys is
 * that the *partial* compromises, which are the common ones, are survivable:
 * a token in a build log, an over-broad token scope, or a stolen copy of
 * EnvHQ's database yields no plaintext on its own.
 *
 * The server never holds the private half and has no way to obtain it. Every
 * function here deals in public keys and sealed blobs.
 */

/**
 * `project_keys.subject_user_id` for a deploy key.
 *
 * A deploy key is deliberately **not** a member. Hanging the pipeline's wrap
 * off the engineer who created it fails in both directions, and both are
 * routine: deprovisioning that engineer silently breaks production deploys,
 * and revoking a compromised pipeline key revokes a working employee.
 *
 * The prefix is unspoofable because Clerk user ids are `user_…` and no path
 * accepts a subject id from a client — `finalizeRotation` computes the
 * expected set server-side and rejects anything that doesn't match it
 * exactly, which is what stops a forged `deploy:` wrap being inserted.
 */
const DEPLOY_SUBJECT_PREFIX = "deploy:";

export function deploySubjectId(deployKeyId: string): string {
  return `${DEPLOY_SUBJECT_PREFIX}${deployKeyId}`;
}

export function isDeploySubjectId(subjectId: string): boolean {
  return subjectId.startsWith(DEPLOY_SUBJECT_PREFIX);
}

/** What the browser shows once and never again. */
export interface IssuedDeployKey {
  deployKey: DeployKey;
  /** The API token, in the clear. Only ever returned from `createDeployKey`. */
  token: string;
}

export interface CreateDeployKeyInput {
  projectId: string;
  /** NULL for the whole project. An authorization cap, not an isolation boundary. */
  environmentId: string | null;
  label: string;
  /** Base64 raw P-256 public point, generated in the caller's browser. */
  publicKey: string;
  /** The project DEK sealed to `publicKey`, also by the caller's browser. */
  wrappedDek: string;
  createdByUserId: string;
}

/**
 * Issues a deploy key: the identity row, the API token that authenticates
 * its fetches, and the `project_keys` wrap that lets it decrypt.
 *
 * Note what is *not* a parameter: the private key. It is generated in the
 * browser, displayed once, and never transmitted. A server that accepted it
 * here — even to "verify" it — would be a server that had it.
 *
 * Written in dependency order (token, key, wrap) so a failure part-way
 * leaves nothing that can decrypt: a token alone reads ciphertext, which
 * needs a wrap to be worth anything, and the wrap is written last. Not a
 * transaction, because the wrap is the only row whose absence is unsafe and
 * it is the one written last; a partial issue leaves an unusable credential,
 * never a usable one nobody knows about.
 */
export async function createDeployKey(input: CreateDeployKeyInput): Promise<IssuedDeployKey> {
  const token = generateToken();
  const [tokenRow] = await db
    .insert(apiTokens)
    .values({
      userId: input.createdByUserId,
      name: `Deploy key: ${input.label}`,
      tokenHash: hashToken(token),
      kind: "deploy",
      projectId: input.projectId,
      // A pipeline reads; it has never needed to write. Anything that wants
      // to push from CI should say so and get its own credential.
      capability: "read",
    })
    .returning();

  const [deployKey] = await db
    .insert(deployKeys)
    .values({
      projectId: input.projectId,
      environmentId: input.environmentId,
      publicKey: input.publicKey,
      label: input.label,
      createdByUserId: input.createdByUserId,
      tokenId: tokenRow!.id,
    })
    .returning();

  await db.insert(projectKeys).values({
    projectId: input.projectId,
    subjectUserId: deploySubjectId(deployKey!.id),
    wrappedDek: input.wrappedDek,
    wrappedByUserId: input.createdByUserId,
    keyVersion: (
      await db.select({ v: projects.keyVersion }).from(projects).where(eq(projects.id, input.projectId)).limit(1)
    )[0]!.v,
  });

  return { deployKey: deployKey!, token };
}

export interface DeployKeyListItem {
  id: string;
  label: string;
  environmentId: string | null;
  environmentName: string | null;
  publicKey: string;
  createdByUserId: string;
  createdAt: Date;
  lastUsedAt: Date | null;
  revokedAt: Date | null;
}

/** Every deploy key on a project, revoked ones included — a revoked key is part of the audit trail, not noise. */
export async function listDeployKeys(projectId: string): Promise<DeployKeyListItem[]> {
  return db
    .select({
      id: deployKeys.id,
      label: deployKeys.label,
      environmentId: deployKeys.environmentId,
      environmentName: environments.name,
      publicKey: deployKeys.publicKey,
      createdByUserId: deployKeys.createdByUserId,
      createdAt: deployKeys.createdAt,
      lastUsedAt: deployKeys.lastUsedAt,
      revokedAt: deployKeys.revokedAt,
    })
    .from(deployKeys)
    .leftJoin(environments, eq(environments.id, deployKeys.environmentId))
    .where(eq(deployKeys.projectId, projectId))
    .orderBy(asc(deployKeys.revokedAt), asc(deployKeys.createdAt));
}

/**
 * The subject ids of every **active** deploy key on a project.
 *
 * Load-bearing for rotation: `finalizeRotation` computes the exact set of
 * wraps it expects and deletes everything else, so a deploy key missing from
 * this list would fail every rotation as a `membership_mismatch` and then be
 * silently deleted once someone worked around that. ADR-020 requires active
 * deploy keys to be part of the expected set; this is where that set learns
 * about them.
 */
export async function listActiveDeployKeySubjectIds(projectId: string): Promise<string[]> {
  const rows = await db
    .select({ id: deployKeys.id })
    .from(deployKeys)
    .where(and(eq(deployKeys.projectId, projectId), isNull(deployKeys.revokedAt)));
  return rows.map((r) => deploySubjectId(r.id));
}

/** Active deploy keys with their public halves — what a rotation re-seals the new DEK to. */
export async function listActiveDeployKeysForRotation(
  projectId: string,
): Promise<{ subjectId: string; publicKey: string; label: string }[]> {
  const rows = await db
    .select({ id: deployKeys.id, publicKey: deployKeys.publicKey, label: deployKeys.label })
    .from(deployKeys)
    .where(and(eq(deployKeys.projectId, projectId), isNull(deployKeys.revokedAt)));
  return rows.map((r) => ({ subjectId: deploySubjectId(r.id), publicKey: r.publicKey, label: r.label }));
}

export type DeployKeyResolution =
  | { ok: true; deployKey: DeployKey; wrappedDek: string; keyVersion: number }
  | { ok: false; reason: "unknown" | "revoked" | "environment_not_allowed" };

/**
 * Resolves the deploy key a CI request presented, for one environment.
 *
 * Deliberately scoped by `projectId` — the caller passes the project the
 * environment was already authorized against, so a key belonging to another
 * project cannot be presented here even if its public half is known. Public
 * keys are public; being able to name one must not be worth anything.
 *
 * Returns the wrap and the DEK generation it belongs to. The generation is
 * what lets a pipeline tell "the project key rotated mid-job, re-run" apart
 * from a corrupt value, which ADR-020 requires it be able to do.
 */
export async function resolveDeployKey(
  projectId: string,
  environmentId: string,
  publicKey: string,
): Promise<DeployKeyResolution> {
  const [row] = await db
    .select()
    .from(deployKeys)
    .where(and(eq(deployKeys.projectId, projectId), eq(deployKeys.publicKey, publicKey)))
    .limit(1);
  if (!row) return { ok: false, reason: "unknown" };
  if (row.revokedAt) return { ok: false, reason: "revoked" };
  if (row.environmentId && row.environmentId !== environmentId) {
    return { ok: false, reason: "environment_not_allowed" };
  }

  const [wrap] = await db
    .select({ wrappedDek: projectKeys.wrappedDek, keyVersion: projectKeys.keyVersion })
    .from(projectKeys)
    .where(and(eq(projectKeys.projectId, projectId), eq(projectKeys.subjectUserId, deploySubjectId(row.id))))
    .limit(1);
  // Revoked drops the wrap, so a missing wrap on a live row means a partial
  // issue. Same answer either way: this key cannot decrypt.
  if (!wrap) return { ok: false, reason: "revoked" };

  // Best-effort, and deliberately not awaited into the response path: a
  // pipeline should not fail because the audit column was slow to write.
  void db.update(deployKeys).set({ lastUsedAt: new Date() }).where(eq(deployKeys.id, row.id));

  return { ok: true, deployKey: row, wrappedDek: wrap.wrappedDek, keyVersion: wrap.keyVersion };
}

/**
 * Revokes a deploy key: drops its wrap, kills its token, and flags the
 * project for rotation. One action, three effects, because ADR-020 is
 * explicit that leaving any of them behind is a live credential.
 *
 * What this does **not** do is make already-copied ciphertext safe. Dropping
 * a wrap stops future fetches; it does not un-learn a DEK the holder already
 * unsealed. That is why the project is flagged rotation-pending here and why
 * the UI has to say that rotating is mandatory rather than advisory.
 */
export async function revokeDeployKey(
  projectId: string,
  deployKeyId: string,
  revokedByUserId: string,
): Promise<DeployKey | undefined> {
  const [row] = await db
    .select()
    .from(deployKeys)
    .where(and(eq(deployKeys.id, deployKeyId), eq(deployKeys.projectId, projectId)))
    .limit(1);
  if (!row) return undefined;
  if (row.revokedAt) return row;

  // The wrap first: it is the one that stops decryption.
  await db
    .delete(projectKeys)
    .where(and(eq(projectKeys.projectId, projectId), eq(projectKeys.subjectUserId, deploySubjectId(row.id))));

  if (row.tokenId) {
    await db.delete(apiTokens).where(eq(apiTokens.id, row.tokenId));
  }

  const [updated] = await db
    .update(deployKeys)
    .set({ revokedAt: new Date(), revokedByUserId })
    .where(eq(deployKeys.id, row.id))
    .returning();

  await db.update(projects).set({ keyRotationPending: true }).where(eq(projects.id, projectId));

  return updated;
}

/** Revokes every deploy key on a set of projects — used where a project's access is torn down wholesale. */
export async function revokeDeployKeysForProjects(projectIds: string[], revokedByUserId: string): Promise<void> {
  if (projectIds.length === 0) return;
  const rows = await db
    .select({ id: deployKeys.id, projectId: deployKeys.projectId })
    .from(deployKeys)
    .where(and(inArray(deployKeys.projectId, projectIds), isNull(deployKeys.revokedAt)));
  for (const row of rows) {
    await revokeDeployKey(row.projectId, row.id, revokedByUserId);
  }
}
