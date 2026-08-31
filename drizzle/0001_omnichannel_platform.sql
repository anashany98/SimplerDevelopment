CREATE TABLE "channel_ai_configs" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id" integer NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"provider" varchar(32) DEFAULT 'platform' NOT NULL,
	"model" varchar(255),
	"base_url" text,
	"api_key_encrypted" text,
	"system_prompt" text,
	"auto_send_min_confidence" integer DEFAULT 92 NOT NULL,
	"daily_token_limit" integer,
	"monthly_token_limit" integer,
	"allowed_tools" json DEFAULT '[]'::json NOT NULL,
	"policies" json DEFAULT '{}'::json NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "channel_ai_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id" integer NOT NULL,
	"conversation_id" integer NOT NULL,
	"message_id" integer NOT NULL,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"decision" json,
	"provider" varchar(32),
	"model" varchar(255),
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp DEFAULT now() NOT NULL,
	"last_error" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"started_at" timestamp,
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "channel_connections" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id" integer NOT NULL,
	"channel" varchar(24) NOT NULL,
	"provider" varchar(32) NOT NULL,
	"external_account_id" varchar(255) NOT NULL,
	"display_name" varchar(255),
	"status" varchar(24) DEFAULT 'incomplete' NOT NULL,
	"credentials_encrypted" text,
	"metadata" json DEFAULT '{}'::json NOT NULL,
	"capabilities" json DEFAULT '[]'::json NOT NULL,
	"token_expires_at" timestamp,
	"last_inbound_at" timestamp,
	"last_outbound_at" timestamp,
	"last_webhook_at" timestamp,
	"last_error" text,
	"created_by_user_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "channel_consents" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id" integer NOT NULL,
	"contact_id" integer,
	"identity_id" integer,
	"channel" varchar(24) NOT NULL,
	"purpose" varchar(80) DEFAULT 'support' NOT NULL,
	"status" varchar(20) NOT NULL,
	"source" varchar(100) NOT NULL,
	"evidence" json DEFAULT '{}'::json NOT NULL,
	"granted_at" timestamp,
	"revoked_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "channel_identities" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id" integer NOT NULL,
	"connection_id" integer,
	"contact_id" integer,
	"channel" varchar(24) NOT NULL,
	"provider" varchar(32) NOT NULL,
	"external_account_id" varchar(255),
	"external_user_id" varchar(255) NOT NULL,
	"display_name" varchar(255),
	"email_normalized" varchar(320),
	"phone_normalized" varchar(32),
	"metadata" json DEFAULT '{}'::json NOT NULL,
	"verified_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "channel_outbox" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id" integer NOT NULL,
	"connection_id" integer,
	"conversation_id" integer NOT NULL,
	"message_id" integer NOT NULL,
	"idempotency_key" varchar(255) NOT NULL,
	"payload" json NOT NULL,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 8 NOT NULL,
	"next_attempt_at" timestamp DEFAULT now() NOT NULL,
	"locked_at" timestamp,
	"last_error" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"processed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "channel_webhook_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id" integer NOT NULL,
	"connection_id" integer NOT NULL,
	"provider" varchar(32) NOT NULL,
	"external_event_id" varchar(255) NOT NULL,
	"event_type" varchar(100) NOT NULL,
	"payload" json NOT NULL,
	"status" varchar(20) DEFAULT 'received' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"error" text,
	"received_at" timestamp DEFAULT now() NOT NULL,
	"processed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "conversation_audit_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id" integer NOT NULL,
	"conversation_id" integer,
	"actor_kind" varchar(20) NOT NULL,
	"actor_user_id" integer,
	"action" varchar(100) NOT NULL,
	"correlation_id" varchar(100),
	"details" json DEFAULT '{}'::json NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "chat_conversations" DROP CONSTRAINT "chat_conversations_widget_id_chat_widgets_id_fk";
