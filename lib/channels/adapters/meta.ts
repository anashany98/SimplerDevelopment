import { randomUUID } from 'node:crypto';
import {
  exchangeMetaAuthorizationCode,
  metaGraphRequest,
  META_GRAPH_VERSION,
} from '../meta-client';
import { verifyMetaWebhookSignature } from '../security';
import type {
  AdapterConnection,
  LegacyChannelAdapter as ChannelAdapter,
  LegacyChannelCapabilities as ChannelCapabilities,
  ConnectInput,
  ConnectedAsset,
  NormalizedAttachment,
  NormalizedInboundMessage,
  NormalizedStatusUpdate,
  NormalizedWebhook,
  OutboundMessage,
  SendResult,
} from '../types';

type UnknownRecord = Record<string, unknown>;

function record(value: unknown): UnknownRecord {
  return value && typeof value === 'object' ? value as UnknownRecord : {};
}

function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value ? value : undefined;
}

function eventDate(value: unknown): Date {
  const number = typeof value === 'string' ? Number(value) : value;
  if (typeof number !== 'number' || !Number.isFinite(number)) return new Date();
  return new Date(number < 10_000_000_000 ? number * 1_000 : number);
}

function attachmentFromMeta(value: unknown): NormalizedAttachment {
  const item = record(value);
  const payload = record(item.payload);
  const kind = text(item.type) ?? 'unknown';
  const supported = new Set(['image', 'video', 'audio', 'file', 'location', 'sticker']);
  return {
    type: supported.has(kind) ? kind as NormalizedAttachment['type'] : 'unknown',
    url: text(payload.url),
    externalId: text(payload.attachment_id) ?? text(item.id),
    metadata: payload,
  };
}

function normalizeWhatsapp(payload: UnknownRecord): NormalizedWebhook {
  const messages: NormalizedInboundMessage[] = [];
  const statuses: NormalizedStatusUpdate[] = [];
  for (const entryValue of array(payload.entry)) {
    const entry = record(entryValue);
    for (const changeValue of array(entry.changes)) {
      const change = record(changeValue);
      const value = record(change.value);
      const metadata = record(value.metadata);
      const accountId = text(metadata.phone_number_id) ?? '';
      const firstContact = record(array(value.contacts)[0]);
      const profile = record(firstContact.profile);
      for (const messageValue of array(value.messages)) {
        const message = record(messageValue);
        const type = text(message.type) ?? 'unknown';
        const typedBody = record(message[type]);
        const externalMessageId = text(message.id) ?? randomUUID();
        const senderId = text(message.from) ?? '';
        const context = record(message.context);
        const attachments = type === 'text' ? [] : [{
          type: (['image', 'video', 'audio', 'document', 'sticker', 'location'].includes(type)
            ? (type === 'document' ? 'file' : type)
            : 'unknown') as NormalizedAttachment['type'],
          externalId: text(typedBody.id),
          mimeType: text(typedBody.mime_type),
          name: text(typedBody.filename),
          metadata: typedBody,
        }];
        messages.push({
          externalEventId: externalMessageId,
          externalMessageId,
          externalConversationId: senderId,
          externalAccountId: accountId,
          externalUserId: senderId,
          channel: 'whatsapp',
          provider: 'meta',
          occurredAt: eventDate(message.timestamp),
          text: text(record(message.text).body) ?? text(typedBody.caption) ?? '',
          messageType: type,
          displayName: text(profile.name),
          phone: senderId,
          attachments,
          sender: { id: senderId, name: text(profile.name) },
          recipient: { id: accountId },
          replyTo: text(context.id) ? { externalMessageId: text(context.id) } : undefined,
          metadata: { providerMessage: message },
        });
      }
      for (const statusValue of array(value.statuses)) {
        const status = record(statusValue);
        const statusName = text(status.status);
        if (!statusName || !['sent', 'delivered', 'read', 'failed'].includes(statusName)) continue;
        const externalMessageId = text(status.id) ?? '';
        statuses.push({
          externalEventId: `${externalMessageId}:${statusName}:${String(status.timestamp ?? '')}`,
          externalMessageId,
          status: statusName as NormalizedStatusUpdate['status'],
          occurredAt: eventDate(status.timestamp),
          error: text(record(array(status.errors)[0]).message) ?? text(record(array(status.errors)[0]).title),
          metadata: status,
        });
      }
    }
  }
  return { messages, statuses };
}

