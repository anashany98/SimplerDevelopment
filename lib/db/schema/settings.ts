// Platform-wide runtime settings editable from the admin UI (Admin → Email → Ajustes).
//
// Key/value store for configuration that used to live only in environment
// variables (Resend key/from, webhook secrets, …). Resolution order for every
// consumer is DB setting → env var → built-in default, so self-hosted installs
// keep working exactly as before with zero rows here.
//
// Secret keys (suffix `_secret` / `_api_key`) are encrypted at rest by
// lib/settings/platform.ts — never insert plaintext secrets into this table
// directly; use setPlatformSetting().

import { pgTable, varchar, text, timestamp } from 'drizzle-orm/pg-core';

export const platformSettings = pgTable('platform_settings', {
  key: varchar('key', { length: 100 }).primaryKey(),
  value: text('value').notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export type PlatformSettingRow = typeof platformSettings.$inferSelect;
