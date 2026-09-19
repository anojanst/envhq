CREATE TABLE "user_profiles" (
	"user_id" text PRIMARY KEY NOT NULL,
	"name" text,
	"email" text,
	"image_url" text,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhook_events" (
	"id" text PRIMARY KEY NOT NULL,
	"event_type" text NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL
);
