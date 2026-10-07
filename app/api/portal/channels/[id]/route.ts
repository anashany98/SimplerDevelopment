import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { channelConnections, conversationAuditLogs } from '@/lib/db/schema';
import { authorizePortal, isAuthError } from '@/lib/portal-auth';
import { getChannelAdapter } from '@/lib/channels/adapters';
import { adapterConnection } from '@/lib/channels/service';
import type { Channel } from '@/lib/channels/types';

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Ctx) {
  const authz = await authorizePortal({ action: 'admin', scope: 'chat:write' });
  if (isAuthError(authz)) return authz.response;
  const id = Number.parseInt((await params).id, 10);
  const [connection] = await db.select().from(channelConnections).where(and(
    eq(channelConnections.id, id), eq(channelConnections.clientId, authz.client.id),
  )).limit(1);
  if (!connection) return NextResponse.json({ success: false, message: 'Connection not found' }, { status: 404 });
  const body = await req.json().catch(() => ({})) as { action?: string; displayName?: string };
  try {
    const updates: Partial<typeof channelConnections.$inferInsert> = { updatedAt: new Date() };
    if (body.action === 'refresh') {
      const refreshed = await getChannelAdapter(connection.channel as Channel).refreshCredentials(adapterConnection(connection));
      updates.credentials = JSON.stringify(refreshed);
      updates.status = 'connected';
      updates.lastError = null;
    } else if (body.displayName !== undefined) {
      updates.displayName = body.displayName.slice(0, 255);
    } else {
      return NextResponse.json({ success: false, message: 'No supported update supplied' }, { status: 400 });
    }
    const [updated] = await db.update(channelConnections).set(updates).where(and(
      eq(channelConnections.id, id), eq(channelConnections.clientId, authz.client.id),
    )).returning({ id: channelConnections.id, status: channelConnections.status, displayName: channelConnections.displayName });
    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    await db.update(channelConnections).set({ status: 'error', lastError: error instanceof Error ? error.message.slice(0, 1_000) : 'Refresh failed' }).where(and(
      eq(channelConnections.id, id), eq(channelConnections.clientId, authz.client.id),
    ));
    return NextResponse.json({ success: false, message: 'Provider credential validation failed' }, { status: 502 });
  }
}

export async function DELETE(req: Request, { params }: Ctx) {
  const authz = await authorizePortal({ action: 'admin', scope: 'chat:write' });
  if (isAuthError(authz)) return authz.response;
  const id = Number.parseInt((await params).id, 10);
  const [connection] = await db.select().from(channelConnections).where(and(
    eq(channelConnections.id, id), eq(channelConnections.clientId, authz.client.id),
  )).limit(1);
  if (!connection) return NextResponse.json({ success: false, message: 'Connection not found' }, { status: 404 });
  const force = new URL(req.url).searchParams.get('force') === '1';
  try {
    if (!force) await getChannelAdapter(connection.channel as Channel).disconnect(adapterConnection(connection));
    await db.transaction(async (tx) => {
      await tx.update(channelConnections).set({ status: 'disconnected', credentials: null, updatedAt: new Date() }).where(and(
        eq(channelConnections.id, id), eq(channelConnections.clientId, authz.client.id),
      ));
      await tx.insert(conversationAuditLogs).values({
        clientId: authz.client.id, actorKind: 'user', actorUserId: authz.userId,
        action: 'channel.disconnected', details: { connectionId: id, channel: connection.channel, forced: force },
      });
    });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ success: false, message: 'Provider revocation failed; retry or use force=1 for local revocation' }, { status: 502 });
  }
}
