CREATE TABLE "cli_auth_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code_hash" text NOT NULL,
	"code_challenge" text NOT NULL,
	"state" text NOT NULL,
	"user_id" text NOT NULL,
	"redirect_port" integer NOT NULL,
	"consumed_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cli_auth_requests_code_hash_unique" UNIQUE("code_hash")
);
--> statement-breakpoint
ALTER TABLE "api_tokens" ADD COLUMN "kind" text DEFAULT 'pat' NOT NULL;--> statement-breakpoint
ALTER TABLE "api_tokens" ADD COLUMN "project_id" uuid;--> statement-breakpoint
ALTER TABLE "api_tokens" ADD COLUMN "capability" text DEFAULT 'write' NOT NULL;--> statement-breakpoint
ALTER TABLE "api_tokens" ADD COLUMN "expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "api_tokens" ADD CONSTRAINT "api_tokens_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;