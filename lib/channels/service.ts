import { randomUUID } from 'node:crypto';
import { and, eq, lte, or } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  channelConnections,
  channelConsents,
  channelAiRuns,
  channelIdentities,
  channelOutbox,
  channelWebhookEvents,
  chatConversations,
  chatMessages,
  conversationAuditLogs,
  crmActivities,
  crmContacts,
} from '@/lib/db/schema';
import { emitEvent } from '@/lib/automation/event-bus';
import { publishConversationUpdate, publishMessage } from '@/lib/chat/realtime';
import { getChannelAdapter } from './adapters';
import { evaluateOutboundPolicy, type OutboundPurpose } from './policy';
import { findExactContact, normalizeEmail, normalizePhone, splitDisplayName } from './identity';
import { redactProviderError } from './security';
import { CHANNELS, type AdapterConnection, type Channel, type NormalizedAttachment, type NormalizedInboundMessage } from './types';

function asChannel(value: string): Channel {
  if ((CHANNELS as readonly string[]).includes(value)) return value as Channel;
  throw new Error(`Unsupported channel: ${value}`);
}

function credentials(value: string | null): Record<string, string> {
  if (!value) return {};
  const parsed = JSON.parse(value) as unknown;
  if (!parsed || typeof parsed !== 'object') throw new Error('Invalid encrypted channel credentials');
  return Object.fromEntries(Object.entries(parsed as Record<string, unknown>).filter((entry): entry is [string, string] => typeof entry[1] === 'string'));
}

function adapterConnection(row: typeof channelConnections.$inferSelect): AdapterConnection {
  return {
    id: row.id,
    clientId: row.clientId,
    channel: asChannel(row.channel),
    provider: row.provider,
    externalAccountId: row.externalAccountId,
    credentials: credentials(row.credentials),
    metadata: row.metadata,
  };
}

export async function getChannelConnection(clientId: number, connectionId: number) {
  const [row] = await db.select().from(channelConnections).where(and(
    eq(channelConnections.id, connectionId), eq(channelConnections.clientId, clientId),
  )).limit(1);
  return row ?? null;
}

export interface IngestResult {
  duplicate: boolean;
  conversationId?: number;
  messageId?: number;
  contactId?: number | null;
}

