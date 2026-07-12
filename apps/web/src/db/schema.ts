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
 * A project owned by a single Clerk user (v1 is personal-only — every row is
 * scoped by `userId` and access checks always filter on it). Name is unique
 * per owner.
 */
export const projects = pgTable(
  "projects",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id").notNull(),
    name: text("name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    unique("projects_user_id_name_uq").on(t.userId, t.name),
    index("projects_user_id_idx").on(t.userId),
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
 * A single key/value pair inside an environment. The value is encrypted at
 * rest with AES-256-GCM: `valueCiphertext` + per-value `iv` + `authTag`.
 * Key is unique within its environment.
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
    authTag: text("auth_tag").notNull(),
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
  authTag: string;
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
