// Omnichannel shared types: the normalized message model, channel adapters,
// capabilities, and identities. Upper layers (agents, sequences, inbox) consume
// these — never the raw provider payloads.

export type ChannelProvider = 'whatsapp' | 'instagram' | 'messenger' | 'webchat' | 'email';

/** Adapter keys — more specific than the coarse `ChannelProvider`. */
export type ChannelAdapterKey =
  | 'meta-whatsapp'
  | 'meta-instagram'
  | 'meta-messenger'
  | 'webchat'
  | 'resend'
  | 'local';

export type MessageDirection = 'inbound' | 'outbound';

export type MessageType =
  | 'text'
  | 'image'
  | 'audio'
  | 'video'
  | 'document'
  | 'location'
  | 'contact'
  | 'button'
  | 'interactive'
  | 'reaction'
  | 'template'
  | 'system';

export type DeliveryStatus = 'queued' | 'processing' | 'sent' | 'delivered' | 'read' | 'retrying' | 'failed';

export type IdentityKind = 'phone' | 'email' | 'whatsapp' | 'instagram' | 'facebook' | 'webchat';

export interface ChannelIdentity {
  kind: IdentityKind;
  /** Normalized value: E.164 phone, lowercase email, raw provider ids otherwise. */
  value: string;
}

export interface MediaAttachment {
  type: 'image' | 'audio' | 'video' | 'document' | 'location' | 'sticker';
  url?: string;
  mimeType?: string;
  filename?: string;
  sizeBytes?: number;
  caption?: string;
  /** Structured payload for interactive/location messages. */
  payload?: Record<string, unknown>;
}

/** Provider-agnostic message produced by `normalizeInboundMessage`. */
export interface NormalizedMessage {
  channel: ChannelProvider;
  provider: ChannelAdapterKey;
  connectionId?: number;
  externalConversationId?: string;
  externalMessageId?: string;
  replyToExternalMessageId?: string;
  direction: MessageDirection;
  senderIdentity: ChannelIdentity;
  recipientIdentity?: ChannelIdentity;
  messageType: MessageType;
  text?: string;
  media?: MediaAttachment[];
  sentAt?: Date;
  receivedAt?: Date;
  metadata?: Record<string, unknown>;
}

/** What an outbound send requests, before policy/outbox. */
export interface OutboundMessageRequest {
  channel: ChannelProvider;
  provider: ChannelAdapterKey;
  connectionId: number;
  conversationId?: number;
  contactId?: number;
  recipientIdentity: ChannelIdentity;
  senderIdentity?: ChannelIdentity;
  messageType: MessageType;
  text?: string;
  media?: MediaAttachment[];
  templateName?: string;
  replyToExternalMessageId?: string;
  /** Stable idempotency key chosen by the caller; defaults to a provider id later. */
  idempotencyKey?: string;
  metadata?: Record<string, unknown>;
  /**
   * Policy *facts* supplied by the caller (reply-window + business-hours
   * services). Defaults are conservative: outside the reply window, inside
   * business hours. The policy engine makes the allow/deny decision from them.
   */
  withinReplyWindow?: boolean;
  withinBusinessHours?: boolean;
}

/** Capability flags per provider. Adapters advertise only what they support. */
export interface ChannelCapabilities {
  supportsTemplates: boolean;
  supportsReadReceipts: boolean;
  supportsMedia: boolean;
  supportsReactions: boolean;
  supportsInteractiveMessages: boolean;
  supportsTyping: boolean;
  /** Whether outbound messages are constrained by a 24-hour window (WhatsApp). */
  supports24HourWindow: boolean;
  /** Whether the provider permits initiating a conversation outside any window. */
  supportsOutboundInitiate: boolean;
  /** Whether inbound events carry a per-tenant signature to verify. */
  requiresWebhookSignature: boolean;
}

/** A single channel adapter. Implementations own provider wire formats only. */
export interface ChannelAdapter {
  readonly key: ChannelAdapterKey;
  readonly capabilities: ChannelCapabilities;

  /** Idempotent, signature-verified. Returns normalized messages (possibly empty). */
  receiveEvent(payload: unknown): Promise<NormalizedMessage[]>;

  /** Deliver one outbound message. Returns the provider message id on success. */
  sendMessage(request: OutboundMessageRequest): Promise<{ externalMessageId: string }>;

  /** Mark a message read (no-op for providers without read receipts). */
  markAsRead?(conversationId: string, messageId: string): Promise<void>;

  /** Optional status probe used by connection management. */
  getStatus?(): Promise<{ status: 'connected' | 'disconnected' | 'error'; detail?: string }>;
}

/** A connection row as the gateway sees it (credentials already decrypted). */
export interface ChannelConnectionRef {
  id: number;
  clientId: number;
  provider: ChannelProvider;
  externalAccountId?: string | null;
  status: string;
  credentials: Record<string, unknown>;
  metadata: Record<string, unknown>;
}

/** A resolved contact reference (never more than the gateway needs). */
export interface ContactRef {
  id: number;
  clientId: number;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  phone?: string | null;
}

/** A resolved conversation reference. */
export interface ConversationRef {
  id: number;
  clientId: number;
  status: string;
  aiMode: string;
  externalConversationId?: string | null;
}

/** A persisted message reference. */
export interface MessageRef {
  id: number;
  conversationId: number;
  externalMessageId?: string | null;
}

// Compatibility types for the existing portal connection-management API.
// The gateway above uses normalized messages; the portal adapter contract uses
// provider assets and webhook batches. Keep the contracts named separately so
// both flows can share the same provider implementations without weakening the
// gateway's message types.
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
  oauthCredentials?: { appId: string; appSecret: string };
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

export interface LegacyChannelCapabilities {
  text: boolean;
  media: boolean;
  templates: boolean;
  readReceipts: boolean;
  typingIndicators: boolean;
  maxTextLength: number;
  supportedMedia: string[];
}

export interface LegacyChannelAdapter {
  readonly channel: Channel;
  readonly provider: string;
  connect(input: ConnectInput): Promise<ConnectedAsset[]>;
  disconnect(connection: AdapterConnection): Promise<void>;
  refreshCredentials(connection: AdapterConnection): Promise<Record<string, string>>;
  verifyWebhook(connection: AdapterConnection, rawBody: string, signature: string | null): boolean;
  handleWebhook(connection: AdapterConnection, payload: unknown): Promise<NormalizedWebhook>;
  sendMessage(connection: AdapterConnection, message: OutboundMessage): Promise<SendResult>;
  uploadMedia(connection: AdapterConnection, media: Blob): Promise<{ externalId: string }>;
  getCapabilities(): LegacyChannelCapabilities;
}