/** Idempotent normalized ingress shared by every provider adapter. */
export async function ingestInboundMessage(args: {
  clientId: number;
  connectionId: number;
  message: NormalizedInboundMessage;
  rawPayload: Record<string, unknown>;
  correlationId?: string;
}): Promise<IngestResult> {
  const connection = await getChannelConnection(args.clientId, args.connectionId);
  if (!connection || connection.externalAccountId !== args.message.externalAccountId) {
    throw new Error('Channel connection not found or external account mismatch');
  }

  const existingContactId = await findExactContact({
    clientId: args.clientId, email: args.message.email, phone: args.message.phone,
  });
  const correlationId = args.correlationId ?? randomUUID();

  const result = await db.transaction(async (tx) => {
    const [event] = await tx.insert(channelWebhookEvents).values({
      clientId: args.clientId,
      connectionId: args.connectionId,
      provider: args.message.provider,
      externalEventId: args.message.externalEventId,
      eventType: 'message.received',
      payload: args.rawPayload,
    }).onConflictDoNothing().returning({ id: channelWebhookEvents.id });
    if (!event) return { duplicate: true } as IngestResult;

    let [identity] = await tx.select().from(channelIdentities).where(and(
      eq(channelIdentities.clientId, args.clientId),
      eq(channelIdentities.provider, args.message.provider),
      eq(channelIdentities.externalAccountId, args.message.externalAccountId),
      eq(channelIdentities.externalUserId, args.message.externalUserId),
    )).limit(1);

    let contactId = identity?.contactId ?? existingContactId;
    if (!contactId && (args.message.email || args.message.phone)) {
      const name = splitDisplayName(args.message.displayName, args.message.externalUserId);
      const [contact] = await tx.insert(crmContacts).values({
        clientId: args.clientId,
        firstName: name.firstName,
        lastName: name.lastName,
        email: normalizeEmail(args.message.email),
        phone: normalizePhone(args.message.phone),
        source: args.message.channel,
        status: 'lead',
      }).returning({ id: crmContacts.id });
      contactId = contact.id;
    }

    if (!identity) {
      [identity] = await tx.insert(channelIdentities).values({
        clientId: args.clientId,
        connectionId: args.connectionId,
        contactId,
        channel: args.message.channel,
        provider: args.message.provider,
        externalAccountId: args.message.externalAccountId,
        externalUserId: args.message.externalUserId,
        displayName: args.message.displayName,
        emailNormalized: normalizeEmail(args.message.email),
        phoneNormalized: normalizePhone(args.message.phone),
        metadata: args.message.metadata,
      }).returning();
    } else if (!identity.contactId && contactId) {
      await tx.update(channelIdentities).set({ contactId, updatedAt: new Date() }).where(and(
        eq(channelIdentities.id, identity.id), eq(channelIdentities.clientId, args.clientId),
      ));
    }

    let [conversation] = await tx.select().from(chatConversations).where(and(
      eq(chatConversations.clientId, args.clientId),
      eq(chatConversations.provider, args.message.provider),
      eq(chatConversations.channelConnectionId, args.connectionId),
      eq(chatConversations.externalConversationId, args.message.externalConversationId),
    )).limit(1);
    if (!conversation) {
      [conversation] = await tx.insert(chatConversations).values({
        clientId: args.clientId,
        channelConnectionId: args.connectionId,
        identityId: identity.id,
        contactId,
        channel: args.message.channel,
        provider: args.message.provider,
        externalConversationId: args.message.externalConversationId,
        visitorId: args.message.externalUserId,
        visitorName: args.message.displayName,
        visitorEmail: normalizeEmail(args.message.email),
        status: 'open',
        waitingSince: args.message.occurredAt,
        lastInboundAt: args.message.occurredAt,
        lastMessageAt: args.message.occurredAt,
      }).returning();
    }

    const [message] = await tx.insert(chatMessages).values({
      conversationId: conversation.id,
      clientId: args.clientId,
      authorKind: 'visitor',
      authorName: args.message.displayName ?? args.message.externalUserId,
      direction: 'inbound',
      channel: args.message.channel,
      provider: args.message.provider,
      externalMessageId: args.message.externalMessageId,
      messageType: args.message.messageType,
      body: args.message.text,
      attachments: args.message.attachments,
      sender: args.message.sender,
      recipient: args.message.recipient,
      replyTo: args.message.replyTo,
      metadata: args.message.metadata,
      status: 'received',
      correlationId,
      occurredAt: args.message.occurredAt,
    }).onConflictDoNothing().returning();
    if (!message) {
      await tx.update(channelWebhookEvents).set({ status: 'duplicate', processedAt: new Date() }).where(eq(channelWebhookEvents.id, event.id));
      return { duplicate: true, conversationId: conversation.id, contactId } as IngestResult;
    }

    await tx.update(chatConversations).set({
      identityId: identity.id,
      contactId,
      lastInboundAt: args.message.occurredAt,
      lastMessageAt: args.message.occurredAt,
      waitingSince: args.message.occurredAt,
      updatedAt: new Date(),
    }).where(and(eq(chatConversations.id, conversation.id), eq(chatConversations.clientId, args.clientId)));
    await tx.update(channelConnections).set({ lastInboundAt: args.message.occurredAt, lastWebhookAt: new Date(), updatedAt: new Date() }).where(and(
      eq(channelConnections.id, args.connectionId), eq(channelConnections.clientId, args.clientId),
    ));
    await tx.update(channelWebhookEvents).set({ status: 'processed', attempts: 1, processedAt: new Date() }).where(eq(channelWebhookEvents.id, event.id));
    await tx.insert(conversationAuditLogs).values({
      clientId: args.clientId, conversationId: conversation.id, actorKind: 'provider', action: 'message.received', correlationId,
      details: { channel: args.message.channel, externalMessageId: args.message.externalMessageId },
    });
    if (contactId) await tx.insert(crmActivities).values({
      clientId: args.clientId, contactId, type: 'message', title: `${args.message.channel} message received`,
      description: args.message.text.slice(0, 2_000),
    });
    if (conversation.aiMode === 'ai' || conversation.aiMode === 'hybrid') {
      await tx.insert(channelAiRuns).values({
        clientId: args.clientId, conversationId: conversation.id, messageId: message.id,
      }).onConflictDoNothing();
    }
    return { duplicate: false, conversationId: conversation.id, messageId: message.id, contactId } as IngestResult;
  });

  if (!result.duplicate && result.conversationId && result.messageId) {
    const published = {
      id: result.messageId, conversationId: result.conversationId, authorKind: 'visitor' as const,
      authorName: args.message.displayName ?? args.message.externalUserId, body: args.message.text, occurredAt: args.message.occurredAt,
    };
    void publishMessage(result.conversationId, args.clientId, published).catch(() => {});
    void publishConversationUpdate(args.clientId, {
      conversationId: result.conversationId, status: 'open', visitorName: args.message.displayName,
      lastMessageAt: args.message.occurredAt, kind: 'updated',
    }).catch(() => {});
    emitEvent('conversation.message_received', args.clientId, 0, {
      conversationId: result.conversationId, messageId: result.messageId, channel: args.message.channel, contactId: result.contactId,
    });
  }
  return result;
}

