export const CHANNELS = ['whatsapp', 'instagram', 'messenger', 'webchat', 'email'] as const;
export type Channel = (typeof CHANNELS)[number];

export type ConnectionStatus = 'connected' | 'disconnected' | 'incomplete' | 'token_expired' | 'error';
export type MessageStatus = 'queued' | 'sent' | 'delivered' | 'read' | 'failed' | 'received';
export type AiConversationMode = 'ai' | 'human' | 'paused' | 'hybrid' | 'closed';

export interface AdapterConnection {
  id?: number;
  clientId: number;
  channel: Channel;
  provider: string;
  externalAccountId: string;
  credentials: Record<string, string>;
  metadata?: Record<string, unknown>;
}

export interface ConnectInput {
  clientId: number;
  authorizationCode?: string;
  redirectUri?: string;
  credentials?: Record<string, string>;
  oauthCredentials?: {
    appId: string;
    appSecret: string;
  };
}

export interface ConnectedAsset {
  channel: Channel;
  provider: string;
  externalAccountId: string;
  displayName?: string;
  credentials: Record<string, string>;
  metadata?: Record<string, unknown>;
}

export interface NormalizedAttachment {
  type: 'image' | 'video' | 'audio' | 'file' | 'location' | 'sticker' | 'unknown';
  url?: string;
  externalId?: string;
  mimeType?: string;
  name?: string;
  metadata?: Record<string, unknown>;
}

export interface NormalizedInboundMessage {
  externalEventId: string;
  externalMessageId: string;
  externalConversationId: string;
  externalAccountId: string;
  externalUserId: string;
  channel: Channel;
  provider: string;
  occurredAt: Date;
  text: string;
  messageType: string;
  displayName?: string;
  email?: string;
  phone?: string;
  attachments: NormalizedAttachment[];
  sender: Record<string, unknown>;
  recipient: Record<string, unknown>;
  replyTo?: Record<string, unknown>;
  metadata: Record<string, unknown>;
}

export interface NormalizedStatusUpdate {
  externalEventId: string;
  externalMessageId: string;
  status: MessageStatus;
  occurredAt: Date;
  error?: string;
  metadata?: Record<string, unknown>;
}

export interface NormalizedWebhook {
  messages: NormalizedInboundMessage[];
  statuses: NormalizedStatusUpdate[];
}

export interface OutboundMessage {
  recipientId: string;
  text?: string;
  messageType?: string;
  media?: NormalizedAttachment[];
  template?: { name: string; language: string; components?: unknown[] };
  replyToExternalMessageId?: string;
  idempotencyKey: string;
}

export interface SendResult {
  externalMessageId: string;
  status: MessageStatus;
  raw?: Record<string, unknown>;
}

export interface ChannelCapabilities {
  text: boolean;
  media: boolean;
  templates: boolean;
  readReceipts: boolean;
  typingIndicators: boolean;
  maxTextLength: number;
  supportedMedia: string[];
}

export interface ChannelAdapter {
  readonly channel: Channel;
  readonly provider: string;
  connect(input: ConnectInput): Promise<ConnectedAsset[]>;
  disconnect(connection: AdapterConnection): Promise<void>;
  refreshCredentials(connection: AdapterConnection): Promise<Record<string, string>>;
  verifyWebhook(connection: AdapterConnection, rawBody: string, signature: string | null): boolean;
  handleWebhook(connection: AdapterConnection, payload: unknown): Promise<NormalizedWebhook>;
  sendMessage(connection: AdapterConnection, message: OutboundMessage): Promise<SendResult>;
  uploadMedia(connection: AdapterConnection, media: Blob): Promise<{ externalId: string }>;
  getCapabilities(): ChannelCapabilities;
}