function normalizeMetaMessaging(payload: UnknownRecord, channel: 'messenger' | 'instagram'): NormalizedWebhook {
  const messages: NormalizedInboundMessage[] = [];
  const statuses: NormalizedStatusUpdate[] = [];
  for (const entryValue of array(payload.entry)) {
    const entry = record(entryValue);
    const accountId = text(entry.id) ?? '';
    for (const eventValue of array(entry.messaging)) {
      const event = record(eventValue);
      const senderId = text(record(event.sender).id) ?? '';
      const recipientId = text(record(event.recipient).id) ?? accountId;
      const message = record(event.message);
      const externalMessageId = text(message.mid);
      if (externalMessageId && !message.is_echo) {
        messages.push({
          externalEventId: externalMessageId,
          externalMessageId,
          externalConversationId: senderId,
          externalAccountId: accountId,
          externalUserId: senderId,
          channel,
          provider: 'meta',
          occurredAt: eventDate(event.timestamp),
          text: text(message.text) ?? '',
          messageType: array(message.attachments).length ? 'media' : 'text',
          attachments: array(message.attachments).map(attachmentFromMeta),
          sender: { id: senderId },
          recipient: { id: recipientId },
          replyTo: text(record(message.reply_to).mid) ? { externalMessageId: text(record(message.reply_to).mid) } : undefined,
          metadata: { providerMessage: message },
        });
      }
      const delivery = record(event.delivery);
      for (const mid of array(delivery.mids)) {
        if (typeof mid !== 'string') continue;
        statuses.push({
          externalEventId: `${mid}:delivered:${String(delivery.watermark ?? event.timestamp ?? '')}`,
          externalMessageId: mid,
          status: 'delivered',
          occurredAt: eventDate(delivery.watermark ?? event.timestamp),
          metadata: delivery,
        });
      }
      const read = record(event.read);
      if (read.watermark) {
        // Meta read webhooks expose a watermark rather than every message id.
        // Preserve it for reconciliation without guessing an affected message.
        statuses.push({
          externalEventId: `${senderId}:read:${String(read.watermark)}`,
          externalMessageId: '',
          status: 'read',
          occurredAt: eventDate(read.watermark),
          metadata: { ...read, externalUserId: senderId },
        });
      }
    }
  }
  return { messages, statuses };
}

function requiredCredential(connection: AdapterConnection, key: string): string {
  const value = connection.credentials[key];
  if (!value) throw new Error(`Channel connection is missing ${key}`);
  return value;
}

export class MetaChannelAdapter implements ChannelAdapter {
  readonly provider = 'meta';

  constructor(readonly channel: 'whatsapp' | 'messenger' | 'instagram') {}

  async connect(input: ConnectInput): Promise<ConnectedAsset[]> {
    if (input.credentials?.accessToken && input.credentials.externalAccountId) {
      return [{
        channel: this.channel,
        provider: this.provider,
        externalAccountId: input.credentials.externalAccountId,
        displayName: input.credentials.displayName,
        credentials: input.credentials,
      }];
    }
    if (!input.authorizationCode || !input.redirectUri) {
      throw new Error('Meta connect requires an authorization code and redirect URI');
    }
    const accessToken = await exchangeMetaAuthorizationCode(
      input.authorizationCode,
      input.redirectUri,
      input.oauthCredentials,
    );
    if (this.channel === 'whatsapp') {
      // WABA/phone selection varies by Business portfolio. Keep the exchanged
      // token server-side and require the explicit asset-selection call.
      return [{
        channel: 'whatsapp',
        provider: 'meta',
        externalAccountId: 'pending-selection',
        displayName: 'Select a WhatsApp Business phone number',
        credentials: { accessToken },
        metadata: { selectionRequired: true },
      }];
    }

    const result = await metaGraphRequest<{ data?: UnknownRecord[] }>({
      path: 'me/accounts',
      accessToken,
      query: new URLSearchParams({ fields: 'id,name,access_token,instagram_business_account' }),
    });
    const assets: ConnectedAsset[] = [];
    for (const page of result.data ?? []) {
      const pageId = text(page.id);
      const pageToken = text(page.access_token) ?? accessToken;
      if (!pageId) continue;
      if (this.channel === 'messenger') {
        assets.push({
          channel: 'messenger', provider: 'meta', externalAccountId: pageId,
          displayName: text(page.name), credentials: { accessToken: pageToken, pageId },
        });
      } else {
        const instagramId = text(record(page.instagram_business_account).id);
        if (instagramId) assets.push({
          channel: 'instagram', provider: 'meta', externalAccountId: instagramId,
          displayName: text(page.name), credentials: { accessToken: pageToken, pageId, instagramId },
        });
      }
    }
    return assets;
  }

  async disconnect(connection: AdapterConnection): Promise<void> {
    await metaGraphRequest({ path: 'me/permissions', accessToken: requiredCredential(connection, 'accessToken'), method: 'DELETE' });
  }

