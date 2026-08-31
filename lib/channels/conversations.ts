import { and, desc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { channelConnections, chatConversations, chatMessages, clientMembers, conversationAuditLogs } from '@/lib/db/schema';
import { publishConversationUpdate } from '@/lib/chat/realtime';
import type { OutboundPurpose } from './policy';
import { processOutboxItem, queueOutboundMessage } from './service';
import type { Channel, NormalizedAttachment } from './types';

export type InboxConversationStatus = 'open' | 'assigned' | 'closed';
export type InboxAiMode = 'ai' | 'human' | 'paused' | 'hybrid' | 'closed';

// Build projections lazily inside data-access calls. Besides keeping imports
// side-effect free, this lets registry-only tests mock a deliberately small
// schema surface without needing every omnichannel table.
function conversationProjection() {
  return {
    id: chatConversations.id,
    contactId: chatConversations.contactId,
    channel: chatConversations.channel,
    provider: chatConversations.provider,
    visitorName: chatConversations.visitorName,
    visitorEmail: chatConversations.visitorEmail,
    status: chatConversations.status,
    aiMode: chatConversations.aiMode,
    priority: chatConversations.priority,
    team: chatConversations.team,
    tags: chatConversations.tags,
    assignedUserId: chatConversations.assignedUserId,
    waitingSince: chatConversations.waitingSince,
    lastInboundAt: chatConversations.lastInboundAt,
    lastOutboundAt: chatConversations.lastOutboundAt,
    lastMessageAt: chatConversations.lastMessageAt,
    createdAt: chatConversations.createdAt,
    updatedAt: chatConversations.updatedAt,
    closedAt: chatConversations.closedAt,
  };
}

function messageProjection() {
  return {
    id: chatMessages.id,
    conversationId: chatMessages.conversationId,
    authorKind: chatMessages.authorKind,
    authorUserId: chatMessages.authorUserId,
    authorName: chatMessages.authorName,
    direction: chatMessages.direction,
    channel: chatMessages.channel,
    messageType: chatMessages.messageType,
    body: chatMessages.body,
    attachments: chatMessages.attachments,
    status: chatMessages.status,
    occurredAt: chatMessages.occurredAt,
    sentAt: chatMessages.sentAt,
    deliveredAt: chatMessages.deliveredAt,
    readAt: chatMessages.readAt,
    failedAt: chatMessages.failedAt,
  };
}

function boundedLimit(value: number | undefined, fallback: number, maximum: number): number {
  if (value === undefined) return fallback;
  return Math.min(maximum, Math.max(1, Math.trunc(value)));
}

export async function listInboxChannels(args: { clientId: number }) {
  return db
    .select({
      id: channelConnections.id,
      channel: channelConnections.channel,
      provider: channelConnections.provider,
      externalAccountId: channelConnections.externalAccountId,
      displayName: channelConnections.displayName,
      status: channelConnections.status,
      capabilities: channelConnections.capabilities,
      tokenExpiresAt: channelConnections.tokenExpiresAt,
      lastWebhookAt: channelConnections.lastWebhookAt,
      lastInboundAt: channelConnections.lastInboundAt,
      lastOutboundAt: channelConnections.lastOutboundAt,
      createdAt: channelConnections.createdAt,
      updatedAt: channelConnections.updatedAt,
    })
    .from(channelConnections)
    .where(eq(channelConnections.clientId, args.clientId))
    .orderBy(channelConnections.id);
}

export async function listInboxConversations(args: { clientId: number; status?: InboxConversationStatus; channel?: Channel; assignedUserId?: number; aiMode?: InboxAiMode; limit?: number }) {
  const filters = [eq(chatConversations.clientId, args.clientId)];
  if (args.status) filters.push(eq(chatConversations.status, args.status));
  if (args.channel) filters.push(eq(chatConversations.channel, args.channel));
  if (args.assignedUserId !== undefined) {
    filters.push(eq(chatConversations.assignedUserId, args.assignedUserId));
  }
  if (args.aiMode) filters.push(eq(chatConversations.aiMode, args.aiMode));

  return db
    .select(conversationProjection())
    .from(chatConversations)
    .where(and(...filters))
    .orderBy(desc(chatConversations.lastMessageAt))
    .limit(boundedLimit(args.limit, 50, 200));
}

export async function getInboxConversation(args: { clientId: number; conversationId: number; limit?: number }) {
  const [conversation] = await db
    .select(conversationProjection())
    .from(chatConversations)
    .where(and(eq(chatConversations.id, args.conversationId), eq(chatConversations.clientId, args.clientId)))
    .limit(1);
  if (!conversation) return { error: 'Conversation not found' } as const;

  // Fetch the newest bounded window, then restore chronological order for the
  // caller. The previous ASC + LIMIT query returned the oldest messages.
  const messages = await db
    .select(messageProjection())
    .from(chatMessages)
    .where(and(eq(chatMessages.conversationId, conversation.id), eq(chatMessages.clientId, args.clientId)))
    .orderBy(desc(chatMessages.occurredAt), desc(chatMessages.id))
    .limit(boundedLimit(args.limit, 200, 500));

  return { conversation, messages: messages.reverse() };
}

export async function sendInboxMessage(args: {
  clientId: number;
  conversationId: number;
  actorUserId: number;
  text: string;
  purpose?: OutboundPurpose;
  template?: { name: string; language: string; components?: unknown[] };
  media?: NormalizedAttachment[];
  idempotencyKey?: string;
}) {
  const queued = await queueOutboundMessage(args);
  // Delivery is best-effort here; the durable outbox remains the source of
  // truth and its worker can retry even if this process ends after returning.
  void processOutboxItem(args.clientId, queued.outboxId).catch(() => {});
  return queued;
}

type ConversationPatch = Pick<typeof chatConversations.$inferInsert, 'assignedUserId' | 'status' | 'aiMode' | 'closedAt'>;

async function updateConversationState(args: { clientId: number; conversationId: number; actorUserId: number; action: string; patch: Partial<ConversationPatch> }) {
  const updated = await db.transaction(async (tx) => {
    const [row] = await tx
      .update(chatConversations)
      .set({ ...args.patch, updatedAt: new Date() })
      .where(and(eq(chatConversations.id, args.conversationId), eq(chatConversations.clientId, args.clientId)))
      .returning(conversationProjection());
    if (!row) return null;

    await tx.insert(conversationAuditLogs).values({
      clientId: args.clientId,
      conversationId: row.id,
      actorKind: 'user',
      actorUserId: args.actorUserId,
      action: args.action,
      details: {
        status: row.status,
        aiMode: row.aiMode,
        assignedUserId: row.assignedUserId,
      },
    });
    return row;
  });

  if (!updated) return { error: 'Conversation not found' } as const;

  void publishConversationUpdate(args.clientId, {
    conversationId: updated.id,
    status: updated.status as InboxConversationStatus,
    assignedUserId: updated.assignedUserId,
    visitorName: updated.visitorName,
    lastMessageAt: updated.lastMessageAt,
    kind: 'updated',
  }).catch(() => {});
  return updated;
}

export async function assignInboxConversation(args: { clientId: number; conversationId: number; actorUserId: number; assignedUserId: number | null }) {
  if (args.assignedUserId !== null) {
    const [member] = await db
      .select({ id: clientMembers.id })
      .from(clientMembers)
      .where(and(eq(clientMembers.clientId, args.clientId), eq(clientMembers.userId, args.assignedUserId)))
      .limit(1);
    if (!member) return { error: 'Assigned user is not a member of this client' } as const;
  }

  return updateConversationState({
    ...args,
    action: args.assignedUserId === null ? 'conversation.unassigned' : 'conversation.assigned',
    patch: {
      assignedUserId: args.assignedUserId,
      status: args.assignedUserId === null ? 'open' : 'assigned',
    },
  });
}

export async function takeOverInboxConversation(args: { clientId: number; conversationId: number; actorUserId: number }) {
  return updateConversationState({
    ...args,
    action: 'conversation.taken_over',
    patch: {
      assignedUserId: args.actorUserId,
      status: 'assigned',
      aiMode: 'human',
      closedAt: null,
    },
  });
}

export async function pauseInboxAi(args: { clientId: number; conversationId: number; actorUserId: number }) {
  return updateConversationState({
    ...args,
    action: 'conversation.ai_paused',
    patch: { aiMode: 'paused' },
  });
}

export async function returnInboxConversationToAi(args: { clientId: number; conversationId: number; actorUserId: number }) {
  return updateConversationState({
    ...args,
    action: 'conversation.returned_to_ai',
    patch: {
      assignedUserId: null,
      status: 'open',
      aiMode: 'ai',
      closedAt: null,
    },
  });
}

export async function closeInboxConversation(args: { clientId: number; conversationId: number; actorUserId: number }) {
  return updateConversationState({
    ...args,
    action: 'conversation.closed',
    patch: { status: 'closed', aiMode: 'closed', closedAt: new Date() },
  });
}
