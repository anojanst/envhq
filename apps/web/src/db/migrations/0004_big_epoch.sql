CREATE TABLE "environment_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"environment_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"message" text,
	"snapshot" jsonb NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "environment_versions_environment_version_uq" UNIQUE("environment_id","version")
);
--> statement-breakpoint
ALTER TABLE "environments" ADD COLUMN "version" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "environment_versions" ADD CONSTRAINT "environment_versions_environment_id_environments_id_fk" FOREIGN KEY ("environment_id") REFERENCES "public"."environments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "environment_versions_environment_id_idx" ON "environment_versions" USING btree ("environment_id");