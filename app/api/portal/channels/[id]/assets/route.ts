import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { channelConnections, conversationAuditLogs } from '@/lib/db/schema';
import { authorizePortal, isAuthError } from '@/lib/portal-auth';
import { discoverWhatsAppAssets } from '@/lib/channels/meta-client';
import { adapterConnection } from '@/lib/channels/service';
import { getChannelAdapter } from '@/lib/channels/adapters';

type Ctx = { params: Promise<{ id: string }> };

async function context(idValue: string) {
  const authz = await authorizePortal({ action: 'admin', scope: 'chat:write' });
  if (isAuthError(authz)) return { authz } as const;
  const id = Number.parseInt(idValue, 10);
  const [connection] = await db.select().from(channelConnections).where(and(
    eq(channelConnections.id, id), eq(channelConnections.clientId, authz.client.id),
  )).limit(1);
  return { authz, connection } as const;
}

export async function GET(_req: Request, { params }: Ctx) {
  const ctx = await context((await params).id);
  if (isAuthError(ctx.authz)) return ctx.authz.response;
  if (!ctx.connection || ctx.connection.channel !== 'whatsapp' || ctx.connection.status !== 'incomplete') {
    return NextResponse.json({ success: false, message: 'Incomplete WhatsApp connection not found' }, { status: 404 });
  }
  try {
    const token = adapterConnection(ctx.connection).credentials.accessToken;
    const assets = await discoverWhatsAppAssets(token);
    return NextResponse.json({ success: true, data: assets });
  } catch {
    return NextResponse.json({ success: false, message: 'WhatsApp assets could not be discovered' }, { status: 502 });
  }
}

export async function POST(req: Request, { params }: Ctx) {
  const ctx = await context((await params).id);
  if (isAuthError(ctx.authz)) return ctx.authz.response;
  if (!ctx.connection || ctx.connection.channel !== 'whatsapp' || ctx.connection.status !== 'incomplete') {
    return NextResponse.json({ success: false, message: 'Incomplete WhatsApp connection not found' }, { status: 404 });
  }
  const body = await req.json().catch(() => ({})) as { phoneNumberId?: string };
  try {
    const token = adapterConnection(ctx.connection).credentials.accessToken;
    const asset = (await discoverWhatsAppAssets(token)).find((candidate) => candidate.phoneNumberId === body.phoneNumberId);
    if (!asset) return NextResponse.json({ success: false, message: 'Phone asset is not authorized by this token' }, { status: 400 });
    const capabilities = Object.entries(getChannelAdapter('whatsapp').getCapabilities()).filter(([, value]) => value === true).map(([key]) => key);
    const [connected] = await db.transaction(async (tx) => {
      const rows = await tx.insert(channelConnections).values({
        clientId: ctx.authz.client.id,
        channel: 'whatsapp',
        provider: 'meta',
        externalAccountId: asset.phoneNumberId,
        displayName: asset.verifiedName || asset.displayPhoneNumber || asset.phoneNumberId,
        status: 'connected',
        credentials: JSON.stringify({ accessToken: token, phoneNumberId: asset.phoneNumberId, wabaId: asset.wabaId }),
        metadata: { ...asset },
        capabilities,
        createdByUserId: ctx.authz.userId,
      }).onConflictDoUpdate({
        target: [channelConnections.clientId, channelConnections.provider, channelConnections.channel, channelConnections.externalAccountId],
        set: {
          status: 'connected',
          credentials: JSON.stringify({ accessToken: token, phoneNumberId: asset.phoneNumberId, wabaId: asset.wabaId }),
          metadata: { ...asset },
          lastError: null,
          updatedAt: new Date(),
        },
      }).returning({ id: channelConnections.id, displayName: channelConnections.displayName });
      await tx.update(channelConnections).set({ status: 'disconnected', credentials: null, updatedAt: new Date() }).where(and(
        eq(channelConnections.id, ctx.connection.id), eq(channelConnections.clientId, ctx.authz.client.id),
      ));
      await tx.insert(conversationAuditLogs).values({
        clientId: ctx.authz.client.id, actorKind: 'user', actorUserId: ctx.authz.userId,
        action: 'channel.asset_selected', details: { connectionId: rows[0].id, channel: 'whatsapp', phoneNumberId: asset.phoneNumberId },
      });
      return rows;
    });
    return NextResponse.json({ success: true, data: connected });
  } catch {
    return NextResponse.json({ success: false, message: 'WhatsApp asset selection failed' }, { status: 502 });
  }
}
