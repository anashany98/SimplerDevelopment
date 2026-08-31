/**
 * POST /api/public/chat/messages
 *
 * Visitor-side message send. Body:
 *   { conversationId, ephemeralToken, body }
 *
 * The ephemeralToken scopes the request to a single conversationId; an
 * attacker who learns one token cannot post to other tenants' inboxes.
 */

import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { chatConversations, chatMessages, channelAiRuns } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { verifyChatAttachmentToken, verifyVisitorToken } from '@/lib/chat/token';
import { publishMessage } from '@/lib/chat/realtime';
import { checkRateLimit, getClientIp } from '@/lib/security/rate-limit';
import { checkVisitorRateLimit } from '@/lib/chat/rate-limit';

const MAX_BODY = 4_000;

export async function POST(req: Request) {
  let body: { conversationId?: number; ephemeralToken?: string; body?: string; attachments?: unknown[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, message: 'Invalid JSON body' }, { status: 400 });
  }

  const verified = verifyVisitorToken(body.ephemeralToken);
  if (!verified) {
    return NextResponse.json({ success: false, message: 'Invalid token' }, { status: 401 });
  }
  if (verified.conversationId !== body.conversationId) {
    return NextResponse.json({ success: false, message: 'Token / conversation mismatch' }, { status: 401 });
  }

  const text = (body.body || '').trim();
  if (text.length > MAX_BODY) {
    return NextResponse.json({ success: false, message: 'Message too long' }, { status: 413 });
  }
  const rawAttachments = Array.isArray(body.attachments)
    ? body.attachments.filter((item): item is { url: string; name: string; mimeType: string; size: number } => {
        if (!item || typeof item !== 'object') return false;
        const value = item as Record<string, unknown>;
        return typeof value.url === 'string' && typeof value.name === 'string' && typeof value.mimeType === 'string' && typeof value.size === 'number';
      }).slice(0, 5)
    : [];
  if (!text && rawAttachments.length === 0) {
    return NextResponse.json({ success: false, message: 'Message body is required' }, { status: 400 });
  }

  const [conversation] = await db
    .select()
    .from(chatConversations)
    .where(eq(chatConversations.id, verified.conversationId))
    .limit(1);
  if (!conversation) {
    return NextResponse.json({ success: false, message: 'Conversation not found' }, { status: 404 });
  }
  const attachmentPrefix = `/api/media/proxy/chat/${conversation.clientId}/`;
  const attachments = rawAttachments.filter((item) => {
    try {
      const url = new URL(item.url, req.url);
      return url.pathname.startsWith(attachmentPrefix)
        && verifyChatAttachmentToken(url.searchParams.get('chatAttachment'), conversation.id, url.pathname);
    } catch {
      return false;
    }
  });
  if (attachments.length !== rawAttachments.length) {
    return NextResponse.json({ success: false, message: 'Invalid attachment reference' }, { status: 400 });
  }
  if (conversation.status === 'closed') {
    return NextResponse.json({ success: false, message: 'Conversation is closed' }, { status: 409 });
  }

  // Rate-limit by visitor — they can only send so fast.
  const localLimit = checkVisitorRateLimit(`v:${conversation.visitorId ?? getClientIp(req)}`);
  if (!localLimit.ok) {
    return NextResponse.json(
      { success: false, message: 'Too many messages, slow down' },
      { status: 429, headers: { 'Retry-After': String(localLimit.retryAfter ?? 1) } },
    );
  }
  // Keep the existing low-latency limiter and add a shared distributed gate
  // for multi-instance deployments. The latter falls back locally in dev.
  const allowed = await checkRateLimit(`chat:${conversation.clientId}:${conversation.visitorId ?? getClientIp(req)}`, 10, 10_000);
  if (!allowed) return NextResponse.json(
    { success: false, message: 'Too many messages, slow down' },
    { status: 429, headers: { 'Retry-After': '10' } },
  );

  const now = new Date();
  const [inserted] = await db
    .insert(chatMessages)
    .values({
      conversationId: conversation.id,
      clientId: conversation.clientId,
      authorKind: 'visitor',
      authorName: conversation.visitorName ?? 'Visitante',
      body: text,
      attachments,
      occurredAt: now,
    })
    .returning();

  await db
    .update(chatConversations)
    .set({ lastMessageAt: now, updatedAt: now })
    .where(eq(chatConversations.id, conversation.id));

  // The native webchat path bypasses lib/channels/service.ts ingest (which is
  // webhook-shaped), so it must enqueue the AI run itself — mirrors the
  // `aiMode === 'ai' || 'hybrid'` block in channels/service.ts, otherwise the
  // widget's configured AI mode never fires. The process-conversation-ai cron
  // claims and drains these rows.
  if (conversation.aiMode === 'ai' || conversation.aiMode === 'hybrid') {
    await db
      .insert(channelAiRuns)
      .values({
        clientId: conversation.clientId,
        conversationId: conversation.id,
        messageId: inserted.id,
      })
      .onConflictDoNothing();
  }

  publishMessage(conversation.id, conversation.clientId, {
    id: inserted.id,
    conversationId: conversation.id,
    authorKind: 'visitor',
    authorName: inserted.authorName,
    body: inserted.body,
    attachments: inserted.attachments,
    occurredAt: inserted.occurredAt,
  }).catch(() => {});

  return NextResponse.json({
    success: true,
    data: {
      id: inserted.id,
      conversationId: inserted.conversationId,
      authorKind: inserted.authorKind,
      authorName: inserted.authorName,
      body: inserted.body,
      attachments: inserted.attachments,
      occurredAt: inserted.occurredAt,
    },
  });
}