export async function applyProviderStatus(args: {
  clientId: number; connectionId: number; externalEventId: string; externalMessageId: string;
  status: 'sent' | 'delivered' | 'read' | 'failed'; occurredAt: Date; error?: string;
  rawPayload: Record<string, unknown>;
}): Promise<boolean> {
  const [event] = await db.insert(channelWebhookEvents).values({
    clientId: args.clientId, connectionId: args.connectionId, provider: 'meta', externalEventId: args.externalEventId,
    eventType: `message.${args.status}`, payload: args.rawPayload, status: 'received', attempts: 1,
  }).onConflictDoNothing().returning({ id: channelWebhookEvents.id });
  if (!event) return false;
  if (!args.externalMessageId) {
    await db.update(channelWebhookEvents).set({
      status: 'unmatched',
      error: 'Provider status did not include an external message id',
    }).where(eq(channelWebhookEvents.id, event.id));
    return false;
  }
  const timestamps = args.status === 'sent' ? { sentAt: args.occurredAt }
    : args.status === 'delivered' ? { deliveredAt: args.occurredAt }
      : args.status === 'read' ? { readAt: args.occurredAt }
        : { failedAt: args.occurredAt };
  const rows = await db.update(chatMessages).set({ status: args.status, ...timestamps })
    .where(and(eq(chatMessages.clientId, args.clientId), eq(chatMessages.externalMessageId, args.externalMessageId)))
    .returning({ id: chatMessages.id });
  if (rows.length === 0) {
    await db.update(channelWebhookEvents).set({
      status: 'unmatched',
      error: 'No local message matched the provider external message id',
    }).where(eq(channelWebhookEvents.id, event.id));
    return false;
  }
  await db.update(channelWebhookEvents).set({ status: 'processed', processedAt: new Date() })
    .where(eq(channelWebhookEvents.id, event.id));
  return true;
}

