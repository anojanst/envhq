import { relations, sql } from "drizzle-orm";
import {
  pgTable,
  uuid,
  text,
  integer,
  timestamp,
  unique,
  uniqueIndex,
  index,
  jsonb,
} from "drizzle-orm/pg-core";

/**
 * A project owned by an org (M5 — every user has a Clerk-Organization-backed
 * personal org; `orgId` is the auth scope). `userId` is kept as the creator,
 * audit-only now. Name is unique per org (was per creator, pre-M5).
 */
export const projects = pgTable(
  "projects",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id").notNull(),
    orgId: text("org_id").notNull(),
    name: text("name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    unique("projects_org_id_name_uq").on(t.orgId, t.name),
    index("projects_org_id_idx").on(t.orgId),
  ],
);

/**
 * Maps a Clerk userId to their auto-provisioned personal Clerk Organization
 * (M5). `userId` is the primary key so `INSERT ... ON CONFLICT (user_id) DO
 * NOTHING RETURNING org_id` is the atomic get-or-create primitive — this
 * table exists specifically because the app's Postgres driver
 * (`neon-http`, stateless HTTP, no session) can't support
 * `db.transaction()` or session-scoped advisory locks, so the usual
 * check-then-create race guard isn't available; a unique-constrained insert
 * is. Also avoids a Clerk membership-list API round trip on every request
 * that needs org context.
 */
