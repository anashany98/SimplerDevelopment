// @vitest-environment node
import { createHmac } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const eqMock = vi.fn((column: unknown, value: unknown) => ({ op: 'eq', column, value }));
vi.mock('drizzle-orm', () => ({
  eq: eqMock,
  and: (...predicates: unknown[]) => ({ op: 'and', predicates }),
}));

vi.mock('@/lib/db/schema', () => ({
  channelConnections: new Proxy({}, {
    get: (_target, property: string) => property === 'then' ? undefined : { __column: property },
  }),
}));

let selectedRows: Array<Record<string, unknown>> = [];
const selectMock = vi.fn(() => {
  const chain: Record<string, unknown> = {};
  chain.from = () => chain;
  chain.where = () => chain;
  chain.limit = async () => selectedRows;
  return chain;
});
vi.mock('@/lib/db', () => ({ db: { select: () => selectMock() } }));

const resolveByPublicIdMock = vi.fn();
const resolveEnvironmentMock = vi.fn();
vi.mock('@/lib/channels/meta-config', () => ({
  resolveMetaConfigByPublicId: (...args: unknown[]) => resolveByPublicIdMock(...args),
  resolveEnvironmentMetaConfig: (...args: unknown[]) => resolveEnvironmentMock(...args),
}));

const handleWebhookMock = vi.fn(async () => ({ messages: [], statuses: [] }));
vi.mock('@/lib/channels/adapters', () => ({
  getChannelAdapter: () => ({ handleWebhook: handleWebhookMock }),
}));

const ingestMock = vi.fn();
const statusMock = vi.fn();
vi.mock('@/lib/channels/service', () => ({
  adapterConnection: (connection: unknown) => connection,
  ingestInboundMessage: (...args: unknown[]) => ingestMock(...args),
  applyProviderStatus: (...args: unknown[]) => statusMock(...args),
}));

const route = await import('@/app/api/webhooks/meta/route');

const config = {
  source: 'tenant',
  clientId: 77,
  publicId: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',
  appId: '1234567890',
  appSecret: '0123456789abcdef0123456789abcdef', // pragma: allowlist secret
  loginConfigId: '9876543210',
  webhookVerifyToken: 'verify-token-for-tests', // pragma: allowlist secret
};

function signature(raw: string, secret = config.appSecret) {
  return `sha256=${createHmac('sha256', secret).update(raw).digest('hex')}`;
}

beforeEach(() => {
  selectedRows = [{ id: 12, clientId: 77, channel: 'whatsapp', provider: 'meta', externalAccountId: 'phone-1', status: 'connected' }];
  selectMock.mockClear();
  eqMock.mockClear();
  resolveByPublicIdMock.mockReset().mockResolvedValue(config);
  resolveEnvironmentMock.mockReset().mockReturnValue(null);
  handleWebhookMock.mockClear();
  ingestMock.mockClear();
  statusMock.mockClear();
});

describe('tenant-scoped Meta webhook route', () => {
  it('verifies a tenant webhook challenge with the stored token', async () => {
    const response = await route.GET(new Request(
      `https://crm.example/api/webhooks/meta?config=${config.publicId}&hub.mode=subscribe&hub.verify_token=${config.webhookVerifyToken}&hub.challenge=challenge-123`,
    ));
    expect(response.status).toBe(200);
    expect(await response.text()).toBe('challenge-123');
    expect(resolveByPublicIdMock).toHaveBeenCalledWith(config.publicId);
  });

  it('rejects a bad signature before looking up or processing a connection', async () => {
    const raw = JSON.stringify({ entry: [{ changes: [{ value: { metadata: { phone_number_id: 'phone-1' } } }] }] });
    const response = await route.POST(new Request(`https://crm.example/api/webhooks/meta?config=${config.publicId}`, {
      method: 'POST', body: raw, headers: { 'x-hub-signature-256': signature(`${raw}-tampered`) },
    }));
    expect(response.status).toBe(401);
    expect(selectMock).not.toHaveBeenCalled();
    expect(handleWebhookMock).not.toHaveBeenCalled();
  });

  it('binds a signed payload to the configuration tenant before processing', async () => {
    const raw = JSON.stringify({ entry: [{ changes: [{ value: { metadata: { phone_number_id: 'phone-1' } } }] }] });
    const response = await route.POST(new Request(`https://crm.example/api/webhooks/meta?config=${config.publicId}`, {
      method: 'POST', body: raw, headers: { 'x-hub-signature-256': signature(raw) },
    }));
    expect(response.status).toBe(200);
    expect(eqMock).toHaveBeenCalledWith(expect.objectContaining({ __column: 'clientId' }), 77);
    expect(handleWebhookMock).toHaveBeenCalledOnce();
  });

  it('fails closed for an unknown tenant configuration', async () => {
    resolveByPublicIdMock.mockResolvedValue(null);
    const response = await route.POST(new Request(`https://crm.example/api/webhooks/meta?config=${config.publicId}`, {
      method: 'POST', body: '{}', headers: { 'x-hub-signature-256': signature('{}') },
    }));
    expect(response.status).toBe(503);
    expect(selectMock).not.toHaveBeenCalled();
  });
});
