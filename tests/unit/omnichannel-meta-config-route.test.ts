// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const eqMock = vi.fn((column: unknown, value: unknown) => ({ op: 'eq', column, value }));
const andMock = vi.fn((...predicates: unknown[]) => ({ op: 'and', predicates }));
vi.mock('drizzle-orm', () => ({ eq: eqMock, and: andMock }));

const table = (name: string) => new Proxy({ __table: name }, {
  get(target, property: string) {
    if (property in target) return target[property as keyof typeof target];
    if (property === 'then') return undefined;
    return { __table: name, __column: property };
  },
});
vi.mock('@/lib/db/schema', () => ({
  channelProviderConfigs: table('channelProviderConfigs'),
  conversationAuditLogs: table('conversationAuditLogs'),
}));

let selectQueue: Array<Array<Record<string, unknown>>> = [];
const inserted: Array<{ table: unknown; values: Record<string, unknown>; conflict?: unknown }> = [];

function selectChain() {
  const rows = selectQueue.shift() ?? [];
  const chain: Record<string, unknown> = {};
  for (const method of ['from', 'where']) chain[method] = () => chain;
  chain.limit = async () => rows;
  return chain;
}

function insertChain(target: unknown) {
  return {
    values(values: Record<string, unknown>) {
      const record = { table: target, values, conflict: undefined as unknown };
      inserted.push(record);
      return {
        onConflictDoUpdate(conflict: unknown) {
          record.conflict = conflict;
          return { returning: async () => [{ publicId: values.publicId }] };
        },
      };
    },
  };
}

vi.mock('@/lib/db', () => ({
  db: {
    select: () => selectChain(),
    transaction: async (callback: (tx: unknown) => Promise<void>) => callback({ insert: insertChain }),
  },
}));

const authorizePortalMock = vi.fn();
vi.mock('@/lib/portal-auth', () => ({
  authorizePortal: (...args: unknown[]) => authorizePortalMock(...args),
  isAuthError: (value: { response?: Response }) => Boolean(value?.response),
}));

const hasEncryptionKeyMock = vi.fn(() => true);
vi.mock('@/lib/crypto/secrets', () => ({
  hasWorkspaceTenantSecretsKey: () => hasEncryptionKeyMock(),
}));

const route = await import('@/app/api/portal/channels/meta/config/route');

const authz = { client: { id: 77 }, userId: 9 };
const validInput = {
  appId: '1234567890',
  appSecret: '0123456789abcdef0123456789abcdef', // pragma: allowlist secret
  loginConfigId: '9876543210',
  webhookVerifyToken: 'a-private-verify-token', // pragma: allowlist secret
};

beforeEach(() => {
  selectQueue = [];
  inserted.length = 0;
  eqMock.mockClear();
  andMock.mockClear();
  authorizePortalMock.mockReset().mockResolvedValue(authz);
  hasEncryptionKeyMock.mockReset().mockReturnValue(true);
  delete process.env.NEXT_PUBLIC_APP_URL;
  delete process.env.META_APP_ID;
  delete process.env.META_APP_SECRET;
  delete process.env.META_LOGIN_CONFIG_ID;
  delete process.env.META_WEBHOOK_VERIFY_TOKEN;
});

describe('Meta tenant configuration route', () => {
  it('returns only non-secret tenant fields and tenant-specific URLs', async () => {
    selectQueue.push([{ publicId: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa', appId: '1234567890', loginConfigId: '9876543210' }]);
    const response = await route.GET(new Request('https://crm.example/api/portal/channels/meta/config'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data).toMatchObject({
      configured: true,
      source: 'tenant',
      appId: '1234567890',
      loginConfigId: '9876543210',
      hasAppSecret: true,
      hasWebhookVerifyToken: true,
      callbackUrl: 'https://crm.example/api/portal/channels/meta/callback',
      webhookUrl: 'https://crm.example/api/webhooks/meta?config=aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',
    });
    expect(JSON.stringify(body)).not.toContain('appSecret');
    expect(JSON.stringify(body)).not.toContain('webhookVerifyToken');
    expect(eqMock).toHaveBeenCalledWith(expect.objectContaining({ __column: 'clientId' }), 77);
  });

  it('stores fresh secrets for the active tenant, audits the change, and redacts the response', async () => {
    selectQueue.push([]);
    const response = await route.PUT(new Request('https://crm.example/api/portal/channels/meta/config', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(validInput),
    }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(inserted[0].values).toMatchObject({
      clientId: 77,
      provider: 'meta',
      appId: validInput.appId,
      appSecret: validInput.appSecret,
      loginConfigId: validInput.loginConfigId,
      webhookVerifyToken: validInput.webhookVerifyToken,
      configuredByUserId: 9,
    });
    expect(inserted[1].values).toMatchObject({ clientId: 77, action: 'channel.meta_config_saved' });
    expect(JSON.stringify(inserted[1].values)).not.toContain(validInput.appSecret);
    expect(JSON.stringify(body)).not.toContain(validInput.appSecret);
    expect(JSON.stringify(body)).not.toContain(validInput.webhookVerifyToken);
  });

  it('keeps existing secrets when password inputs are blank', async () => {
    selectQueue.push([{
      publicId: 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb',
      appSecret: 'existing-app-secret', // pragma: allowlist secret
      webhookVerifyToken: 'existing-verify-token', // pragma: allowlist secret
    }]);
    const response = await route.PUT(new Request('https://crm.example/api/portal/channels/meta/config', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...validInput, appSecret: '', webhookVerifyToken: '' }),
    }));

    expect(response.status).toBe(200);
    expect(inserted[0].values).toMatchObject({
      publicId: 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb',
      appSecret: 'existing-app-secret', // pragma: allowlist secret
      webhookVerifyToken: 'existing-verify-token', // pragma: allowlist secret
    });
  });

  it('rejects malformed secrets before writing', async () => {
    const response = await route.PUT(new Request('https://crm.example/api/portal/channels/meta/config', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...validInput, appSecret: 'too-short' }),
    }));
    expect(response.status).toBe(400);
    expect(inserted).toHaveLength(0);
  });

  it('fails closed when the deployment encryption key is unavailable', async () => {
    hasEncryptionKeyMock.mockReturnValue(false);
    const response = await route.PUT(new Request('https://crm.example/api/portal/channels/meta/config', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(validInput),
    }));
    expect(response.status).toBe(503);
    expect(inserted).toHaveLength(0);
  });
});
