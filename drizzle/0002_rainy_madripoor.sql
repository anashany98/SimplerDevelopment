CREATE TABLE "channel_provider_configs" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id" integer NOT NULL,
	"provider" varchar(32) DEFAULT 'meta' NOT NULL,
	"public_id" varchar(36) NOT NULL,
	"app_id" varchar(64) NOT NULL,
	"app_secret_encrypted" text NOT NULL,
	"login_config_id" varchar(64) NOT NULL,
	"webhook_verify_token_encrypted" text NOT NULL,
	"configured_by_user_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "channel_provider_configs" ADD CONSTRAINT "channel_provider_configs_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_provider_configs" ADD CONSTRAINT "channel_provider_configs_configured_by_user_id_users_id_fk" FOREIGN KEY ("configured_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "channel_provider_configs_tenant_idx" ON "channel_provider_configs" USING btree ("client_id","provider");--> statement-breakpoint
CREATE UNIQUE INDEX "channel_provider_configs_public_idx" ON "channel_provider_configs" USING btree ("public_id");