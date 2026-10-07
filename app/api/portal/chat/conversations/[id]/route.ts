/**
 * GET   /api/portal/chat/conversations/[id]  — conversation + full message history.
 * PATCH /api/portal/chat/conversations/[id]  — assign / status changes.
 */

import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { channelAiRuns, chatConversations, chatMessages } from '@/lib/db/schema';
import { getPortalClient } from '@/lib/portal-client';
import { and, asc, eq } from 'drizzle-orm';
import { publishConversationUpdate } from '@/lib/chat/realtime';

type Ctx = { params: Promise<{ id: string }> };

async function loadConversation(userId: number, conversationId: number) {
  const client = await getPortalClient(userId);
  if (!client) return { error: 'Client not found', status: 404 } as const;
  const [conversation] = await db
    .select()
    .from(chatConversations)
    .where(and(eq(chatConversations.id, conversationId), eq(chatConversations.clientId, client.id)))
    .limit(1);
  if (!conversation) return { error: 'Conversation not found', status: 404 } as const;
  return { conversation, client } as const;
}

export async function GET(_req: Request, { params }: Ctx) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const conversationId = Number.parseInt(id, 10);
  const result = await loadConversation(parseInt(session.user.id, 10), conversationId);
  if ('error' in result) return NextResponse.json({ success: false, message: result.error }, { status: result.status });
  const messages = await db
    .select()
    .from(chatMessages)
    .where(eq(chatMessages.conversationId, conversationId))
    .orderBy(asc(chatMessages.occurredAt));
  const aiRuns = await db.select({
    id: channelAiRuns.id,
    messageId: channelAiRuns.messageId,
    status: channelAiRuns.status,
    decision: channelAiRuns.decision,
    provider: channelAiRuns.provider,
    model: channelAiRuns.model,
    completedAt: channelAiRuns.completedAt,
  }).from(channelAiRuns).where(and(
    eq(channelAiRuns.conversationId, conversationId), eq(channelAiRuns.clientId, result.client.id),
  )).orderBy(asc(channelAiRuns.createdAt));
  return NextResponse.json({ success: true, data: { conversation: result.conversation, messages, aiRuns } });
}

export async function PATCH(req: Request, { params }: Ctx) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  const userId = parseInt(session.user.id, 10);
  const { id } = await params;
  const conversationId = Number.parseInt(id, 10);
  const result = await loadConversation(userId, conversationId);
  if ('error' in result) return NextResponse.json({ success: false, message: result.error }, { status: result.status });

  const body = await req.json().catch(() => ({}));
  const patch: Partial<typeof chatConversations.$inferInsert> = { updatedAt: new Date() };

  if (body.action === 'assign-self') {
    patch.assignedUserId = userId;
    patch.status = 'assigned';
  } else if (body.action === 'unassign') {
    patch.assignedUserId = null;
    patch.status = 'open';
  } else if (body.action === 'close') {
    patch.status = 'closed';
    patch.aiMode = 'closed';
    patch.closedAt = new Date();
  } else if (body.action === 'reopen') {
    patch.status = result.conversation.assignedUserId ? 'assigned' : 'open';
    patch.aiMode = 'hybrid';
    patch.closedAt = null;
  } else if (body.action === 'ai-takeover') {
    patch.aiMode = 'ai';
  } else if (body.action === 'human-takeover') {
    patch.aiMode = 'human';
    patch.assignedUserId = userId;
    patch.status = 'assigned';
  } else if (body.action === 'pause-ai') {
    patch.aiMode = 'paused';
  } else if (body.action === 'set-priority' && ['low', 'normal', 'high', 'urgent'].includes(body.priority)) {
    patch.priority = body.priority;
  } else if (body.action === 'set-team' && (body.team === null || typeof body.team === 'string')) {
    patch.team = body.team?.slice(0, 100) ?? null;
  } else {
    return NextResponse.json({ success: false, message: 'Unknown action' }, { status: 400 });
  }

  const [updated] = await db
    .update(chatConversations)
    .set(patch)
    .where(eq(chatConversations.id, conversationId))
    .returning();

  publishConversationUpdate(result.client.id, {
    conversationId: updated.id,
    status: updated.status as 'open' | 'assigned' | 'closed',
    assignedUserId: updated.assignedUserId,
    visitorName: updated.visitorName,
    lastMessageAt: updated.lastMessageAt,
    kind: 'updated',
  }).catch(() => {});

  return NextResponse.json({ success: true, data: updated });
}
