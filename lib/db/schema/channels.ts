// Omnichannel: channel connections, contact identities, merge suggestions,
// per-channel consent, and the outbound message outbox.
//
// Tenancy: every row is keyed by `clientId`. Credentials live in
// `encryptedCredentials` (AES-256-GCM via the `encryptedText` column type) and
// must never be selected for a client response — strip the field server-side.

import {
  pgTable,
  serial,
  varchar,
  text,
  timestamp,
  boolean,
  integer,
  json,
  uniqueIndex,
  index,
} from 'drizzle-orm/pg-core';
import { users } from './auth';
import { clients } from './sites';
import { crmContacts } from './crm';
import { channelConnections, channelOutbox } from './chat';

export const CHANNEL_PROVIDERS = ['whatsapp', 'instagram', 'messenger', 'webchat', 'email'] as const;
export type ChannelProvider = (typeof CHANNEL_PROVIDERS)[number];

export const CHANNEL_CONNECTION_STATUSES = [
  'connected',
  'disconnected',
  'error',
  'token_expired',
  'incomplete',
] as const;
export type ChannelConnectionStatus = (typeof CHANNEL_CONNECTION_STATUSES)[number];

export const CONTACT_IDENTITY_KINDS = [
  'phone',
  'email',
  'whatsapp',
  'instagram',
  'facebook',
  'webchat',
] as const;
export type ContactIdentityKind = (typeof CONTACT_IDENTITY_KINDS)[number];

export const CHANNEL_OUTBOX_STATUSES = [
  'queued',
  'processing',
  'sent',
  'delivered',
  'read',
  'retrying',
  'failed',
] as const;
export type ChannelOutboxStatus = (typeof CHANNEL_OUTBOX_STATUSES)[number];

// ─── CONTACT IDENTITIES ───────────────────────────────────────────────────────
// Maps every channel handle (phone, email, IG id, PSID, web visitor id) back to
// a single CRM contact, so a customer on WhatsApp and the same person on email
// resolve to the same `crm_contacts` row. Resolution is always scoped by
// clientId; never merge two contacts on weak evidence — that is what
// `suggested_merges` is for.

export const contactIdentities = pgTable(
  'contact_identities',
  {
    id: serial('id').primaryKey(),
    clientId: integer('client_id')
      .notNull()
      .references(() => clients.id, { onDelete: 'cascade' }),
    contactId: integer('contact_id')
      .notNull()
      .references(() => crmContacts.id, { onDelete: 'cascade' }),
    kind: varchar('kind', { length: 20 }).notNull(),
    // Normalized value: phone in E.164, lowercase email, raw provider ids otherwise.
    value: varchar('value', { length: 320 }).notNull(),
    verified: boolean('verified').default(false).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => [
    // One handle resolves to one contact per tenant (idempotent resolution).
    uniqueIndex('contact_identities_client_kind_value_idx').on(t.clientId, t.kind, t.value),
    index('contact_identities_contact_idx').on(t.contactId),
  ],
);

// ─── SUGGESTED MERGES ─────────────────────────────────────────────────────────
// Weak-evidence candidate pairs surfaced for a human to accept or reject. The
// platform NEVER auto-merges contacts based on these.

export const suggestedMerges = pgTable(
  'suggested_merges',
  {
    id: serial('id').primaryKey(),
    clientId: integer('client_id')
      .notNull()
      .references(() => clients.id, { onDelete: 'cascade' }),
    contactAId: integer('contact_a_id')
      .notNull()
      .references(() => crmContacts.id, { onDelete: 'cascade' }),
    contactBId: integer('contact_b_id')
      .notNull()
      .references(() => crmContacts.id, { onDelete: 'cascade' }),
    // Human-readable reason, e.g. "same email, different phone".
    evidence: text('evidence'),
    status: varchar('status', { length: 20 }).default('suggested').notNull(), // suggested | accepted | rejected
    createdBy: integer('created_by').references(() => users.id, { onDelete: 'set null' }),
    resolvedBy: integer('resolved_by').references(() => users.id, { onDelete: 'set null' }),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex('suggested_merges_pair_idx').on(t.clientId, t.contactAId, t.contactBId),
  ],
);

// ─── CONSENT ──────────────────────────────────────────────────────────────────
// Channel-level opt-in/opt-out with a policy version. Sales sequences and any
// outbound send must consult this before sending. The opt-out row wins.

export const channelConsent = pgTable(
  'channel_consent',
  {
    id: serial('id').primaryKey(),
    clientId: integer('client_id')
      .notNull()
      .references(() => clients.id, { onDelete: 'cascade' }),
    contactId: integer('contact_id').references(() => crmContacts.id, { onDelete: 'cascade' }),
    channel: varchar('channel', { length: 20 }).notNull(),
    kind: varchar('kind', { length: 20 }).notNull(), // identity kind the consent was recorded against
    identityValue: varchar('identity_value', { length: 320 }).notNull(),
    // 'opt_in' | 'opt_out'
    status: varchar('status', { length: 10 }).notNull(),
    source: varchar('source', { length: 50 }).default('manual').notNull(), // manual | webhook | sequence | portal
    policyVersion: varchar('policy_version', { length: 40 }),
    recordedAt: timestamp('recorded_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('channel_consent_contact_channel_idx').on(t.contactId, t.channel),
    index('channel_consent_identity_idx').on(t.clientId, t.channel, t.kind, t.identityValue),
  ],
);

export type NewChannelConnection = typeof channelConnections.$inferInsert;
export type ContactIdentity = typeof contactIdentities.$inferSelect;
export type NewContactIdentity = typeof contactIdentities.$inferInsert;
export type ChannelConsent = typeof channelConsent.$inferSelect;
export type ChannelOutbox = typeof channelOutbox.$inferSelect;
