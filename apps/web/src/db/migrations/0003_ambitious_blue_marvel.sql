ALTER TABLE "env_vars" DROP CONSTRAINT "env_vars_environment_key_uq";--> statement-breakpoint
ALTER TABLE "env_vars" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX "env_vars_environment_key_uq" ON "env_vars" USING btree ("environment_id","key") WHERE "env_vars"."deleted_at" is null;