export const personalOrgs = pgTable("personal_orgs", {
  userId: text("user_id").primaryKey(),
  orgId: text("org_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

/**
 * A user's zero-knowledge identity (M6 PR1) — one row per Clerk user, keyed
 * by `userId` like `personalOrgs`. Holds the X25519 User Keypair's public
 * key in the clear plus the private key wrapped two independent ways: under
 * the passphrase-derived Master Key (day-to-day unlock) and under a
 * separately generated Recovery Key (PLAN.md §6's mandatory Recovery Kit —
 * the only other way in if the passphrase is lost). The server only ever
 * sees ciphertext here; wrapping/unwrapping happens client-side via
 * `@envhq/crypto`. `kdfT`/`kdfM`/`kdfP` are the Argon2id cost parameters
 * used for this user's Master Key derivation (`@envhq/crypto`'s
 * `KdfLimits`), persisted so re-deriving on a future unlock uses the same
 * work factor even if the app's own default later changes.
 */
export const userKeys = pgTable("user_keys", {
  userId: text("user_id").primaryKey(),
  publicKey: text("public_key").notNull(),
  kdfSalt: text("kdf_salt").notNull(),
  kdfT: integer("kdf_t").notNull(),
  kdfM: integer("kdf_m").notNull(),
  kdfP: integer("kdf_p").notNull(),
  wrappedPrivateKey: text("wrapped_private_key").notNull(),
  wrappedPrivateKeyNonce: text("wrapped_private_key_nonce").notNull(),
  wrappedPrivateKeyByRecovery: text("wrapped_private_key_by_recovery").notNull(),
  wrappedPrivateKeyByRecoveryNonce: text("wrapped_private_key_by_recovery_nonce").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

/**
 * A project's Data Encryption Key (M6 PR2), wrapped per member — one row per
 * (project, user) who currently holds a usable copy of the DEK. DEK
 * granularity is per-*project*, not per-environment, because
 * `cloneVars`/`restoreSnapshot` copy `env_vars` ciphertext directly across
 * environments within a project with no decrypt/re-encrypt step; a
 * per-environment DEK would break that. `wrappedDek` is sealed
 * (`@envhq/crypto`'s `sealToPublicKey`) to `subjectUserId`'s public key from
 * `userKeys` — only that user's private key can open it, so the server
 * never holds a usable DEK. This PR only ever self-registers a wrap for the
 * project's creator; wrapping the DEK to *other* members (sharing) is PR6.
 */
export const projectKeys = pgTable(
  "project_keys",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    subjectUserId: text("subject_user_id").notNull(),
    wrappedDek: text("wrapped_dek").notNull(),
    wrappedByUserId: text("wrapped_by_user_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    unique("project_keys_project_id_subject_user_id_uq").on(t.projectId, t.subjectUserId),
    index("project_keys_project_id_idx").on(t.projectId),
  ],
);

/**
 * An environment under a project (dev, qa, staging, uat, prod, ...).
 * Unlimited per project; name is unique within its project.
 */
export const environments = pgTable(
  "environments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /**
     * Server-owned version counter (M4 — linear, no branches). Bumped only by
     * an atomic `UPDATE ... WHERE version = $current RETURNING version` (see
     * the commit route) so concurrent commits can never race for the same
     * version number.
     */
    version: integer("version").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    unique("environments_project_name_uq").on(t.projectId, t.name),
    index("environments_project_id_idx").on(t.projectId),
  ],
);

/**
 * A single key/value pair inside an environment. The value is
 * zero-knowledge encrypted client-side (M6 PR4) under the project's DEK
 * (`project_keys`) with XChaCha20-Poly1305 (`@envhq/crypto`'s
 * `encryptValue`) — `valueCiphertext` (tag included) + per-value `iv`
 * (an AEAD nonce despite the legacy column name, kept to avoid a rename
 * migration). `authTag` is nullable and unused for new writes: unlike
 * AES-256-GCM, XChaCha20-Poly1305's tag is embedded in the ciphertext
 * output, so there's nothing separate to store. The server only ever
 * stores/returns this ciphertext blob; it cannot decrypt it. Key is unique
 * within its environment.
 */
export const envVars = pgTable(
  "env_vars",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    environmentId: uuid("environment_id")
      .notNull()
      .references(() => environments.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    valueCiphertext: text("value_ciphertext").notNull(),
    iv: text("iv").notNull(),
    authTag: text("auth_tag"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    // Partial: only active (non-deleted) rows are constrained, so a
    // soft-deleted key can be re-created without colliding with its tombstone.
    uniqueIndex("env_vars_environment_key_uq")
      .on(t.environmentId, t.key)
      .where(sql`${t.deletedAt} is null`),
    index("env_vars_environment_id_idx").on(t.environmentId),
  ],
);

/** One entry in an `environmentVersions.snapshot` array. */
export interface VersionSnapshotEntry {
  key: string;
  valueCiphertext: string;
  iv: string;
  authTag: string | null;
}

/**
 * A full snapshot of an environment's active vars at one version (M4). Written
 * once per successful commit, alongside the atomic bump of
 * `environments.version` — never mutated afterward. Ciphertext is copied
 * directly from `env_vars` (same "copy, don't decrypt" pattern as
 * `cloneVars`), so no plaintext ever touches this table.
 */
export const environmentVersions = pgTable(
  "environment_versions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    environmentId: uuid("environment_id")
      .notNull()
      .references(() => environments.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    message: text("message"),
    snapshot: jsonb("snapshot").notNull().$type<VersionSnapshotEntry[]>(),
    createdBy: text("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    unique("environment_versions_environment_version_uq").on(t.environmentId, t.version),
    index("environment_versions_environment_id_idx").on(t.environmentId),
  ],
);

/**
 * Personal access token for CLI auth. Only the SHA-256 hash of the token is
 * stored; the plaintext is shown to the user exactly once at creation time.
 *
 * `kind` distinguishes short-lived browser-login sessions (`cli_session`, minted
 * by the PKCE loopback flow, expire in 7 days) from user-created CI tokens
 * (`pat`). `expiresAt` null means non-expiring (legacy rows). `projectId` +
 * `capability` scope a PAT to one project and to read-only or read/write; null
 * project = all projects (enforcement lands in M1 PR3).
 */
export const apiTokens = pgTable(
  "api_tokens",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id").notNull(),
    name: text("name").notNull(),
    tokenHash: text("token_hash").notNull().unique(),
    kind: text("kind").notNull().default("pat"),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }),
    capability: text("capability").notNull().default("write"),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("api_tokens_user_id_idx").on(t.userId)],
);

/**
 * Short-lived one-time codes backing the CLI browser-login (PKCE) exchange.
 * Created when a signed-in user approves a CLI login; consumed once when the CLI
 * exchanges `code + verifier` for a real token. Rows are single-use
 * (`consumedAt`) and expire quickly (`expiresAt`).
 */
export const cliAuthRequests = pgTable(
  "cli_auth_requests",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    codeHash: text("code_hash").notNull().unique(),
    codeChallenge: text("code_challenge").notNull(),
    state: text("state").notNull(),
    userId: text("user_id").notNull(),
    redirectPort: integer("redirect_port").notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
);

/**
 * An org-scoped named group of users (M5). No CRUD/routes yet — the schema
 * ships ahead of the group-management UI so `access_grants` can target a
 * group from day one.
 */
export const groups = pgTable(
  "groups",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: text("org_id").notNull(),
    name: text("name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    unique("groups_org_id_name_uq").on(t.orgId, t.name),
    index("groups_org_id_idx").on(t.orgId),
  ],
);

/** Membership of a Clerk user in a `groups` row. */
export const groupMembers = pgTable(
  "group_members",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    groupId: uuid("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    unique("group_members_group_id_user_id_uq").on(t.groupId, t.userId),
    index("group_members_group_id_idx").on(t.groupId),
    index("group_members_user_id_idx").on(t.userId),
  ],
);

/**
 * Project-level access grant (M5), to a user or a group. Effective role is
 * the highest-ranked grant across direct + group membership, unioned with
 * automatic admin access for Clerk org owner/admin (resolved in
 * `lib/access.ts`, not stored here). `envScope` (PLAN.md §8) is a JSON text
 * blob of `{ [envName]: Role }` — a per-environment cap on this grant's role
 * (e.g. Editor project-wide, Viewer-only in `prod`); an env absent from the
 * map is uncapped. Enforced in `lib/access.ts`'s `getAccessibleEnvironment`/
 * `getAccessibleVar` only — project-level actions ignore it.
 */
export const accessGrants = pgTable(
  "access_grants",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: text("org_id").notNull(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    subjectType: text("subject_type").notNull(),
    subjectId: text("subject_id").notNull(),
    role: text("role").notNull(),
    envScope: text("env_scope"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    unique("access_grants_project_subject_uq").on(t.projectId, t.subjectType, t.subjectId),
    index("access_grants_org_id_idx").on(t.orgId),
  ],
);

export const projectsRelations = relations(projects, ({ many }) => ({
  environments: many(environments),
}));

export const environmentsRelations = relations(environments, ({ one, many }) => ({
  project: one(projects, {
    fields: [environments.projectId],
    references: [projects.id],
  }),
  envVars: many(envVars),
  versions: many(environmentVersions),
}));

export const envVarsRelations = relations(envVars, ({ one }) => ({
  environment: one(environments, {
    fields: [envVars.environmentId],
    references: [environments.id],
  }),
}));

export const environmentVersionsRelations = relations(environmentVersions, ({ one }) => ({
  environment: one(environments, {
    fields: [environmentVersions.environmentId],
    references: [environments.id],
  }),
}));

export type Project = typeof projects.$inferSelect;
export type Environment = typeof environments.$inferSelect;
export type EnvVar = typeof envVars.$inferSelect;
export type EnvironmentVersion = typeof environmentVersions.$inferSelect;
export type ApiToken = typeof apiTokens.$inferSelect;
export type CliAuthRequest = typeof cliAuthRequests.$inferSelect;
export type Group = typeof groups.$inferSelect;
export type GroupMember = typeof groupMembers.$inferSelect;
export type AccessGrant = typeof accessGrants.$inferSelect;
export type PersonalOrg = typeof personalOrgs.$inferSelect;
export type UserKeys = typeof userKeys.$inferSelect;
export type ProjectKeys = typeof projectKeys.$inferSelect;
