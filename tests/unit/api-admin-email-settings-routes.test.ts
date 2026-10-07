// @vitest-environment node
/**
 * Unit tests for the admin email settings API:
 *   - app/api/admin/email/settings/route.ts       (GET snapshot / PUT updates)
 *   - app/api/admin/email/settings/test/route.ts  (POST real test send)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

interface Cfg {
  resendApiKey: string | null;
  resendApiKeySource: string;
  fromEmail: string;
  fromEmailSource: string;
  transport: string;
  transportSource: string;
  webhookSecret: string | null;
  webhookSecretSource: string;
  inboundSecret: string | null;
  inboundSecretSource: string;
}

const baseCfg = (): Cfg => ({
  resendApiKey: null,
  resendApiKeySource: 'none',
  fromEmail: 'noreply@simplerdevelopment.com',
  fromEmailSource: 'default',
  transport: 'resend',
  transportSource: 'default',
  webhookSecret: null,
  webhookSecretSource: 'none',
  inboundSecret: null,
  inboundSecretSource: 'none',
});

const H = vi.hoisted(() => ({
  authResult: null as unknown,
  cfg: {
    resendApiKey: null,
    resendApiKeySource: 'none',
    fromEmail: 'noreply@simplerdevelopment.com',
    fromEmailSource: 'default',
    transport: 'resend',
    transportSource: 'default',
    webhookSecret: null,
    webhookSecretSource: 'none',
    inboundSecret: null,
    inboundSecretSource: 'none',
  },
  overrides: {} as Record<string, boolean>,
  setCalls: [] as Array<[string, string | null]>,
  sendMock: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  auth: vi.fn(async () => H.authResult),
}));

vi.mock('@/lib/settings/platform', () => ({
  getPlatformSettingsMap: vi.fn(async () => {
    const out: Record<string, string> = {};
    for (const [k, has] of Object.entries(H.overrides)) {
      if (has) out[k] = 'stored-value';
    }
    return out;
  }),
  setPlatformSetting: vi.fn(async (key: string, value: string | null) => {
    H.setCalls.push([key, value]);
  }),
}));

vi.mock('@/lib/email', () => ({
  EMAIL_SETTING_KEYS: {
    resendApiKey: 'email.resend_api_key', // pragma: allowlist secret
    fromEmail: 'email.from_email',
    transport: 'email.transport',
    webhookSecret: 'email.webhook_secret', // pragma: allowlist secret
    inboundSecret: 'email.inbound_secret', // pragma: allowlist secret
  },
  getEmailPlatformConfig: vi.fn(async () => H.cfg),
}));

vi.mock('resend', () => ({
  Resend: class {
    emails = { send: H.sendMock };
  },
}));

import { GET as getSettings, PUT as putSettings } from '@/app/api/admin/email/settings/route';
import { POST as postTestSend } from '@/app/api/admin/email/settings/test/route';

const req = (method: string, body?: unknown) =>
  new Request('http://test.local/api/admin/email/settings', {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

beforeEach(() => {
  H.authResult = { user: { id: 1, role: 'admin', email: 'admin@example.com' } };
  H.cfg = baseCfg();
  H.overrides = {};
  H.setCalls = [];
  H.sendMock.mockReset();
  H.sendMock.mockResolvedValue({ data: { id: 'rs_1' }, error: null });
});

describe('GET /api/admin/email/settings', () => {
  it('rejects non-admins', async () => {
    H.authResult = { user: { id: 2, role: 'client' } };
    const res = await getSettings();
    expect(res.status).toBe(401);
  });

  it('returns a masked snapshot with sources and override flags', async () => {
    H.cfg = {
      ...baseCfg(),
      resendApiKey: 're_abcdef123456',
      resendApiKeySource: 'db',
      fromEmail: 'noreply@anaxia.tech',
      fromEmailSource: 'db',
      transport: 'mailpit',
      transportSource: 'env',
      webhookSecret: 'whsec_123456789',
      webhookSecretSource: 'env',
    };
    H.overrides = { 'email.resend_api_key': true };

    const res = await getSettings();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.resendApiKey.configured).toBe(true);
    expect(json.data.resendApiKey.masked).toBe('re_ab…3456');
    expect(json.data.resendApiKey.masked).not.toContain('abcdef');
    expect(json.data.resendApiKey.hasDbOverride).toBe(true);
    expect(json.data.fromEmail.value).toBe('noreply@anaxia.tech');
    expect(json.data.transport.value).toBe('mailpit');
    expect(json.data.transport.source).toBe('env');
    expect(json.data.webhookSecret.configured).toBe(true);
    expect(json.data.inboundSecret.configured).toBe(false);
  });
});

describe('PUT /api/admin/email/settings', () => {
  it('rejects non-admins', async () => {
    H.authResult = null;
    const res = await putSettings(req('PUT', { fromEmail: 'x@example.com' }));
    expect(res.status).toBe(401);
  });

  it('stores a valid resend key', async () => {
    const res = await putSettings(req('PUT', { resendApiKey: 're_live_123456' }));
    expect(res.status).toBe(200);
    expect(H.setCalls).toEqual([['email.resend_api_key', 're_live_123456']]);
  });

  it('rejects keys that do not look like Resend keys', async () => {
    const res = await putSettings(req('PUT', { resendApiKey: 'sk_test_123' }));
    expect(res.status).toBe(400);
    expect(H.setCalls).toEqual([]);
  });

  it('rejects invalid from addresses', async () => {
    const res = await putSettings(req('PUT', { fromEmail: 'not-an-email' }));
    expect(res.status).toBe(400);
    expect(H.setCalls).toEqual([]);
  });

  it('validates the transport enum', async () => {
    const res = await putSettings(req('PUT', { transport: 'smtp' }));
    expect(res.status).toBe(400);
    expect(H.setCalls).toEqual([]);
  });

  it('null clears the DB override', async () => {
    const res = await putSettings(req('PUT', { transport: null }));
    expect(res.status).toBe(200);
    expect(H.setCalls).toEqual([['email.transport', null]]);
  });

  it('treats a blank string as clearing the override', async () => {
    const res = await putSettings(req('PUT', { fromEmail: '   ' }));
    expect(res.status).toBe(200);
    expect(H.setCalls).toEqual([['email.from_email', null]]);
  });

  it('applies several fields in one save', async () => {
    const res = await putSettings(
      req('PUT', { fromEmail: 'noreply@anaxia.tech', transport: 'resend', webhookSecret: 'whsec_x' }),
    );
    expect(res.status).toBe(200);
    expect(H.setCalls).toEqual([
      ['email.from_email', 'noreply@anaxia.tech'],
      ['email.transport', 'resend'],
      ['email.webhook_secret', 'whsec_x'],
    ]);
  });

  it('rejects a payload with nothing to update', async () => {
    const res = await putSettings(req('PUT', {}));
    expect(res.status).toBe(400);
    expect(H.setCalls).toEqual([]);
  });
});

describe('POST /api/admin/email/settings/test', () => {
  it('rejects non-admins', async () => {
    H.authResult = null;
    const res = await postTestSend(req('POST', { to: 'x@example.com' }));
    expect(res.status).toBe(401);
  });

  it('errors clearly when no Resend key is configured', async () => {
    const res = await postTestSend(req('POST', { to: 'x@example.com' }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.message).toMatch(/not configured/i);
    expect(H.sendMock).not.toHaveBeenCalled();
  });

  it('sends through Resend with the configured from address', async () => {
    H.cfg = { ...baseCfg(), resendApiKey: 're_x', fromEmail: 'noreply@anaxia.tech' };
    const res = await postTestSend(req('POST', { to: 'dest@example.com' }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data).toMatchObject({ id: 'rs_1', from: 'noreply@anaxia.tech', to: 'dest@example.com' });
    expect(H.sendMock).toHaveBeenCalledWith(
      expect.objectContaining({ from: 'CRM AGENTS <noreply@anaxia.tech>', to: 'dest@example.com' }),
    );
  });

  it('defaults the recipient to the admin own address', async () => {
    H.cfg = { ...baseCfg(), resendApiKey: 're_x' };
    const res = await postTestSend(req('POST', {}));
    expect(res.status).toBe(200);
    expect(H.sendMock).toHaveBeenCalledWith(expect.objectContaining({ to: 'admin@example.com' }));
  });

  it('surfaces Resend errors verbatim (e.g. domain not verified)', async () => {
    H.cfg = { ...baseCfg(), resendApiKey: 're_x' };
    H.sendMock.mockResolvedValue({ data: null, error: { message: 'The domain is not verified' } });
    const res = await postTestSend(req('POST', { to: 'dest@example.com' }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.message).toBe('The domain is not verified');
  });
});
