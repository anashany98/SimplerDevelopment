import { randomUUID } from 'node:crypto';
import type { AdapterConnection, LegacyChannelAdapter as ChannelAdapter, ConnectInput, OutboundMessage } from '../types';

export class WebChatAdapter implements ChannelAdapter {
  readonly channel = 'webchat' as const;
  readonly provider = 'native';

  async connect(input: ConnectInput) {
    return [{ channel: this.channel, provider: this.provider, externalAccountId: `client:${input.clientId}`, credentials: {} }];
  }
  async disconnect(_connection: AdapterConnection) {}
  async refreshCredentials(connection: AdapterConnection) { return connection.credentials; }
  verifyWebhook() { return false; }
  async handleWebhook() { return { messages: [], statuses: [] }; }
  async sendMessage(_connection: AdapterConnection, _message: OutboundMessage) {
    return { externalMessageId: `webchat:${randomUUID()}`, status: 'sent' as const };
  }
  async uploadMedia() { return { externalId: `webchat:${randomUUID()}` }; }
  getCapabilities() {
    return { text: true, media: true, templates: false, readReceipts: false, typingIndicators: true, maxTextLength: 8_000, supportedMedia: ['image', 'file'] };
  }
}
