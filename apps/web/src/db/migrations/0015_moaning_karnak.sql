CREATE TABLE "error_events" (
	"fingerprint" text PRIMARY KEY NOT NULL,
	"route" text NOT NULL,
	"kind" text NOT NULL,
	"message" text NOT NULL,
	"release" text,
	"occurrences" integer DEFAULT 1 NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"alerted_at" timestamp with time zone,
	"muted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX "error_events_last_seen_idx" ON "error_events" USING btree ("last_seen_at");