import { createEmailTransport } from '@/lib/email/transport';
import type { AdapterConnection, ChannelAdapter, ConnectInput, OutboundMessage } from '../types';

export class EmailChannelAdapter implements ChannelAdapter {
  readonly channel = 'email' as const;
  readonly provider = 'resend';

  async connect(input: ConnectInput) {
    const externalAccountId = input.credentials?.from;
    if (!externalAccountId) throw new Error('Email connection requires a from address');
    return [{ channel: this.channel, provider: this.provider, externalAccountId, credentials: input.credentials ?? {} }];
  }
  async disconnect(_connection: AdapterConnection) {}
  async refreshCredentials(connection: AdapterConnection) { return connection.credentials; }
  verifyWebhook() { return false; }
  async handleWebhook() { return { messages: [], statuses: [] }; }
  async sendMessage(connection: AdapterConnection, message: OutboundMessage) {
    const from = connection.credentials.from || connection.externalAccountId;
    const subject = connection.credentials.defaultSubject || 'New message';
    const transport = await createEmailTransport({ resendApiKey: connection.credentials.apiKey });
    const response = await transport.send({
      from, to: message.recipientId, subject, text: message.text ?? '',
      headers: { 'X-Idempotency-Key': message.idempotencyKey },
    });
    if (response.error || !response.data?.id) throw new Error(response.error?.message ?? 'Email send failed');
    return { externalMessageId: response.data.id, status: 'sent' as const };
  }
  async uploadMedia(_connection: AdapterConnection, _media: Blob): Promise<{ externalId: string }> {
    throw new Error('Email attachments are uploaded through the application storage adapter');
  }
  getCapabilities() {
    return { text: true, media: true, templates: true, readReceipts: false, typingIndicators: false, maxTextLength: 100_000, supportedMedia: ['file', 'image'] };
  }
}
