ALTER TABLE "env_vars" ADD COLUMN "key_version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "environment_versions" ADD COLUMN "key_version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "project_keys" ADD COLUMN "key_version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "key_version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "key_rotation_pending" boolean DEFAULT false NOT NULL;