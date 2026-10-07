/**
 * POST /api/public/chat/start
 *
 * Public surface — no auth. Widget posts `{ widgetKey, visitorId, name?, email? }`,
 * gets back `{ conversationId, ephemeralToken }`. Idempotent on
 * (widget, visitorId). `widgetId` remains accepted for legacy embeds.
 */

import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { chatWidgets, chatConversations, clientWebsites } from '@/lib/db/schema';
import { and, eq, isNull, ne } from 'drizzle-orm';
import { issueVisitorToken } from '@/lib/chat/token';
import { publishConversationUpdate } from '@/lib/chat/realtime';
import { isAllowedWidgetOrigin } from '@/lib/chat/origin';
import { checkRateLimit, getClientIp } from '@/lib/security/rate-limit';

function corsHeaders(origin: string): HeadersInit {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    Vary: 'Origin',
  };
}

export function OPTIONS() {
  // The final POST response is narrowed to a configured widget origin. This
  // preflight response cannot identify a widget yet and uses no credentials.
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '600',
      Vary: 'Origin',
    },
  });
}

export async function POST(req: Request) {
  let body: {
    widgetKey?: string;
    widgetId?: number | string;
    visitorId?: string;
    name?: string;
    email?: string;
  };
  if (!(await checkRateLimit(`chat-start:ip:${getClientIp(req)}`, 20, 60_000))) {
    return NextResponse.json({ success: false, message: 'Too many chat starts, slow down' }, { status: 429 });
  }
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, message: 'Invalid JSON body' }, { status: 400 });
  }

  const widgetKey = typeof body.widgetKey === 'string' ? body.widgetKey.trim() : '';
  const hasWidgetKey = body.widgetKey !== undefined;
  if (hasWidgetKey && !/^[A-Za-z0-9_-]{20,64}$/.test(widgetKey)) {
    return NextResponse.json({ success: false, message: 'widgetKey is invalid' }, { status: 400 });
  }
  const widgetId = typeof body.widgetId === 'string' ? Number.parseInt(body.widgetId, 10) : body.widgetId;
  const visitorId = (body.visitorId || '').trim();
  if (!widgetKey && (!Number.isInteger(widgetId) || (widgetId as number) <= 0)) {
    return NextResponse.json({ success: false, message: 'widgetId is required' }, { status: 400 });
  }
  if (!visitorId || visitorId.length > 64) {
    return NextResponse.json({ success: false, message: 'visitorId is required' }, { status: 400 });
  }

  const [widget] = await db
    .select()
    .from(chatWidgets)
    .where(widgetKey
      ? eq(chatWidgets.publicKey, widgetKey)
      : and(eq(chatWidgets.id, widgetId as number), isNull(chatWidgets.publicKey)))
    .limit(1);
  if (!widget || !widget.enabled) {
    return NextResponse.json({ success: false, message: 'Widget not available' }, { status: 404 });
  }
  const configuredOrigins = widget.allowedOrigins ?? [];
  const requestOrigin = req.headers.get('origin');
  const [site] = requestOrigin || configuredOrigins.length > 0
    ? await db.select({
        domain: clientWebsites.domain,
        vercelDomain: clientWebsites.vercelDomain,
        subdomain: clientWebsites.subdomain,
      }).from(clientWebsites).where(and(eq(clientWebsites.id, widget.siteId), eq(clientWebsites.clientId, widget.clientId))).limit(1)
    : [undefined];
  const allowedOrigins = [
    ...configuredOrigins,
    site?.domain,
    site?.vercelDomain,
    site?.subdomain ? `${site.subdomain}.simplerdevelopment.com` : null,
  ].filter((value): value is string => Boolean(value));
  // The session is minted by the host-page loader, not the cross-origin iframe.
  // `Origin` is therefore the browser's real embedding origin; never accept a
  // client-supplied origin claim here.
  if ((process.env.NODE_ENV === 'production' && !requestOrigin)
    || !isAllowedWidgetOrigin(requestOrigin, allowedOrigins)) {
    return NextResponse.json({ success: false, message: 'Widget is not allowed on this domain' }, { status: 403 });
  }
  const headers = requestOrigin ? corsHeaders(requestOrigin) : undefined;
  if (!(await checkRateLimit(`chat-start:widget:${widget.id}:${getClientIp(req)}`, 10, 60_000))) {
    return NextResponse.json({ success: false, message: 'Too many chat starts, slow down' }, { status: 429, headers });
  }

  // Reuse the visitor's existing open/assigned conversation if one exists.
  const [existing] = await db
    .select()
    .from(chatConversations)
    .where(
      and(
        eq(chatConversations.widgetId, widget.id),
        eq(chatConversations.visitorId, visitorId),
        ne(chatConversations.status, 'closed'),
      ),
    )
    .limit(1);

  if (existing) {
    // Patch contact details if newly provided.
    if ((body.name && !existing.visitorName) || (body.email && !existing.visitorEmail)) {
      await db
        .update(chatConversations)
        .set({
          visitorName: body.name?.slice(0, 255) ?? existing.visitorName,
          visitorEmail: body.email?.slice(0, 255) ?? existing.visitorEmail,
          updatedAt: new Date(),
        })
        .where(eq(chatConversations.id, existing.id));
    }
    return NextResponse.json({
      success: true,
      data: {
        conversationId: existing.id,
        widgetId: widget.id,
        ephemeralToken: issueVisitorToken(existing.id),
        greetingMessage: widget.greetingMessage,
        primaryColor: widget.primaryColor,
        position: widget.position,
        awayMessage: widget.awayMessage,
        displayName: widget.displayName,
        logoUrl: widget.logoUrl,
        avatarUrl: widget.avatarUrl,
        language: widget.language,
        allowAttachments: widget.allowAttachments,
        showBranding: widget.showBranding,
        privacyLink: widget.privacyLink,
      },
    }, { headers });
  }

  const [created] = await db
    .insert(chatConversations)
    .values({
      widgetId: widget.id,
      clientId: widget.clientId,
      visitorId,
      visitorName: body.name?.slice(0, 255) ?? null,
      visitorEmail: body.email?.slice(0, 255) ?? null,
      status: 'open',
      aiMode: widget.aiMode,
      lastMessageAt: new Date(),
    })
    .returning();

  publishConversationUpdate(widget.clientId, {
    conversationId: created.id,
    status: 'open',
    visitorName: created.visitorName,
    lastMessageAt: created.lastMessageAt,
    kind: 'created',
  }).catch(() => {
    // Best-effort — don't fail the request on a notify hiccup.
  });

  return NextResponse.json({
    success: true,
    data: {
      conversationId: created.id,
      widgetId: widget.id,
      ephemeralToken: issueVisitorToken(created.id),
      greetingMessage: widget.greetingMessage,
      primaryColor: widget.primaryColor,
      position: widget.position,
      awayMessage: widget.awayMessage,
      displayName: widget.displayName,
      logoUrl: widget.logoUrl,
      avatarUrl: widget.avatarUrl,
      language: widget.language,
      allowAttachments: widget.allowAttachments,
      showBranding: widget.showBranding,
      privacyLink: widget.privacyLink,
    },
  }, { headers });
}