export async function queueOutboundMessage(args: {
  clientId: number; conversationId: number; actorUserId?: number; text: string;
  purpose?: OutboundPurpose; template?: { name: string; language: string; components?: unknown[] };
  media?: NormalizedAttachment[];
  idempotencyKey?: string; correlationId?: string;
}): Promise<{ messageId: number; outboxId: number; status: 'queued' }> {
  const [conversation] = await db.select().from(chatConversations).where(and(
    eq(chatConversations.id, args.conversationId), eq(chatConversations.clientId, args.clientId),
  )).limit(1);
  if (!conversation || conversation.status === 'closed') throw new Error('Conversation not found or closed');
  if (!conversation.identityId) throw new Error('Conversation has no routable channel identity');
  const [identity] = await db.select().from(channelIdentities).where(and(
    eq(channelIdentities.id, conversation.identityId), eq(channelIdentities.clientId, args.clientId),
  )).limit(1);
  if (!identity) throw new Error('Conversation identity not found');

  let consentStatus: 'granted' | 'unknown' = args.purpose === 'marketing' ? 'unknown' : 'granted';
  if (args.purpose === 'marketing') {
    const [consent] = await db.select({ id: channelConsents.id }).from(channelConsents).where(and(
      eq(channelConsents.clientId, args.clientId),
      eq(channelConsents.channel, conversation.channel),
      eq(channelConsents.purpose, 'marketing'),
      eq(channelConsents.status, 'granted'),
      or(
        eq(channelConsents.identityId, identity.id),
        ...(identity.contactId ? [eq(channelConsents.contactId, identity.contactId)] : []),
      ),
    )).limit(1);
    if (consent) consentStatus = 'granted';
  }

  const policy = evaluateOutboundPolicy({
    channel: asChannel(conversation.channel), lastInboundAt: conversation.lastInboundAt,
    purpose: args.purpose, approvedTemplateName: args.template?.name, consentStatus,
  });
  if (!policy.allowed) throw new Error(`Outbound policy denied: ${policy.code}`);
  const idempotencyKey = args.idempotencyKey ?? randomUUID();
  const correlationId = args.correlationId ?? randomUUID();

  return db.transaction(async (tx) => {
    const [message] = await tx.insert(chatMessages).values({
      conversationId: conversation.id, clientId: args.clientId, authorKind: args.actorUserId ? 'agent' : 'system',
      authorUserId: args.actorUserId, authorName: args.actorUserId ? 'Agent' : 'Automation', direction: 'outbound',
      channel: conversation.channel, provider: conversation.provider,
      messageType: args.template ? 'template' : (args.media?.[0]?.type ?? 'text'), body: args.text,
      attachments: args.media ?? [], status: 'queued', idempotencyKey, correlationId,
      sender: { externalAccountId: conversation.channelConnectionId }, recipient: { externalUserId: identity.externalUserId },
    }).returning();
    const [outbox] = await tx.insert(channelOutbox).values({
      clientId: args.clientId, connectionId: conversation.channelConnectionId, conversationId: conversation.id, messageId: message.id,
      idempotencyKey, payload: {
        recipientId: identity.externalUserId, text: args.text, template: args.template,
        media: args.media, policyMode: policy.mode,
      },
    }).returning({ id: channelOutbox.id });
    await tx.insert(conversationAuditLogs).values({
      clientId: args.clientId, conversationId: conversation.id, actorKind: args.actorUserId ? 'user' : 'automation',
      actorUserId: args.actorUserId, action: 'message.queued', correlationId, details: { messageId: message.id, policyMode: policy.mode },
    });
    return { messageId: message.id, outboxId: outbox.id, status: 'queued' as const };
  });
}

