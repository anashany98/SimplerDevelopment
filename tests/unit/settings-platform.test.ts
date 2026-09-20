// @vitest-environment node
/**
 * Unit tests for lib/settings/platform.ts — DB-backed platform settings with
 * encrypted secrets (Admin → Email → Ajustes).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY ?? 'ab'.repeat(32);

const H = vi.hoisted(() => ({
  rows: [] as Array<{ key: string; value: string; updatedAt: Date }>,
  failReads: false,
  failWrites: false,
  deleteCalls: [] as unknown[],
}));

vi.mock('@/lib/db', () => ({
  db: {
    select: () => ({
      from: () => ({
        where: async () => {
          if (H.failReads) throw new Error('db down');
          return H.rows.slice();
        },
      }),
    }),
    insert: () => ({
      values: (v: { key: string; value: string; updatedAt?: Date }) => ({
        onConflictDoUpdate: async () => {
          if (H.failWrites) throw new Error('write down');
          const row = { key: v.key, value: v.value, updatedAt: v.updatedAt ?? new Date() };
          const i = H.rows.findIndex((r) => r.key === v.key);
          if (i >= 0) H.rows[i] = row;
          else H.rows.push(row);
        },
      }),
    }),
    delete: () => ({
      where: async (cond: unknown) => {
        H.deleteCalls.push(cond);
      },
    }),
  },
}));

import { decryptApiKey } from '@/lib/crypto/api-key';
import {
  getPlatformSetting,
  getPlatformSettingsMap,
  isSecretSettingKey,
  setPlatformSetting,
} from '@/lib/settings/platform';

describe('lib/settings/platform', () => {
  beforeEach(() => {
    H.rows.length = 0;
    H.failReads = false;
    H.failWrites = false;
    H.deleteCalls.length = 0;
  });

  it('classifies secret keys by _secret / _api_key suffix', () => {
    expect(isSecretSettingKey('email.resend_api_key')).toBe(true);
    expect(isSecretSettingKey('email.webhook_secret')).toBe(true);
    expect(isSecretSettingKey('email.inbound_secret')).toBe(true);
    expect(isSecretSettingKey('email.from_email')).toBe(false);
    expect(isSecretSettingKey('email.transport')).toBe(false);
  });

  it('stores secrets encrypted at rest and reads them decrypted', async () => {
    await setPlatformSetting('email.resend_api_key', 're_secret_123456');
    expect(H.rows[0].value).not.toContain('re_secret_123456');
    expect(decryptApiKey(H.rows[0].value)).toBe('re_secret_123456');
    expect(await getPlatformSetting('email.resend_api_key')).toBe('re_secret_123456');
  });

  it('stores non-secret values as plaintext', async () => {
    await setPlatformSetting('email.from_email', 'noreply@example.com');
    expect(H.rows[0].value).toBe('noreply@example.com');
    expect(await getPlatformSetting('email.from_email')).toBe('noreply@example.com');
  });

  it('upserts on conflict instead of duplicating rows', async () => {
    await setPlatformSetting('email.transport', 'resend');
    await setPlatformSetting('email.transport', 'mailpit');
    expect(H.rows).toHaveLength(1);
    expect(await getPlatformSetting('email.transport')).toBe('mailpit');
  });

  it('deletes the row when the value is null', async () => {
    await setPlatformSetting('email.from_email', null);
    expect(H.deleteCalls).toHaveLength(1);
  });

  it('degrades reads to {} when the table is missing or the DB is down', async () => {
    H.rows.push({ key: 'email.transport', value: 'mailpit', updatedAt: new Date() });
    H.failReads = true;
    await expect(getPlatformSettingsMap(['email.transport'])).resolves.toEqual({});
    await expect(getPlatformSetting('email.transport')).resolves.toBeNull();
  });

  it('omits secrets that fail to decrypt so callers fall back', async () => {
    H.rows.push({ key: 'email.webhook_secret', value: 'not-a-valid-envelope', updatedAt: new Date() });
    await expect(getPlatformSettingsMap(['email.webhook_secret'])).resolves.toEqual({});
  });

  it('propagates write failures (the admin UI must surface save errors)', async () => {
    H.failWrites = true;
    await expect(setPlatformSetting('email.from_email', 'x@example.com')).rejects.toThrow('write down');
  });

  it('returns an empty map for an empty key list without touching the DB', async () => {
    H.failReads = true;
    await expect(getPlatformSettingsMap([])).resolves.toEqual({});
  });
});
