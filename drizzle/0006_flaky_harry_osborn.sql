CREATE TABLE "email_campaign_delivery_intents" (
	"id" serial PRIMARY KEY NOT NULL,
	"campaign_id" integer NOT NULL,
	"subscriber_id" integer NOT NULL,
	"payload" jsonb NOT NULL,
	"first_attempt_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "channel_consent" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id" integer NOT NULL,
	"contact_id" integer,
	"channel" varchar(20) NOT NULL,
	"kind" varchar(20) NOT NULL,
	"identity_value" varchar(320) NOT NULL,
	"status" varchar(10) NOT NULL,
	"source" varchar(50) DEFAULT 'manual' NOT NULL,
	"policy_version" varchar(40),
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contact_identities" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id" integer NOT NULL,
	"contact_id" integer NOT NULL,
	"kind" varchar(20) NOT NULL,
	"value" varchar(320) NOT NULL,
	"verified" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "suggested_merges" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id" integer NOT NULL,
	"contact_a_id" integer NOT NULL,
	"contact_b_id" integer NOT NULL,
	"evidence" text,
	"status" varchar(20) DEFAULT 'suggested' NOT NULL,
	"created_by" integer,
	"resolved_by" integer,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "store_checkout_reservations" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id" integer NOT NULL,
	"website_id" integer NOT NULL,
	"order_id" integer NOT NULL,
	"state" varchar(20) DEFAULT 'reserved' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"items" json NOT NULL,
	"gift_certificate_id" integer,
	"gift_certificate_amount" integer DEFAULT 0 NOT NULL,
	"discount_code" varchar(50),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "store_payment_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id" integer NOT NULL,
	"website_id" integer NOT NULL,
	"event_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "private_media_keys" (
	"key" text PRIMARY KEY NOT NULL,
	"client_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "channel_outbox" DROP CONSTRAINT "channel_outbox_message_id_chat_messages_id_fk";
--> statement-breakpoint
ALTER TABLE "channel_outbox" ALTER COLUMN "conversation_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "channel_outbox" ALTER COLUMN "message_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "channel_outbox" ALTER COLUMN "idempotency_key" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "mfa_last_used_step" bigint;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "refunded_amount" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "email_campaigns" ADD COLUMN "dispatch_plan" jsonb;--> statement-breakpoint
ALTER TABLE "channel_outbox" ADD COLUMN "contact_id" integer;--> statement-breakpoint
ALTER TABLE "channel_outbox" ADD COLUMN "channel" varchar(24) DEFAULT 'webchat' NOT NULL;--> statement-breakpoint
ALTER TABLE "channel_outbox" ADD COLUMN "provider" varchar(32) DEFAULT 'native' NOT NULL;--> statement-breakpoint
ALTER TABLE "channel_outbox" ADD COLUMN "external_message_id" varchar(255);--> statement-breakpoint
ALTER TABLE "channel_outbox" ADD COLUMN "recipient_identity" json;--> statement-breakpoint
ALTER TABLE "channel_outbox" ADD COLUMN "sender_identity" json;--> statement-breakpoint
ALTER TABLE "channel_outbox" ADD COLUMN "message_type" varchar(32) DEFAULT 'text' NOT NULL;--> statement-breakpoint
ALTER TABLE "channel_outbox" ADD COLUMN "body" text;--> statement-breakpoint
ALTER TABLE "channel_outbox" ADD COLUMN "media" json;--> statement-breakpoint
ALTER TABLE "channel_outbox" ADD COLUMN "last_error_code" varchar(100);--> statement-breakpoint
ALTER TABLE "channel_outbox" ADD COLUMN "sent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "channel_outbox" ADD COLUMN "delivered_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "channel_outbox" ADD COLUMN "read_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "channel_outbox" ADD COLUMN "failed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "chat_conversations" ADD COLUMN "connection_id" integer;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD COLUMN "connection_id" integer;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD COLUMN "sender_identity" json;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD COLUMN "recipient_identity" json;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD COLUMN "media" json;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD COLUMN "received_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "email_campaign_delivery_intents" ADD CONSTRAINT "email_campaign_delivery_intents_campaign_id_email_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."email_campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_campaign_delivery_intents" ADD CONSTRAINT "email_campaign_delivery_intents_subscriber_id_email_subscribers_id_fk" FOREIGN KEY ("subscriber_id") REFERENCES "public"."email_subscribers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_consent" ADD CONSTRAINT "channel_consent_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_consent" ADD CONSTRAINT "channel_consent_contact_id_crm_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."crm_contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_identities" ADD CONSTRAINT "contact_identities_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_identities" ADD CONSTRAINT "contact_identities_contact_id_crm_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."crm_contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suggested_merges" ADD CONSTRAINT "suggested_merges_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suggested_merges" ADD CONSTRAINT "suggested_merges_contact_a_id_crm_contacts_id_fk" FOREIGN KEY ("contact_a_id") REFERENCES "public"."crm_contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suggested_merges" ADD CONSTRAINT "suggested_merges_contact_b_id_crm_contacts_id_fk" FOREIGN KEY ("contact_b_id") REFERENCES "public"."crm_contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suggested_merges" ADD CONSTRAINT "suggested_merges_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suggested_merges" ADD CONSTRAINT "suggested_merges_resolved_by_users_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_checkout_reservations" ADD CONSTRAINT "store_checkout_reservations_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_checkout_reservations" ADD CONSTRAINT "store_checkout_reservations_website_id_client_websites_id_fk" FOREIGN KEY ("website_id") REFERENCES "public"."client_websites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_checkout_reservations" ADD CONSTRAINT "store_checkout_reservations_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_checkout_reservations" ADD CONSTRAINT "store_checkout_reservations_gift_certificate_id_gift_certificates_id_fk" FOREIGN KEY ("gift_certificate_id") REFERENCES "public"."gift_certificates"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_payment_events" ADD CONSTRAINT "store_payment_events_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_payment_events" ADD CONSTRAINT "store_payment_events_website_id_client_websites_id_fk" FOREIGN KEY ("website_id") REFERENCES "public"."client_websites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "private_media_keys" ADD CONSTRAINT "private_media_keys_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "email_delivery_campaign_subscriber_idx" ON "email_campaign_delivery_intents" USING btree ("campaign_id","subscriber_id");--> statement-breakpoint
CREATE INDEX "channel_consent_contact_channel_idx" ON "channel_consent" USING btree ("contact_id","channel");--> statement-breakpoint
CREATE INDEX "channel_consent_identity_idx" ON "channel_consent" USING btree ("client_id","channel","kind","identity_value");--> statement-breakpoint
CREATE UNIQUE INDEX "contact_identities_client_kind_value_idx" ON "contact_identities" USING btree ("client_id","kind","value");--> statement-breakpoint
CREATE INDEX "contact_identities_contact_idx" ON "contact_identities" USING btree ("contact_id");--> statement-breakpoint
CREATE UNIQUE INDEX "suggested_merges_pair_idx" ON "suggested_merges" USING btree ("client_id","contact_a_id","contact_b_id");--> statement-breakpoint
CREATE UNIQUE INDEX "store_checkout_reservations_order_idx" ON "store_checkout_reservations" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "store_checkout_reservations_due_idx" ON "store_checkout_reservations" USING btree ("state","expires_at");--> statement-breakpoint
CREATE INDEX "store_checkout_reservations_client_idx" ON "store_checkout_reservations" USING btree ("client_id","website_id");--> statement-breakpoint
CREATE UNIQUE INDEX "store_payment_events_site_event_idx" ON "store_payment_events" USING btree ("website_id","event_id");--> statement-breakpoint
ALTER TABLE "channel_outbox" ADD CONSTRAINT "channel_outbox_contact_id_crm_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."crm_contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_outbox" ADD CONSTRAINT "channel_outbox_message_id_chat_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."chat_messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_conversations" ADD CONSTRAINT "chat_conversations_connection_id_channel_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."channel_connections"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_connection_id_channel_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."channel_connections"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "kanban_card_files_stored_filename_idx" ON "kanban_card_files" USING btree ("stored_filename");--> statement-breakpoint
CREATE INDEX "kanban_card_files_url_idx" ON "kanban_card_files" USING btree ("url");--> statement-breakpoint
CREATE INDEX "brain_notes_attachment_key_idx" ON "brain_notes" USING btree ("attachment_stored_key");--> statement-breakpoint
CREATE INDEX "brain_notes_attachment_url_idx" ON "brain_notes" USING btree ("attachment_url");--> statement-breakpoint
CREATE UNIQUE INDEX "channel_outbox_connection_key_idx" ON "channel_outbox" USING btree ("connection_id","idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "channel_outbox_connection_external_idx" ON "channel_outbox" USING btree ("connection_id","external_message_id");