export async function processOutboxItem(clientId: number, outboxId: number): Promise<'sent' | 'retry' | 'failed' | 'unknown'> {
  const [item] = await db.select().from(channelOutbox).where(and(
    eq(channelOutbox.id, outboxId), eq(channelOutbox.clientId, clientId), lte(channelOutbox.nextAttemptAt, new Date()),
  )).limit(1);
  if (!item || !['pending', 'retry'].includes(item.status)) throw new Error('Outbox item is unavailable');
  const payload = item.payload;
  const claimed = await db.update(channelOutbox).set({ status: 'processing', lockedAt: new Date(), attempts: item.attempts + 1 }).where(and(
    eq(channelOutbox.id, outboxId), eq(channelOutbox.clientId, clientId), eq(channelOutbox.status, item.status),
  )).returning({ id: channelOutbox.id });
  if (claimed.length === 0) throw new Error('Outbox item was claimed by another worker');
  // Meta does not expose a general idempotency key for outbound sends. Once
  // the provider has accepted a message, a later local persistence failure is
  // ambiguous: retrying can send the customer a duplicate. Keep it terminally
  // visible for reconciliation instead of converting it to a retry.
  let acceptedExternalMessageId: string | null = null;
  try {
    if (!item.connectionId) throw new Error('Outbox item has no provider connection');
    const connection = await getChannelConnection(clientId, item.connectionId);
    if (!connection || connection.status !== 'connected') throw new Error('Channel connection is not connected');
    const result = await getChannelAdapter(asChannel(connection.channel)).sendMessage(adapterConnection(connection), {
      recipientId: String(payload.recipientId), text: typeof payload.text === 'string' ? payload.text : undefined,
      media: Array.isArray(payload.media) ? payload.media as NormalizedAttachment[] : undefined,
      template: payload.template as { name: string; language: string; components?: unknown[] } | undefined,
      idempotencyKey: item.idempotencyKey,
    });
    acceptedExternalMessageId = result.externalMessageId;
    const now = new Date();
    await db.transaction(async (tx) => {
      await tx.update(chatMessages).set({ externalMessageId: result.externalMessageId, status: result.status, sentAt: now })
        .where(and(eq(chatMessages.id, item.messageId), eq(chatMessages.clientId, clientId)));
      await tx.update(channelOutbox).set({ status: 'sent', processedAt: now, lockedAt: null, lastError: null })
        .where(and(eq(channelOutbox.id, outboxId), eq(channelOutbox.clientId, clientId)));
      await tx.update(chatConversations).set({ lastOutboundAt: now, lastMessageAt: now, waitingSince: null, updatedAt: now })
        .where(and(eq(chatConversations.id, item.conversationId), eq(chatConversations.clientId, clientId)));
      await tx.update(channelConnections).set({ lastOutboundAt: now, lastError: null, updatedAt: now })
        .where(and(eq(channelConnections.id, connection.id), eq(channelConnections.clientId, clientId)));
    });
    emitEvent('conversation.message_sent', clientId, 0, { conversationId: item.conversationId, messageId: item.messageId, channel: connection.channel });
    return 'sent';
  } catch (error) {
    if (acceptedExternalMessageId) {
      const now = new Date();
      const message = redactProviderError(error);
      await db.transaction(async (tx) => {
        await tx.update(chatMessages).set({
          externalMessageId: acceptedExternalMessageId,
          status: 'unknown',
          sentAt: now,
        }).where(and(eq(chatMessages.id, item.messageId), eq(chatMessages.clientId, clientId)));
        await tx.update(channelOutbox).set({
          status: 'unknown',
          processedAt: now,
          lockedAt: null,
          lastError: `Provider accepted the message, but local finalization failed: ${message}`,
        }).where(and(eq(channelOutbox.id, outboxId), eq(channelOutbox.clientId, clientId)));
      });
      return 'unknown';
    }
    const attempts = item.attempts + 1;
    const failed = attempts >= item.maxAttempts;
    const delayMs = Math.min(4 ** attempts * 1_000, 6 * 60 * 60 * 1_000);
    const message = redactProviderError(error);
    await db.update(channelOutbox).set({
      status: failed ? 'failed' : 'retry', lockedAt: null, lastError: message,
      nextAttemptAt: new Date(Date.now() + delayMs), processedAt: failed ? new Date() : null,
    }).where(and(eq(channelOutbox.id, outboxId), eq(channelOutbox.clientId, clientId)));
    if (failed) await db.update(chatMessages).set({ status: 'failed', failedAt: new Date() }).where(and(
      eq(chatMessages.id, item.messageId), eq(chatMessages.clientId, clientId),
    ));
    return failed ? 'failed' : 'retry';
  }
}

export { adapterConnection };
