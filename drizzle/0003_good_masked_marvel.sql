-- NOTE: hand-reconciled with the out-of-band `*_manual.sql` migrations that were
-- already applied to drifted environments (9026 workflows.last_fired_at,
-- 9028 brain_embeddings dims, 9029 crm_contacts unique email). This generated
-- migration is the catch-up for those + platform_settings, so the catch-up
-- statements are wrapped with IF [NOT] EXISTS to apply cleanly on both fresh
-- replays and DBs where the manual files already ran. platform_settings itself
-- is the only net-new DDL for the admin-configurable email settings feature.
CREATE TABLE IF NOT EXISTS "platform_settings" (
	"key" varchar(100) PRIMARY KEY NOT NULL,
	"value" text NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP INDEX IF EXISTS "crm_contacts_client_email_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "brain_embeddings_entity_chunk_idx";--> statement-breakpoint
ALTER TABLE "brain_embeddings" ALTER COLUMN "vector" SET DATA TYPE vector(768);--> statement-breakpoint
ALTER TABLE "workflows" ADD COLUMN IF NOT EXISTS "last_fired_at" timestamp;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "crm_contacts_client_email_unique_idx" ON "crm_contacts" USING btree ("client_id","email");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "brain_embeddings_entity_chunk_idx" ON "brain_embeddings" USING btree ("client_id","entity_type","entity_id","chunk_index");
