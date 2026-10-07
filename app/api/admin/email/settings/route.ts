import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { EMAIL_SETTING_KEYS, getEmailPlatformConfig } from '@/lib/email';
import { getPlatformSettingsMap, setPlatformSetting } from '@/lib/settings/platform';

async function requireAdmin() {
  const session = await auth();
  if (!session?.user?.id) return null;
  const role = (session.user as { role?: string })?.role;
  if (role !== 'admin') return null;
  return session;
}

function maskSecret(value: string | null): string | null {
  if (!value) return null;
  if (value.length <= 8) return '••••';
  return `${value.slice(0, 5)}…${value.slice(-4)}`;
}

const FROM_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TRANSPORTS = ['resend', 'mailpit'];

/**
 * Snapshot for the admin settings page: effective values + where each one
 * comes from (db setting / env var / default) + whether a DB override exists
 * (so the UI can offer "clear override"). Secrets are masked, never returned.
 */
async function buildSnapshot() {
  const cfg = await getEmailPlatformConfig();
  const dbRows = await getPlatformSettingsMap(Object.values(EMAIL_SETTING_KEYS));
  const has = (k: string) => dbRows[k] !== undefined;

  return {
    resendApiKey: {
      configured: !!cfg.resendApiKey,
      masked: maskSecret(cfg.resendApiKey),
      source: cfg.resendApiKeySource,
      hasDbOverride: has(EMAIL_SETTING_KEYS.resendApiKey),
    },
    fromEmail: {
      value: cfg.fromEmail,
      source: cfg.fromEmailSource,
      hasDbOverride: has(EMAIL_SETTING_KEYS.fromEmail),
    },
    transport: {
      value: cfg.transport,
      source: cfg.transportSource,
      hasDbOverride: has(EMAIL_SETTING_KEYS.transport),
    },
    webhookSecret: {
      configured: !!cfg.webhookSecret,
      source: cfg.webhookSecretSource,
      hasDbOverride: has(EMAIL_SETTING_KEYS.webhookSecret),
    },
    inboundSecret: {
      configured: !!cfg.inboundSecret,
      source: cfg.inboundSecretSource,
      hasDbOverride: has(EMAIL_SETTING_KEYS.inboundSecret),
    },
  };
}

export async function GET() {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  return NextResponse.json({ success: true, data: await buildSnapshot() });
}

export async function PUT(req: Request) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ success: false, message: 'Invalid JSON body.' }, { status: 400 });
  }

  // undefined = not present (no change); null or '' = clear DB override
  // (fell back to env/default); string = set.
  const normalize = (v: unknown): string | null | undefined => {
    if (v === undefined) return undefined;
    if (v === null) return null;
    if (typeof v !== 'string') return undefined;
    const t = v.trim();
    return t === '' ? null : t;
  };

  const invalid = (message: string) => NextResponse.json({ success: false, message }, { status: 400 });

  const updates: Array<[string, string | null]> = [];

  if ('resendApiKey' in body) {
    const v = normalize(body.resendApiKey);
    if (v === undefined) return invalid('resendApiKey must be a string or null.');
    if (v !== null && !v.startsWith('re_')) return invalid('Resend API keys start with "re_".');
    updates.push([EMAIL_SETTING_KEYS.resendApiKey, v]);
  }

  if ('fromEmail' in body) {
    const v = normalize(body.fromEmail);
    if (v === undefined) return invalid('fromEmail must be a string or null.');
    if (v !== null && !FROM_EMAIL_RE.test(v)) return invalid('fromEmail must be a valid email address.');
    updates.push([EMAIL_SETTING_KEYS.fromEmail, v]);
  }

  if ('transport' in body) {
    const v = normalize(body.transport);
    if (v === undefined) return invalid('transport must be a string or null.');
    if (v !== null && !TRANSPORTS.includes(v)) return invalid(`transport must be one of: ${TRANSPORTS.join(', ')}.`);
    updates.push([EMAIL_SETTING_KEYS.transport, v]);
  }

  if ('webhookSecret' in body) {
    const v = normalize(body.webhookSecret);
    if (v === undefined) return invalid('webhookSecret must be a string or null.');
    updates.push([EMAIL_SETTING_KEYS.webhookSecret, v]);
  }

  if ('inboundSecret' in body) {
    const v = normalize(body.inboundSecret);
    if (v === undefined) return invalid('inboundSecret must be a string or null.');
    updates.push([EMAIL_SETTING_KEYS.inboundSecret, v]);
  }

  if (updates.length === 0) {
    return invalid('Nothing to update.');
  }

  try {
    for (const [key, value] of updates) {
      await setPlatformSetting(key, value);
    }
  } catch (err) {
    console.error('[admin/email/settings] save failed', err);
    return NextResponse.json({ success: false, message: 'Failed to save settings.' }, { status: 500 });
  }

  return NextResponse.json({ success: true, data: await buildSnapshot() });
}
