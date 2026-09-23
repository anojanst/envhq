CREATE TABLE "deploy_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"environment_id" uuid,
	"public_key" text NOT NULL,
	"label" text NOT NULL,
	"created_by_user_id" text NOT NULL,
	"token_id" uuid,
	"last_used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"revoked_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "deploy_keys_project_id_public_key_uq" UNIQUE("project_id","public_key")
);
--> statement-breakpoint
ALTER TABLE "deploy_keys" ADD CONSTRAINT "deploy_keys_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deploy_keys" ADD CONSTRAINT "deploy_keys_environment_id_environments_id_fk" FOREIGN KEY ("environment_id") REFERENCES "public"."environments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deploy_keys" ADD CONSTRAINT "deploy_keys_token_id_api_tokens_id_fk" FOREIGN KEY ("token_id") REFERENCES "public"."api_tokens"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "deploy_keys_project_id_idx" ON "deploy_keys" USING btree ("project_id");