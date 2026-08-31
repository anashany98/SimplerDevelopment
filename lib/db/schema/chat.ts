// Omnichannel inbox — web chat, Meta messaging and email share one normalized
// conversation/message model. Provider payloads stay in metadata while the
// fields used by routing, CRM and AI remain provider-independent.
//
// Multi-tenant invariant: every mutable row is keyed by clientId. Id-addressed
// reads and writes must always include the matching clientId predicate.

import {
  pgTable,
  serial,
  varchar,
  text,
  timestamp,
  boolean,
  integer,
  json,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { users } from './auth';
import { clients, clientWebsites } from './sites';
import { crmContacts } from './crm';
import { encryptedText } from './columns';

export const chatWidgets = pgTable('chat_widgets', {
  id: serial('id').primaryKey(),
  clientId: integer('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }),
  siteId: integer('site_id').notNull().references(() => clientWebsites.id, { onDelete: 'cascade' }),
  enabled: boolean('enabled').default(true).notNull(),
  greetingMessage: text('greeting_message'),
  welcomeMessage: text('welcome_message'),
  position: varchar('position', { length: 32 }).default('bottom-right').notNull(),
  primaryColor: varchar('primary_color', { length: 7 }).default('#0070f3').notNull(),
  awayMessage: text('away_message'),
  displayName: varchar('display_name', { length: 120 }),
  logoUrl: text('logo_url'),
  avatarUrl: text('avatar_url'),
  language: varchar('language', { length: 12 }).default('en').notNull(),
  businessHours: json('business_hours').$type<Record<string, unknown> | null>(),
  aiMode: varchar('ai_mode', { length: 20 }).default('hybrid').notNull(),
  allowAttachments: boolean('allow_attachments').default(true).notNull(),
  showBranding: boolean('show_branding').default(true).notNull(),
  privacyLink: text('privacy_link'),
  allowedOrigins: json('allowed_origins').$type<string[]>().default([]).notNull(),
  publicKey: varchar('public_key', { length: 64 }),
  brainEnabled: boolean('brain_enabled').default(false).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => [
  uniqueIndex('chat_widgets_site_idx').on(t.siteId),
  uniqueIndex('chat_widgets_public_key_idx').on(t.publicKey),
]);

/**
 * Tenant-owned provider application credentials. These are deliberately kept
 * separate from channel access tokens: one Meta app can authorize several
 * WhatsApp, Messenger and Instagram assets for the same tenant.
 */
export const channelProviderConfigs = pgTable('channel_provider_configs', {
  id: serial('id').primaryKey(),
  clientId: integer('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }),
  provider: varchar('provider', { length: 32 }).default('meta').notNull(),
  publicId: varchar('public_id', { length: 36 }).notNull(),
  appId: varchar('app_id', { length: 64 }).notNull(),
  appSecret: encryptedText('app_secret_encrypted').notNull(),
  loginConfigId: varchar('login_config_id', { length: 64 }).notNull(),
  webhookVerifyToken: encryptedText('webhook_verify_token_encrypted').notNull(),
  configuredByUserId: integer('configured_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => [
  uniqueIndex('channel_provider_configs_tenant_idx').on(t.clientId, t.provider),
  uniqueIndex('channel_provider_configs_public_idx').on(t.publicId),
]);

/** One provider asset connected to one tenant (phone number, Page, IG account). */
export const channelConnections = pgTable('channel_connections', {
  id: serial('id').primaryKey(),
  clientId: integer('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }),
  channel: varchar('channel', { length: 24 }).notNull(),
  provider: varchar('provider', { length: 32 }).notNull(),
  externalAccountId: varchar('external_account_id', { length: 255 }).notNull(),
  displayName: varchar('display_name', { length: 255 }),
  status: varchar('status', { length: 24 }).default('incomplete').notNull(),
  // JSON string encrypted transparently with AES-256-GCM. Never select this
  // column in a portal response or log it.
  credentials: encryptedText('credentials_encrypted'),
  metadata: json('metadata').$type<Record<string, unknown>>().default({}).notNull(),
  capabilities: json('capabilities').$type<string[]>().default([]).notNull(),
  tokenExpiresAt: timestamp('token_expires_at'),
  lastInboundAt: timestamp('last_inbound_at'),
  lastOutboundAt: timestamp('last_outbound_at'),
  lastWebhookAt: timestamp('last_webhook_at'),
  lastError: text('last_error'),
  createdByUserId: integer('created_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => [
  uniqueIndex('channel_connections_asset_idx').on(t.clientId, t.provider, t.channel, t.externalAccountId),
  index('channel_connections_status_idx').on(t.clientId, t.status),
]);

/** Provider-scoped person identity, optionally resolved to one CRM contact. */
export const channelIdentities = pgTable('channel_identities', {
  id: serial('id').primaryKey(),
  clientId: integer('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }),
  connectionId: integer('connection_id').references(() => channelConnections.id, { onDelete: 'set null' }),
  contactId: integer('contact_id').references(() => crmContacts.id, { onDelete: 'set null' }),
  channel: varchar('channel', { length: 24 }).notNull(),
  provider: varchar('provider', { length: 32 }).notNull(),
  externalAccountId: varchar('external_account_id', { length: 255 }),
  externalUserId: varchar('external_user_id', { length: 255 }).notNull(),
  displayName: varchar('display_name', { length: 255 }),
  emailNormalized: varchar('email_normalized', { length: 320 }),
  phoneNormalized: varchar('phone_normalized', { length: 32 }),
  metadata: json('metadata').$type<Record<string, unknown>>().default({}).notNull(),
  verifiedAt: timestamp('verified_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => [
  uniqueIndex('channel_identities_external_idx').on(t.clientId, t.provider, t.externalAccountId, t.externalUserId),
  index('channel_identities_contact_idx').on(t.clientId, t.contactId),
  index('channel_identities_email_idx').on(t.clientId, t.emailNormalized),
  index('channel_identities_phone_idx').on(t.clientId, t.phoneNormalized),
]);

export const chatConversations = pgTable('chat_conversations', {
  id: serial('id').primaryKey(),
  // Nullable for conversations originating in external channels.
  widgetId: integer('widget_id').references(() => chatWidgets.id, { onDelete: 'set null' }),
  channelConnectionId: integer('channel_connection_id').references(() => channelConnections.id, { onDelete: 'set null' }),
  identityId: integer('identity_id').references(() => channelIdentities.id, { onDelete: 'set null' }),
  contactId: integer('contact_id').references(() => crmContacts.id, { onDelete: 'set null' }),
  clientId: integer('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }),
  channel: varchar('channel', { length: 24 }).default('webchat').notNull(),
  provider: varchar('provider', { length: 32 }).default('native').notNull(),
  externalConversationId: varchar('external_conversation_id', { length: 255 }),
  visitorId: varchar('visitor_id', { length: 255 }),
  visitorName: varchar('visitor_name', { length: 255 }),
  visitorEmail: varchar('visitor_email', { length: 255 }),
  status: varchar('status', { length: 20 }).default('open').notNull(),
  aiMode: varchar('ai_mode', { length: 20 }).default('hybrid').notNull(),
  priority: varchar('priority', { length: 16 }).default('normal').notNull(),
  team: varchar('team', { length: 100 }),
  tags: json('tags').$type<string[]>().default([]).notNull(),
  assignedUserId: integer('assigned_user_id').references(() => users.id, { onDelete: 'set null' }),
  waitingSince: timestamp('waiting_since'),
  lastInboundAt: timestamp('last_inbound_at'),
  lastOutboundAt: timestamp('last_outbound_at'),
  lastMessageAt: timestamp('last_message_at').defaultNow().notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  closedAt: timestamp('closed_at'),
}, (t) => [
  index('chat_conversations_inbox_idx').on(t.clientId, t.status, t.lastMessageAt),
  index('chat_conversations_channel_idx').on(t.clientId, t.channel, t.lastMessageAt),
  index('chat_conversations_widget_visitor_idx').on(t.widgetId, t.visitorId),
  index('chat_conversations_contact_idx').on(t.clientId, t.contactId),
  uniqueIndex('chat_conversations_external_idx').on(t.clientId, t.provider, t.channelConnectionId, t.externalConversationId),
]);

// Append-only content. Delivery state is represented by nullable status
// timestamps populated from provider status webhooks.
export const chatMessages = pgTable('chat_messages', {
  id: serial('id').primaryKey(),
  conversationId: integer('conversation_id').notNull().references(() => chatConversations.id, { onDelete: 'cascade' }),
  clientId: integer('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }),
  authorKind: varchar('author_kind', { length: 20 }).notNull(),
  authorUserId: integer('author_user_id').references(() => users.id, { onDelete: 'set null' }),
  authorName: varchar('author_name', { length: 255 }),
  direction: varchar('direction', { length: 12 }).default('inbound').notNull(),
  channel: varchar('channel', { length: 24 }).default('webchat').notNull(),
  provider: varchar('provider', { length: 32 }).default('native').notNull(),
  externalMessageId: varchar('external_message_id', { length: 255 }),
  messageType: varchar('message_type', { length: 32 }).default('text').notNull(),
  body: text('body').notNull(),
  attachments: json('attachments').$type<unknown[]>().default([]).notNull(),
  sender: json('sender').$type<Record<string, unknown> | null>(),
  recipient: json('recipient').$type<Record<string, unknown> | null>(),
  replyTo: json('reply_to').$type<Record<string, unknown> | null>(),
  metadata: json('metadata').$type<Record<string, unknown>>().default({}).notNull(),
  status: varchar('status', { length: 20 }).default('received').notNull(),
  idempotencyKey: varchar('idempotency_key', { length: 255 }),
  correlationId: varchar('correlation_id', { length: 100 }),
  occurredAt: timestamp('occurred_at').defaultNow().notNull(),
  sentAt: timestamp('sent_at'),
  deliveredAt: timestamp('delivered_at'),
  readAt: timestamp('read_at'),
  failedAt: timestamp('failed_at'),
}, (t) => [
  index('chat_messages_conv_occurred_idx').on(t.conversationId, t.occurredAt),
  uniqueIndex('chat_messages_external_idx').on(t.clientId, t.provider, t.externalMessageId),
  uniqueIndex('chat_messages_idempotency_idx').on(t.clientId, t.idempotencyKey),
]);

/** Raw-provider delivery journal: verify first, then insert before processing. */
export const channelWebhookEvents = pgTable('channel_webhook_events', {
  id: serial('id').primaryKey(),
  clientId: integer('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }),
  connectionId: integer('connection_id').notNull().references(() => channelConnections.id, { onDelete: 'cascade' }),
  provider: varchar('provider', { length: 32 }).notNull(),
  externalEventId: varchar('external_event_id', { length: 255 }).notNull(),
  eventType: varchar('event_type', { length: 100 }).notNull(),
  payload: json('payload').$type<Record<string, unknown>>().notNull(),
  status: varchar('status', { length: 20 }).default('received').notNull(),
  attempts: integer('attempts').default(0).notNull(),
  error: text('error'),
  receivedAt: timestamp('received_at').defaultNow().notNull(),
  processedAt: timestamp('processed_at'),
}, (t) => [
  uniqueIndex('channel_webhook_events_dedupe_idx').on(t.connectionId, t.externalEventId),
  index('channel_webhook_events_retry_idx').on(t.status, t.receivedAt),
]);

/** Transactional dispatch intent; workers can retry without duplicating sends. */
export const channelOutbox = pgTable('channel_outbox', {
  id: serial('id').primaryKey(),
  clientId: integer('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }),
  connectionId: integer('connection_id').references(() => channelConnections.id, { onDelete: 'set null' }),
  conversationId: integer('conversation_id').notNull().references(() => chatConversations.id, { onDelete: 'cascade' }),
  messageId: integer('message_id').notNull().references(() => chatMessages.id, { onDelete: 'cascade' }),
  idempotencyKey: varchar('idempotency_key', { length: 255 }).notNull(),
  payload: json('payload').$type<Record<string, unknown>>().notNull(),
  status: varchar('status', { length: 20 }).default('pending').notNull(),
  attempts: integer('attempts').default(0).notNull(),
  maxAttempts: integer('max_attempts').default(8).notNull(),
  nextAttemptAt: timestamp('next_attempt_at').defaultNow().notNull(),
  lockedAt: timestamp('locked_at'),
  lastError: text('last_error'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  processedAt: timestamp('processed_at'),
}, (t) => [
  uniqueIndex('channel_outbox_idempotency_idx').on(t.clientId, t.idempotencyKey),
  index('channel_outbox_pending_idx').on(t.status, t.nextAttemptAt),
]);

export const channelConsents = pgTable('channel_consents', {
  id: serial('id').primaryKey(),
  clientId: integer('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }),
  contactId: integer('contact_id').references(() => crmContacts.id, { onDelete: 'cascade' }),
  identityId: integer('identity_id').references(() => channelIdentities.id, { onDelete: 'cascade' }),
  channel: varchar('channel', { length: 24 }).notNull(),
  purpose: varchar('purpose', { length: 80 }).default('support').notNull(),
  status: varchar('status', { length: 20 }).notNull(),
  source: varchar('source', { length: 100 }).notNull(),
  evidence: json('evidence').$type<Record<string, unknown>>().default({}).notNull(),
  grantedAt: timestamp('granted_at'),
  revokedAt: timestamp('revoked_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (t) => [
  index('channel_consents_lookup_idx').on(t.clientId, t.channel, t.contactId),
]);

export const conversationAuditLogs = pgTable('conversation_audit_logs', {
  id: serial('id').primaryKey(),
  clientId: integer('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }),
  conversationId: integer('conversation_id').references(() => chatConversations.id, { onDelete: 'set null' }),
  actorKind: varchar('actor_kind', { length: 20 }).notNull(),
  actorUserId: integer('actor_user_id').references(() => users.id, { onDelete: 'set null' }),
  action: varchar('action', { length: 100 }).notNull(),
  correlationId: varchar('correlation_id', { length: 100 }),
  details: json('details').$type<Record<string, unknown>>().default({}).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (t) => [
  index('conversation_audit_lookup_idx').on(t.clientId, t.conversationId, t.createdAt),
]);

export const channelAiConfigs = pgTable('channel_ai_configs', {
  id: serial('id').primaryKey(),
  clientId: integer('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }),
  enabled: boolean('enabled').default(false).notNull(),
  provider: varchar('provider', { length: 32 }).default('platform').notNull(),
  model: varchar('model', { length: 255 }),
  baseUrl: text('base_url'),
  apiKey: encryptedText('api_key_encrypted'),
  systemPrompt: text('system_prompt'),
  autoSendMinConfidence: integer('auto_send_min_confidence').default(92).notNull(),
  dailyTokenLimit: integer('daily_token_limit'),
  monthlyTokenLimit: integer('monthly_token_limit'),
  allowedTools: json('allowed_tools').$type<string[]>().default([]).notNull(),
  policies: json('policies').$type<Record<string, unknown>>().default({}).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => [
  uniqueIndex('channel_ai_configs_client_idx').on(t.clientId),
]);

/** Durable decision journal. A unique message id makes AI processing idempotent. */
export const channelAiRuns = pgTable('channel_ai_runs', {
  id: serial('id').primaryKey(),
  clientId: integer('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }),
  conversationId: integer('conversation_id').notNull().references(() => chatConversations.id, { onDelete: 'cascade' }),
  messageId: integer('message_id').notNull().references(() => chatMessages.id, { onDelete: 'cascade' }),
  status: varchar('status', { length: 20 }).default('pending').notNull(),
  decision: json('decision').$type<Record<string, unknown> | null>(),
  provider: varchar('provider', { length: 32 }),
  model: varchar('model', { length: 255 }),
  inputTokens: integer('input_tokens').default(0).notNull(),
  outputTokens: integer('output_tokens').default(0).notNull(),
  attempts: integer('attempts').default(0).notNull(),
  nextAttemptAt: timestamp('next_attempt_at').defaultNow().notNull(),
  lastError: text('last_error'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  startedAt: timestamp('started_at'),
  completedAt: timestamp('completed_at'),
}, (t) => [
  uniqueIndex('channel_ai_runs_message_idx').on(t.clientId, t.messageId),
  index('channel_ai_runs_pending_idx').on(t.status, t.nextAttemptAt),
]);

export type ChatWidget = typeof chatWidgets.$inferSelect;
export type ChannelProviderConfig = typeof channelProviderConfigs.$inferSelect;
export type ChannelConnection = typeof channelConnections.$inferSelect;
export type ChannelIdentity = typeof channelIdentities.$inferSelect;
export type ChatConversation = typeof chatConversations.$inferSelect;
export type ChatMessage = typeof chatMessages.$inferSelect;
export type ChannelWebhookEvent = typeof channelWebhookEvents.$inferSelect;
export type ChannelOutboxItem = typeof channelOutbox.$inferSelect;
