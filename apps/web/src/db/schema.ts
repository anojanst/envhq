import { relations } from "drizzle-orm";
import {
  pgTable,
  uuid,
  text,
  timestamp,
  unique,
  index,
} from "drizzle-orm/pg-core";

/**
 * A project owned by a single Clerk user (v1 is personal-only — every row is
 * scoped by `userId` and access checks always filter on it).
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
  (t) => [index("projects_user_id_idx").on(t.userId)],
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
  },
  (t) => [
    unique("env_vars_environment_key_uq").on(t.environmentId, t.key),
    index("env_vars_environment_id_idx").on(t.environmentId),
  ],
);

/**
 * Personal access token for CLI auth. Only the SHA-256 hash of the token is
 * stored; the plaintext is shown to the user exactly once at creation time.
 */
export const apiTokens = pgTable(
  "api_tokens",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id").notNull(),
    name: text("name").notNull(),
    tokenHash: text("token_hash").notNull().unique(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("api_tokens_user_id_idx").on(t.userId)],
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
}));

export const envVarsRelations = relations(envVars, ({ one }) => ({
  environment: one(environments, {
    fields: [envVars.environmentId],
    references: [environments.id],
  }),
}));

export type Project = typeof projects.$inferSelect;
export type Environment = typeof environments.$inferSelect;
export type EnvVar = typeof envVars.$inferSelect;
export type ApiToken = typeof apiTokens.$inferSelect;
