/**
 * Platform email configuration resolver.
 *
 * Single source of truth for the platform-level Resend credentials, sender
 * address, transport mode and webhook secrets. Resolution order for every
 * value: admin setting (platform_settings) → env var → built-in default.
 *
 * No result caching on purpose: sends are low-frequency, and an admin save
 * (or a rotated key) must take effect on the very next send in EVERY process
 * — app and cron run in separate containers, so an in-process cache would go
 * stale per container.
 */

import { Resend } from 'resend';
import { getPlatformSettingsMap } from '@/lib/settings/platform';

export const EMAIL_SETTING_KEYS = {
  resendApiKey: 'email.resend_api_key', // pragma: allowlist secret
  fromEmail: 'email.from_email',
  transport: 'email.transport',
  webhookSecret: 'email.webhook_secret', // pragma: allowlist secret
  inboundSecret: 'email.inbound_secret', // pragma: allowlist secret
} as const;

export const DEFAULT_FROM_EMAIL = 'noreply@simplerdevelopment.com';

export type EmailTransportMode = 'mailpit' | 'resend';
export type SettingSource = 'db' | 'env' | 'none';

export interface EmailPlatformConfig {
  resendApiKey: string | null;
  resendApiKeySource: SettingSource;
  fromEmail: string;
  fromEmailSource: SettingSource | 'default';
  transport: EmailTransportMode;
  transportSource: SettingSource | 'default';
  webhookSecret: string | null;
  webhookSecretSource: SettingSource;
  inboundSecret: string | null;
  inboundSecretSource: SettingSource;
}

function pick(
  dbValue: string | null | undefined,
  envValue: string | null | undefined,
): { value: string | null; source: SettingSource } {
  if (dbValue != null && dbValue !== '') return { value: dbValue, source: 'db' };
  if (envValue != null && envValue !== '') return { value: envValue, source: 'env' };
  return { value: null, source: 'none' };
}

export async function getEmailPlatformConfig(): Promise<EmailPlatformConfig> {
  const dbValues = await getPlatformSettingsMap(Object.values(EMAIL_SETTING_KEYS));

  const key = pick(dbValues[EMAIL_SETTING_KEYS.resendApiKey], process.env.RESEND_API_KEY);
  const from = pick(dbValues[EMAIL_SETTING_KEYS.fromEmail], process.env.RESEND_FROM_EMAIL);
  const transport = pick(dbValues[EMAIL_SETTING_KEYS.transport], process.env.EMAIL_TRANSPORT);
  const webhook = pick(dbValues[EMAIL_SETTING_KEYS.webhookSecret], process.env.RESEND_WEBHOOK_SECRET);
  const inbound = pick(dbValues[EMAIL_SETTING_KEYS.inboundSecret], process.env.INBOUND_EMAIL_SECRET);

  return {
    resendApiKey: key.value,
    resendApiKeySource: key.source,
    fromEmail: from.value ?? DEFAULT_FROM_EMAIL,
    fromEmailSource: from.value ? from.source : 'default',
    transport: transport.value === 'mailpit' ? 'mailpit' : 'resend',
    transportSource: transport.source === 'none' ? 'default' : transport.source,
    webhookSecret: webhook.value,
    webhookSecretSource: webhook.source,
    inboundSecret: inbound.value,
    inboundSecretSource: inbound.source,
  };
}

/** Effective platform sender address (DB → env → default). */
export async function getPlatformFromEmail(): Promise<string> {
  return (await getEmailPlatformConfig()).fromEmail;
}

/**
 * Sender address as EXPLICITLY configured (DB → env), or null when neither is
 * set. Callers with a feature-specific branded fallback (bookings@…, store@…)
 * use this so their fallback survives; generic platform sends should use
 * getPlatformFromEmail(), which applies the platform default.
 */
export async function getConfiguredFromEmail(): Promise<string | null> {
  const cfg = await getEmailPlatformConfig();
  return cfg.fromEmailSource === 'default' ? null : cfg.fromEmail;
}

/**
 * Configured sender or a caller-specific branded fallback (bookings@…,
 * store@…). Distinct from getPlatformFromEmail(), which applies the platform
 * default rather than the feature's own.
 */
export async function getConfiguredFromEmailOr(fallback: string): Promise<string> {
  return (await getConfiguredFromEmail()) ?? fallback;
}

/**
 * Resend client for platform APIs (domains.*, audiences, …) using the
 * effective platform key. Throws a clear error when nothing is configured.
 */
export async function getResendClient(): Promise<Resend> {
  const cfg = await getEmailPlatformConfig();
  if (!cfg.resendApiKey) {
    throw new Error('Resend API key is not configured (Admin → Email → Ajustes, or RESEND_API_KEY)');
  }
  return new Resend(cfg.resendApiKey);
}
