/**
 * GET    /api/portal/chat/widgets/[id]
 * PATCH  /api/portal/chat/widgets/[id]
 * DELETE /api/portal/chat/widgets/[id]
 */

import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { chatWidgets } from '@/lib/db/schema';
import { getPortalClient } from '@/lib/portal-client';
import { authorizePortal, isAuthError } from '@/lib/portal-auth';
import { and, eq } from 'drizzle-orm';
import { randomBytes } from 'node:crypto';

async function loadWidget(userId: number, widgetId: number) {
  const client = await getPortalClient(userId);
  if (!client) return { error: 'Client not found', status: 404 } as const;
  const [widget] = await db
    .select()
    .from(chatWidgets)
    .where(and(eq(chatWidgets.id, widgetId), eq(chatWidgets.clientId, client.id)))
    .limit(1);
  if (!widget) return { error: 'Widget not found', status: 404 } as const;
  return { widget, client } as const;
}

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const widgetId = Number.parseInt(id, 10);
  const result = await loadWidget(parseInt(session.user.id, 10), widgetId);
  if ('error' in result) return NextResponse.json({ success: false, message: result.error }, { status: result.status });
  return NextResponse.json({ success: true, data: result.widget });
}

export async function PATCH(req: Request, { params }: Ctx) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const widgetId = Number.parseInt(id, 10);
  const result = await loadWidget(parseInt(session.user.id, 10), widgetId);
  if ('error' in result) return NextResponse.json({ success: false, message: result.error }, { status: result.status });

  const body = await req.json().catch(() => ({}));
  const patch: Partial<typeof chatWidgets.$inferInsert> = { updatedAt: new Date() };
  if (typeof body.brainEnabled === 'boolean') {
    const authorization = await authorizePortal({ action: 'admin', scope: 'chat:write' });
    if (isAuthError(authorization)) return authorization.response;
    if (authorization.client.id !== result.client.id) {
      return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
    }
    patch.brainEnabled = body.brainEnabled;
  }
  // Lazily upgrade pre-omnichannel widgets without exposing a key-rotation
  // surface or mutating on GET. The returned row lets the settings UI switch
  // its embed code to the non-enumerable reference immediately after save.
  if (!result.widget.publicKey) patch.publicKey = randomBytes(24).toString('base64url');
  if (typeof body.enabled === 'boolean') patch.enabled = body.enabled;
  if (typeof body.greetingMessage === 'string') patch.greetingMessage = body.greetingMessage;
  if (typeof body.position === 'string') patch.position = body.position;
  if (typeof body.primaryColor === 'string') patch.primaryColor = body.primaryColor;
  if (typeof body.awayMessage === 'string' || body.awayMessage === null) patch.awayMessage = body.awayMessage;
  if (typeof body.welcomeMessage === 'string' || body.welcomeMessage === null) patch.welcomeMessage = body.welcomeMessage;
  if (typeof body.displayName === 'string' || body.displayName === null) patch.displayName = body.displayName?.slice(0, 120) ?? null;
  if (typeof body.logoUrl === 'string' || body.logoUrl === null) patch.logoUrl = body.logoUrl;
  if (typeof body.avatarUrl === 'string' || body.avatarUrl === null) patch.avatarUrl = body.avatarUrl;
  if (typeof body.language === 'string' && /^[a-z]{2,3}(-[A-Z]{2})?$/.test(body.language)) patch.language = body.language;
  if (typeof body.aiMode === 'string' && ['ai', 'human', 'paused', 'hybrid'].includes(body.aiMode)) patch.aiMode = body.aiMode;
  if (typeof body.allowAttachments === 'boolean') patch.allowAttachments = body.allowAttachments;
  if (typeof body.showBranding === 'boolean') patch.showBranding = body.showBranding;
  if (typeof body.privacyLink === 'string' || body.privacyLink === null) patch.privacyLink = body.privacyLink;
  if (Array.isArray(body.allowedOrigins)) {
    patch.allowedOrigins = body.allowedOrigins.filter((value: unknown): value is string => typeof value === 'string' && value.trim().length > 0)
      .map((value: string) => value.trim().toLowerCase()).slice(0, 50);
  }

  // Scope the mutation itself by clientId — not just the preceding loadWidget()
  // read — so the authorization check is atomic with the write (no TOCTOU, and
  // no unscoped UPDATE reachable if a future caller skips loadWidget).
  const [updated] = await db
    .update(chatWidgets)
    .set(patch)
    .where(and(eq(chatWidgets.id, widgetId), eq(chatWidgets.clientId, result.client.id)))
    .returning();
  return NextResponse.json({ success: true, data: updated });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const widgetId = Number.parseInt(id, 10);
  const result = await loadWidget(parseInt(session.user.id, 10), widgetId);
  if ('error' in result) return NextResponse.json({ success: false, message: result.error }, { status: result.status });
  // clientId in the DELETE WHERE keeps the authorization atomic with the write.
  await db.delete(chatWidgets).where(and(eq(chatWidgets.id, widgetId), eq(chatWidgets.clientId, result.client.id)));
  return NextResponse.json({ success: true, data: { id: widgetId } });
}
