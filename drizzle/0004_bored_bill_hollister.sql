ALTER TABLE "crm_contracts" ALTER COLUMN "currency" SET DEFAULT 'EUR';--> statement-breakpoint
ALTER TABLE "crm_deals" ALTER COLUMN "currency" SET DEFAULT 'EUR';--> statement-breakpoint
ALTER TABLE "crm_proposals" ALTER COLUMN "currency" SET DEFAULT 'EUR';--> statement-breakpoint
ALTER TABLE "store_settings" ALTER COLUMN "currency" SET DEFAULT 'EUR';