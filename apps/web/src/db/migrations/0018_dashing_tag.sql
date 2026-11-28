-- Crypto suite v2 clean break (docs/CRYPTO_SUITE.md).
--
-- Everything encrypted under the retired suite (XChaCha20-Poly1305 / X25519 /
-- Argon2id) is deleted: no current client can read it, and the server can't
-- re-encrypt it — it never holds a key. Projects, environments, variable-free
-- structure, orgs, members, grants and personal tokens are kept; each user
-- sets up encryption again on their next visit.
--
-- Idempotent: every statement is a no-op on an already-migrated database.

-- Deploy keys: their tokens go with them (revoking a token deletes its row).
DELETE FROM "api_tokens" WHERE "id" IN (SELECT "token_id" FROM "deploy_keys" WHERE "token_id" IS NOT NULL);--> statement-breakpoint
DELETE FROM "deploy_keys";--> statement-breakpoint
DELETE FROM "environment_versions";--> statement-breakpoint
DELETE FROM "env_vars";--> statement-breakpoint
UPDATE "environments" SET "version" = 0 WHERE "version" <> 0;--> statement-breakpoint
DELETE FROM "project_keys";--> statement-breakpoint
UPDATE "projects" SET "key_version" = 1, "key_rotation_pending" = false WHERE "key_version" <> 1 OR "key_rotation_pending";--> statement-breakpoint
DELETE FROM "user_keys";--> statement-breakpoint

-- PBKDF2 replaces Argon2id. The Argon2id columns stay (nullable, unwritten)
-- until a later migration drops them, so code from before this deploy can
-- still read the table during the rollout window.
ALTER TABLE "user_keys" ALTER COLUMN "kdf_t" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "user_keys" ALTER COLUMN "kdf_m" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "user_keys" ALTER COLUMN "kdf_p" DROP NOT NULL;--> statement-breakpoint
-- NOT NULL also stops old code from writing a v1 identity after this runs.
ALTER TABLE "user_keys" ADD COLUMN IF NOT EXISTS "kdf_iterations" integer NOT NULL;
