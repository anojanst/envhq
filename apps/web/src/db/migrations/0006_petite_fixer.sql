CREATE TABLE "personal_orgs" (
	"user_id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
