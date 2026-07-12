-- Dedupe existing (user_id, name) collisions before the unique constraint
-- below can be added; keeps the oldest row's name, suffixes the rest.
WITH ranked AS (
	SELECT id, row_number() OVER (PARTITION BY user_id, name ORDER BY created_at, id) AS rn
	FROM "projects"
)
UPDATE "projects" p
SET name = p.name || '-' || ranked.rn
FROM ranked
WHERE p.id = ranked.id AND ranked.rn > 1;
--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_user_id_name_uq" UNIQUE("user_id","name");