CREATE TABLE "user_keys" (
	"user_id" text PRIMARY KEY NOT NULL,
	"public_key" text NOT NULL,
	"kdf_salt" text NOT NULL,
	"kdf_t" integer NOT NULL,
	"kdf_m" integer NOT NULL,
	"kdf_p" integer NOT NULL,
	"wrapped_private_key" text NOT NULL,
	"wrapped_private_key_nonce" text NOT NULL,
	"wrapped_private_key_by_recovery" text NOT NULL,
	"wrapped_private_key_by_recovery_nonce" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
