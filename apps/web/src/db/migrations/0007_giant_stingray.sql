ALTER TABLE "projects" DROP CONSTRAINT "projects_user_id_name_uq";--> statement-breakpoint
DROP INDEX "projects_user_id_idx";--> statement-breakpoint
ALTER TABLE "projects" ALTER COLUMN "org_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_org_id_name_uq" UNIQUE("org_id","name");