--> statement-breakpoint
ALTER TABLE "chat_conversations" ALTER COLUMN "widget_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "chat_conversations" ALTER COLUMN "visitor_id" SET DATA TYPE varchar(255);--> statement-breakpoint
ALTER TABLE "chat_conversations" ALTER COLUMN "visitor_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "chat_conversations" ADD COLUMN "channel_connection_id" integer;--> statement-breakpoint
ALTER TABLE "chat_conversations" ADD COLUMN "identity_id" integer;--> statement-breakpoint
ALTER TABLE "chat_conversations" ADD COLUMN "contact_id" integer;--> statement-breakpoint
ALTER TABLE "chat_conversations" ADD COLUMN "channel" varchar(24) DEFAULT 'webchat' NOT NULL;--> statement-breakpoint
ALTER TABLE "chat_conversations" ADD COLUMN "provider" varchar(32) DEFAULT 'native' NOT NULL;--> statement-breakpoint
ALTER TABLE "chat_conversations" ADD COLUMN "external_conversation_id" varchar(255);--> statement-breakpoint
ALTER TABLE "chat_conversations" ADD COLUMN "ai_mode" varchar(20) DEFAULT 'hybrid' NOT NULL;--> statement-breakpoint
ALTER TABLE "chat_conversations" ADD COLUMN "priority" varchar(16) DEFAULT 'normal' NOT NULL;--> statement-breakpoint
ALTER TABLE "chat_conversations" ADD COLUMN "team" varchar(100);--> statement-breakpoint
ALTER TABLE "chat_conversations" ADD COLUMN "tags" json DEFAULT '[]'::json NOT NULL;--> statement-breakpoint
ALTER TABLE "chat_conversations" ADD COLUMN "waiting_since" timestamp;--> statement-breakpoint
ALTER TABLE "chat_conversations" ADD COLUMN "last_inbound_at" timestamp;--> statement-breakpoint
ALTER TABLE "chat_conversations" ADD COLUMN "last_outbound_at" timestamp;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD COLUMN "direction" varchar(12) DEFAULT 'inbound' NOT NULL;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD COLUMN "channel" varchar(24) DEFAULT 'webchat' NOT NULL;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD COLUMN "provider" varchar(32) DEFAULT 'native' NOT NULL;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD COLUMN "external_message_id" varchar(255);--> statement-breakpoint
ALTER TABLE "chat_messages" ADD COLUMN "message_type" varchar(32) DEFAULT 'text' NOT NULL;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD COLUMN "sender" json;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD COLUMN "recipient" json;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD COLUMN "reply_to" json;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD COLUMN "metadata" json DEFAULT '{}'::json NOT NULL;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD COLUMN "status" varchar(20) DEFAULT 'received' NOT NULL;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD COLUMN "idempotency_key" varchar(255);--> statement-breakpoint
ALTER TABLE "chat_messages" ADD COLUMN "correlation_id" varchar(100);--> statement-breakpoint
ALTER TABLE "chat_messages" ADD COLUMN "sent_at" timestamp;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD COLUMN "delivered_at" timestamp;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD COLUMN "read_at" timestamp;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD COLUMN "failed_at" timestamp;--> statement-breakpoint
ALTER TABLE "chat_widgets" ADD COLUMN "welcome_message" text;--> statement-breakpoint
ALTER TABLE "chat_widgets" ADD COLUMN "display_name" varchar(120);--> statement-breakpoint
ALTER TABLE "chat_widgets" ADD COLUMN "logo_url" text;--> statement-breakpoint
ALTER TABLE "chat_widgets" ADD COLUMN "avatar_url" text;--> statement-breakpoint
ALTER TABLE "chat_widgets" ADD COLUMN "language" varchar(12) DEFAULT 'en' NOT NULL;--> statement-breakpoint
ALTER TABLE "chat_widgets" ADD COLUMN "business_hours" json;--> statement-breakpoint
ALTER TABLE "chat_widgets" ADD COLUMN "ai_mode" varchar(20) DEFAULT 'hybrid' NOT NULL;--> statement-breakpoint
ALTER TABLE "chat_widgets" ADD COLUMN "allow_attachments" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "chat_widgets" ADD COLUMN "show_branding" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "chat_widgets" ADD COLUMN "privacy_link" text;--> statement-breakpoint
ALTER TABLE "chat_widgets" ADD COLUMN "allowed_origins" json DEFAULT '[]'::json NOT NULL;--> statement-breakpoint
ALTER TABLE "chat_widgets" ADD COLUMN "public_key" varchar(64);--> statement-breakpoint
ALTER TABLE "channel_ai_configs" ADD CONSTRAINT "channel_ai_configs_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_ai_runs" ADD CONSTRAINT "channel_ai_runs_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_ai_runs" ADD CONSTRAINT "channel_ai_runs_conversation_id_chat_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."chat_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_ai_runs" ADD CONSTRAINT "channel_ai_runs_message_id_chat_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."chat_messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_connections" ADD CONSTRAINT "channel_connections_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_connections" ADD CONSTRAINT "channel_connections_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_consents" ADD CONSTRAINT "channel_consents_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_consents" ADD CONSTRAINT "channel_consents_contact_id_crm_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."crm_contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_consents" ADD CONSTRAINT "channel_consents_identity_id_channel_identities_id_fk" FOREIGN KEY ("identity_id") REFERENCES "public"."channel_identities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_identities" ADD CONSTRAINT "channel_identities_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_identities" ADD CONSTRAINT "channel_identities_connection_id_channel_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."channel_connections"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_identities" ADD CONSTRAINT "channel_identities_contact_id_crm_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."crm_contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_outbox" ADD CONSTRAINT "channel_outbox_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_outbox" ADD CONSTRAINT "channel_outbox_connection_id_channel_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."channel_connections"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_outbox" ADD CONSTRAINT "channel_outbox_conversation_id_chat_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."chat_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_outbox" ADD CONSTRAINT "channel_outbox_message_id_chat_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."chat_messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_webhook_events" ADD CONSTRAINT "channel_webhook_events_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_webhook_events" ADD CONSTRAINT "channel_webhook_events_connection_id_channel_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."channel_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_audit_logs" ADD CONSTRAINT "conversation_audit_logs_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_audit_logs" ADD CONSTRAINT "conversation_audit_logs_conversation_id_chat_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."chat_conversations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_audit_logs" ADD CONSTRAINT "conversation_audit_logs_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "channel_ai_configs_client_idx" ON "channel_ai_configs" USING btree ("client_id");--> statement-breakpoint
CREATE UNIQUE INDEX "channel_ai_runs_message_idx" ON "channel_ai_runs" USING btree ("client_id","message_id");--> statement-breakpoint
CREATE INDEX "channel_ai_runs_pending_idx" ON "channel_ai_runs" USING btree ("status","next_attempt_at");--> statement-breakpoint
CREATE UNIQUE INDEX "channel_connections_asset_idx" ON "channel_connections" USING btree ("client_id","provider","channel","external_account_id");--> statement-breakpoint
CREATE INDEX "channel_connections_status_idx" ON "channel_connections" USING btree ("client_id","status");--> statement-breakpoint
CREATE INDEX "channel_consents_lookup_idx" ON "channel_consents" USING btree ("client_id","channel","contact_id");--> statement-breakpoint
CREATE UNIQUE INDEX "channel_identities_external_idx" ON "channel_identities" USING btree ("client_id","provider","external_account_id","external_user_id");--> statement-breakpoint
CREATE INDEX "channel_identities_contact_idx" ON "channel_identities" USING btree ("client_id","contact_id");--> statement-breakpoint
CREATE INDEX "channel_identities_email_idx" ON "channel_identities" USING btree ("client_id","email_normalized");--> statement-breakpoint
CREATE INDEX "channel_identities_phone_idx" ON "channel_identities" USING btree ("client_id","phone_normalized");--> statement-breakpoint
CREATE UNIQUE INDEX "channel_outbox_idempotency_idx" ON "channel_outbox" USING btree ("client_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "channel_outbox_pending_idx" ON "channel_outbox" USING btree ("status","next_attempt_at");--> statement-breakpoint
CREATE UNIQUE INDEX "channel_webhook_events_dedupe_idx" ON "channel_webhook_events" USING btree ("connection_id","external_event_id");--> statement-breakpoint
CREATE INDEX "channel_webhook_events_retry_idx" ON "channel_webhook_events" USING btree ("status","received_at");--> statement-breakpoint
CREATE INDEX "conversation_audit_lookup_idx" ON "conversation_audit_logs" USING btree ("client_id","conversation_id","created_at");--> statement-breakpoint
ALTER TABLE "chat_conversations" ADD CONSTRAINT "chat_conversations_channel_connection_id_channel_connections_id_fk" FOREIGN KEY ("channel_connection_id") REFERENCES "public"."channel_connections"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_conversations" ADD CONSTRAINT "chat_conversations_identity_id_channel_identities_id_fk" FOREIGN KEY ("identity_id") REFERENCES "public"."channel_identities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_conversations" ADD CONSTRAINT "chat_conversations_contact_id_crm_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."crm_contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_conversations" ADD CONSTRAINT "chat_conversations_widget_id_chat_widgets_id_fk" FOREIGN KEY ("widget_id") REFERENCES "public"."chat_widgets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "chat_conversations_channel_idx" ON "chat_conversations" USING btree ("client_id","channel","last_message_at");--> statement-breakpoint
CREATE INDEX "chat_conversations_contact_idx" ON "chat_conversations" USING btree ("client_id","contact_id");--> statement-breakpoint
CREATE UNIQUE INDEX "chat_conversations_external_idx" ON "chat_conversations" USING btree ("client_id","provider","channel_connection_id","external_conversation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "chat_messages_external_idx" ON "chat_messages" USING btree ("client_id","provider","external_message_id");--> statement-breakpoint
CREATE UNIQUE INDEX "chat_messages_idempotency_idx" ON "chat_messages" USING btree ("client_id","idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "chat_widgets_public_key_idx" ON "chat_widgets" USING btree ("public_key");