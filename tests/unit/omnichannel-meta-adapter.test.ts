import { describe, expect, it, vi } from 'vitest';

const metaGraphRequestMock = vi.hoisted(() => vi.fn());
const exchangeMetaAuthorizationCodeMock = vi.hoisted(() => vi.fn());
vi.mock('@/lib/channels/meta-client', () => ({
  exchangeMetaAuthorizationCode: exchangeMetaAuthorizationCodeMock,
  metaGraphRequest: metaGraphRequestMock,
  META_GRAPH_VERSION: 'v26.0',
}));
import { MetaChannelAdapter } from '@/lib/channels/adapters/meta';
import type { AdapterConnection } from '@/lib/channels/types';

function connection(channel: 'whatsapp' | 'messenger' | 'instagram'): AdapterConnection {
  return { clientId: 1, channel, provider: 'meta', externalAccountId: 'asset-1', credentials: { accessToken: 'test-only' } };
}

describe('Meta adapter normalization @critical', () => {
  it('uses the tenant Meta app credentials for OAuth code exchange', async () => {
    exchangeMetaAuthorizationCodeMock.mockResolvedValueOnce('tenant-access-token');
    const assets = await new MetaChannelAdapter('whatsapp').connect({
      clientId: 77,
      authorizationCode: 'authorization-code',
      redirectUri: 'https://crm.example/api/portal/channels/meta/callback',
      oauthCredentials: { appId: '1234567890', appSecret: 'tenant-app-secret' }, // pragma: allowlist secret
    });

    expect(exchangeMetaAuthorizationCodeMock).toHaveBeenCalledWith(
      'authorization-code',
      'https://crm.example/api/portal/channels/meta/callback',
      { appId: '1234567890', appSecret: 'tenant-app-secret' }, // pragma: allowlist secret
    );
    expect(assets[0]).toMatchObject({
      externalAccountId: 'pending-selection',
      metadata: { selectionRequired: true },
    });
  });

  it('normalizes WhatsApp text, reply context, identity and delivery state', async () => {
    const normalized = await new MetaChannelAdapter('whatsapp').handleWebhook(connection('whatsapp'), {
      entry: [{ id: 'waba-1', changes: [{ value: {
        metadata: { phone_number_id: 'phone-1' },
        contacts: [{ profile: { name: 'Ada' } }],
        messages: [{ id: 'wamid.in', from: '34600111222', timestamp: '1787659200', type: 'text', text: { body: 'Hola' }, context: { id: 'wamid.parent' } }],
        statuses: [{ id: 'wamid.out', status: 'delivered', timestamp: '1787659201' }],
      } }] }],
    });
    expect(normalized.messages[0]).toMatchObject({
      externalMessageId: 'wamid.in', externalAccountId: 'phone-1', externalUserId: '34600111222',
      channel: 'whatsapp', text: 'Hola', displayName: 'Ada', replyTo: { externalMessageId: 'wamid.parent' },
    });
    expect(normalized.statuses[0]).toMatchObject({ externalMessageId: 'wamid.out', status: 'delivered' });
  });

  it.each(['messenger', 'instagram'] as const)('normalizes %s messages and ignores echoes', async (channel) => {
    const normalized = await new MetaChannelAdapter(channel).handleWebhook(connection(channel), {
      entry: [{ id: 'page-or-ig-1', messaging: [
        { sender: { id: 'user-1' }, recipient: { id: 'page-or-ig-1' }, timestamp: 1787659200000, message: { mid: 'mid.1', text: 'Hello' } },
        { sender: { id: 'page-or-ig-1' }, recipient: { id: 'user-1' }, timestamp: 1787659200001, message: { mid: 'mid.echo', text: 'Echo', is_echo: true } },
      ] }],
    });
    expect(normalized.messages).toHaveLength(1);
    expect(normalized.messages[0]).toMatchObject({ channel, externalAccountId: 'page-or-ig-1', externalUserId: 'user-1', text: 'Hello' });
  });

  it('sends WhatsApp media as a provider media payload rather than text', async () => {
    metaGraphRequestMock.mockResolvedValueOnce({ messages: [{ id: 'wamid.media' }] });
    const result = await new MetaChannelAdapter('whatsapp').sendMessage(connection('whatsapp'), {
      recipientId: '34600111222', text: 'Caption', idempotencyKey: 'idem-1',
      media: [{ type: 'image', url: 'https://cdn.example/image.jpg', mimeType: 'image/jpeg' }],
    });

    expect(result.externalMessageId).toBe('wamid.media');
    expect(metaGraphRequestMock).toHaveBeenCalledWith(expect.objectContaining({
      body: expect.objectContaining({ type: 'image', image: { link: 'https://cdn.example/image.jpg', caption: 'Caption' } }),
    }));
  });

  it('sends Messenger media as an attachment payload', async () => {
    metaGraphRequestMock.mockResolvedValueOnce({ message_id: 'mid.media' });
    await new MetaChannelAdapter('messenger').sendMessage(connection('messenger'), {
      recipientId: 'user-1', idempotencyKey: 'idem-2', media: [{ type: 'file', url: 'https://cdn.example/file.pdf' }],
    });

    expect(metaGraphRequestMock).toHaveBeenCalledWith(expect.objectContaining({
      body: expect.objectContaining({ message: { attachment: { type: 'file', payload: { url: 'https://cdn.example/file.pdf', is_reusable: true } } } }),
    }));
  });
});
