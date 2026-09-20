// Platform settings — DB-backed key/value store for configuration that used to
// live only in environment variables (Admin → Email → Ajustes). Every consumer
// resolves DB setting → env var → built-in default, so env-only (self-hosted)
// installs keep working with zero rows in this table.
//
// Secret keys (name ends with `_secret` or `_api_key`) are encrypted at rest
// with lib/crypto/api-key.ts (ENCRYPTION_KEY). Always go through this module;
// never persist raw secrets into platform_settings directly.

import { db } from '@/lib/db';
import { platformSettings } from '@/lib/db/schema';
import { eq, inArray } from 'drizzle-orm';
import { encryptApiKey, decryptApiKey } from '@/lib/crypto/api-key';

const SECRET_KEY_RE = /_(secret|api_key)$/;

export function isSecretSettingKey(key: string): boolean {
  return SECRET_KEY_RE.test(key);
}

/**
 * Batch read of several settings in one query. Resilient by design: a missing
 * table (fresh deploy before the migration lands) or a transient DB error
 * degrades to `{}` so email plumbing falls back to env vars instead of 500ing.
 * Values that fail to decrypt are omitted (also falls back at the call site).
 */
export async function getPlatformSettingsMap(keys: string[]): Promise<Record<string, string>> {
  if (keys.length === 0) return {};
  try {
    const rows = await db
      .select()
      .from(platformSettings)
      .where(inArray(platformSettings.key, keys));
    const out: Record<string, string> = {};
    for (const row of rows) {
      if (isSecretSettingKey(row.key)) {
        try {
          out[row.key] = decryptApiKey(row.value);
        } catch (err) {
          console.warn(`[platform-settings] decrypt failed for '${row.key}'`, err);
        }
      } else {
        out[row.key] = row.value;
      }
    }
    return out;
  } catch (err) {
    console.warn('[platform-settings] read failed', err);
    return {};
  }
}

export async function getPlatformSetting(key: string): Promise<string | null> {
  return (await getPlatformSettingsMap([key]))[key] ?? null;
}

/**
 * Upsert (value) or delete (null) a setting. Throws on failure — callers are
 * admin routes that must surface save errors to the UI.
 */
export async function setPlatformSetting(key: string, value: string | null): Promise<void> {
  if (value === null) {
    await db.delete(platformSettings).where(eq(platformSettings.key, key));
    return;
  }
  const stored = isSecretSettingKey(key) ? encryptApiKey(value) : value;
  const updatedAt = new Date();
  await db
    .insert(platformSettings)
    .values({ key, value: stored, updatedAt })
    .onConflictDoUpdate({
      target: platformSettings.key,
      set: { value: stored, updatedAt },
    });
}
