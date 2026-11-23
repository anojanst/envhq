CREATE TABLE "org_invites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" text NOT NULL,
	"token_hash" text NOT NULL,
	"role" text NOT NULL,
	"created_by_user_id" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"accepted_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "org_invites_token_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "org_invites_role_ck" CHECK ("org_invites"."role" in ('admin', 'member'))
);
--> statement-breakpoint
ALTER TABLE "org_invites" ADD CONSTRAINT "org_invites_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "org_invites_org_id_idx" ON "org_invites" USING btree ("org_id");