  async refreshCredentials(connection: AdapterConnection): Promise<Record<string, string>> {
    // Meta long-lived/system-user tokens have no refresh-token grant. Validate
    // the token; rotation is an explicit reconnect so expiry never fails open.
    await metaGraphRequest({ path: 'me', accessToken: requiredCredential(connection, 'accessToken') });
    return connection.credentials;
  }

  verifyWebhook(connection: AdapterConnection, rawBody: string, signature: string | null): boolean {
    const secret = connection.credentials.appSecret || process.env.META_APP_SECRET || '';
    return verifyMetaWebhookSignature(rawBody, signature, secret);
  }

  async handleWebhook(_connection: AdapterConnection, payload: unknown): Promise<NormalizedWebhook> {
    const body = record(payload);
    return this.channel === 'whatsapp'
      ? normalizeWhatsapp(body)
      : normalizeMetaMessaging(body, this.channel);
  }

  async sendMessage(connection: AdapterConnection, message: OutboundMessage): Promise<SendResult> {
    const accessToken = requiredCredential(connection, 'accessToken');
    if (this.channel === 'whatsapp') {
      const phoneNumberId = connection.credentials.phoneNumberId || connection.externalAccountId;
      const body: Record<string, unknown> = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: message.recipientId,
      };
      if (message.template) {
        body.type = 'template';
        body.template = message.template;
      } else if (message.media?.length) {
        const media = message.media[0];
        const type = media.type === 'file' ? 'document' : media.type;
        if (!['image', 'video', 'audio', 'document'].includes(type)) throw new Error(`Unsupported WhatsApp media type: ${media.type}`);
        if (!media.url && !media.externalId) throw new Error('Media requires a public URL or uploaded provider id');
        body.type = type;
        body[type] = {
          ...(media.externalId ? { id: media.externalId } : { link: media.url }),
          ...(message.text && type !== 'audio' ? { caption: message.text } : {}),
          ...(type === 'document' && media.name ? { filename: media.name } : {}),
        };
      } else {
        body.type = 'text';
        body.text = { preview_url: false, body: message.text ?? '' };
      }
      const result = await metaGraphRequest<{ messages?: Array<{ id?: string }> }>({
        path: `${phoneNumberId}/messages`, accessToken, method: 'POST', body,
      });
      const externalMessageId = result.messages?.[0]?.id;
      if (!externalMessageId) throw new Error('Meta accepted the request without a message id');
      return { externalMessageId, status: 'sent', raw: result as UnknownRecord };
    }

    const pageId = connection.credentials.pageId || connection.externalAccountId;
    const media = message.media?.[0];
    if (media && !media.url) throw new Error('Messenger and Instagram media require a public HTTPS URL');
    const providerMessage = media
      ? { attachment: { type: media.type === 'file' ? 'file' : media.type, payload: { url: media.url, is_reusable: true } } }
      : { text: message.text ?? '' };
    const result = await metaGraphRequest<{ message_id?: string }>({
      path: `${pageId}/messages`,
      accessToken,
      method: 'POST',
      body: { recipient: { id: message.recipientId }, messaging_type: 'RESPONSE', message: providerMessage },
    });
    if (!result.message_id) throw new Error('Meta accepted the request without a message id');
    return { externalMessageId: result.message_id, status: 'sent', raw: result as UnknownRecord };
  }

  async uploadMedia(connection: AdapterConnection, media: Blob): Promise<{ externalId: string }> {
    if (this.channel !== 'whatsapp') throw new Error('Direct upload is only supported for WhatsApp; use a public HTTPS media URL');
    const accessToken = requiredCredential(connection, 'accessToken');
    const phoneNumberId = connection.credentials.phoneNumberId || connection.externalAccountId;
    const form = new FormData();
    form.set('messaging_product', 'whatsapp');
    form.set('file', media, 'upload');
    const response = await fetch(`https://graph.facebook.com/${META_GRAPH_VERSION}/${phoneNumberId}/media`, {
      method: 'POST', headers: { Authorization: `Bearer ${accessToken}` }, body: form, signal: AbortSignal.timeout(30_000),
    });
    const payload = await response.json() as { id?: string; error?: { message?: string } };
    if (!response.ok || !payload.id) throw new Error(payload.error?.message ?? 'Meta media upload failed');
    return { externalId: payload.id };
  }

  getCapabilities(): ChannelCapabilities {
    return {
      text: true,
      media: true,
      templates: this.channel === 'whatsapp',
      readReceipts: true,
      typingIndicators: this.channel !== 'whatsapp',
      maxTextLength: this.channel === 'whatsapp' ? 4_096 : 2_000,
      supportedMedia: ['image', 'video', 'audio', 'file'],
    };
  }
}
