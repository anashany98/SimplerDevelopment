// @vitest-environment node
/**
 * Unit tests for lib/email/config.ts — the platform email configuration
 * resolver (DB setting → env var → default).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const H = vi.hoisted(() => ({ map: {} as Record<string, string> }));

vi.mock('@/lib/settings/platform', () => ({
  getPlatformSettingsMap: vi.fn(async () => H.map),
}));

import {
  DEFAULT_FROM_EMAIL,
  EMAIL_SETTING_KEYS,
  getConfiguredFromEmail,
  getEmailPlatformConfig,
  getPlatformFromEmail,
  getResendClient,
} from '@/lib/email/config';

const ENV_KEYS = [
  'RESEND_API_KEY',
  'RESEND_FROM_EMAIL',
  'EMAIL_TRANSPORT',
  'RESEND_WEBHOOK_SECRET',
  'INBOUND_EMAIL_SECRET',
] as const;

const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  H.map = {};
  for (const k of ENV_KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe('lib/email/config', () => {
  it('falls back to built-in defaults when nothing is configured', async () => {
    const cfg = await getEmailPlatformConfig();
    expect(cfg.resendApiKey).toBeNull();
    expect(cfg.resendApiKeySource).toBe('none');
    expect(cfg.fromEmail).toBe(DEFAULT_FROM_EMAIL);
    expect(cfg.fromEmailSource).toBe('default');
    expect(cfg.transport).toBe('resend');
    expect(cfg.transportSource).toBe('default');
    expect(await getConfiguredFromEmail()).toBeNull();
    expect(await getPlatformFromEmail()).toBe(DEFAULT_FROM_EMAIL);
  });

  it('uses env vars when no DB setting exists', async () => {
    process.env.RESEND_API_KEY = 're_env';
    process.env.RESEND_FROM_EMAIL = 'env@example.com';
    process.env.EMAIL_TRANSPORT = 'mailpit';
    process.env.RESEND_WEBHOOK_SECRET = 'whsec_env';

    const cfg = await getEmailPlatformConfig();
    expect(cfg.resendApiKey).toBe('re_env');
    expect(cfg.resendApiKeySource).toBe('env');
    expect(cfg.fromEmail).toBe('env@example.com');
    expect(cfg.fromEmailSource).toBe('env');
    expect(cfg.transport).toBe('mailpit');
    expect(cfg.transportSource).toBe('env');
    expect(cfg.webhookSecret).toBe('whsec_env');
    expect(await getConfiguredFromEmail()).toBe('env@example.com');
  });

  it('DB settings win over env vars', async () => {
    process.env.RESEND_API_KEY = 're_env';
    process.env.EMAIL_TRANSPORT = 'mailpit';
    H.map = {
      [EMAIL_SETTING_KEYS.resendApiKey]: 're_db',
      [EMAIL_SETTING_KEYS.fromEmail]: 'db@example.com',
      [EMAIL_SETTING_KEYS.transport]: 'resend',
    };

    const cfg = await getEmailPlatformConfig();
    expect(cfg.resendApiKey).toBe('re_db');
    expect(cfg.resendApiKeySource).toBe('db');
    expect(cfg.fromEmail).toBe('db@example.com');
    expect(cfg.fromEmailSource).toBe('db');
    expect(cfg.transport).toBe('resend');
    expect(cfg.transportSource).toBe('db');
  });

  it('treats unknown transport values as resend', async () => {
    H.map = { [EMAIL_SETTING_KEYS.transport]: 'nonsense' };
    expect((await getEmailPlatformConfig()).transport).toBe('resend');
  });

  it('exposes the inbound secret from DB or env', async () => {
    process.env.INBOUND_EMAIL_SECRET = 'inbound_env';
    expect((await getEmailPlatformConfig()).inboundSecret).toBe('inbound_env');
    H.map = { [EMAIL_SETTING_KEYS.inboundSecret]: 'inbound_db' };
    expect((await getEmailPlatformConfig()).inboundSecret).toBe('inbound_db');
  });

  it('getResendClient throws a clear error when no key is configured', async () => {
    await expect(getResendClient()).rejects.toThrow(/not configured/);
  });

  it('getResendClient builds a client when a key exists', async () => {
    process.env.RESEND_API_KEY = 're_x';
    const client = await getResendClient();
    expect(client).toBeTruthy();
  });
});
