import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { channelConnections, conversationAuditLogs } from '@/lib/db/schema';
import { authorizePortal, isAuthError } from '@/lib/portal-auth';
import { getChannelAdapter } from '@/lib/channels/adapters';
import { CHANNELS, type Channel } from '@/lib/channels/types';

export async function GET() {
  const authz = await authorizePortal({ action: 'read', scope: 'chat:read' });
  if (isAuthError(authz)) return authz.response;
  const rows = await db.select({
    id: channelConnections.id,
    channel: channelConnections.channel,
    provider: channelConnections.provider,
    externalAccountId: channelConnections.externalAccountId,
    displayName: channelConnections.displayName,
    status: channelConnections.status,
    capabilities: channelConnections.capabilities,
    metadata: channelConnections.metadata,
    tokenExpiresAt: channelConnections.tokenExpiresAt,
    lastInboundAt: channelConnections.lastInboundAt,
    lastOutboundAt: channelConnections.lastOutboundAt,
    lastWebhookAt: channelConnections.lastWebhookAt,
    lastError: channelConnections.lastError,
    createdAt: channelConnections.createdAt,
    updatedAt: channelConnections.updatedAt,
  }).from(channelConnections).where(eq(channelConnections.clientId, authz.client.id)).orderBy(channelConnections.id);
  return NextResponse.json({ success: true, data: rows });
}

export async function POST(req: Request) {
  const authz = await authorizePortal({ action: 'admin', scope: 'chat:write' });
  if (isAuthError(authz)) return authz.response;
  const body = await req.json().catch(() => ({})) as {
    channel?: string; credentials?: Record<string, string>; displayName?: string; externalAccountId?: string;
  };
  if (!body.channel || !(CHANNELS as readonly string[]).includes(body.channel)) {
    return NextResponse.json({ success: false, message: 'Unsupported channel' }, { status: 400 });
  }
  const channel = body.channel as Channel;
  const adapter = getChannelAdapter(channel);
  const suppliedCredentials = { ...body.credentials };
  if (body.externalAccountId) suppliedCredentials.externalAccountId = body.externalAccountId;
  if (body.displayName) suppliedCredentials.displayName = body.displayName;
  try {
    const assets = await adapter.connect({ clientId: authz.client.id, credentials: suppliedCredentials });
    const created = [];
    for (const asset of assets) {
      const [row] = await db.insert(channelConnections).values({
        clientId: authz.client.id,
        channel: asset.channel,
        provider: asset.provider,
        externalAccountId: asset.externalAccountId,
        displayName: asset.displayName,
        status: asset.metadata?.selectionRequired ? 'incomplete' : 'connected',
        credentials: JSON.stringify(asset.credentials),
        metadata: asset.metadata ?? {},
        capabilities: Object.entries(adapter.getCapabilities()).filter(([, value]) => value === true).map(([key]) => key),
        createdByUserId: authz.userId,
      }).onConflictDoUpdate({
        target: [channelConnections.clientId, channelConnections.provider, channelConnections.channel, channelConnections.externalAccountId],
        set: {
          displayName: asset.displayName,
          status: asset.metadata?.selectionRequired ? 'incomplete' : 'connected',
          credentials: JSON.stringify(asset.credentials),
          metadata: asset.metadata ?? {},
          lastError: null,
          updatedAt: new Date(),
        },
      }).returning({ id: channelConnections.id, channel: channelConnections.channel, status: channelConnections.status });
      created.push({ ...row, webhookPath: '/api/webhooks/meta' });
      await db.insert(conversationAuditLogs).values({
        clientId: authz.client.id, actorKind: 'user', actorUserId: authz.userId,
        action: 'channel.connected', details: { connectionId: row.id, channel: row.channel },
      });
    }
    return NextResponse.json({ success: true, data: created }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : 'Connection failed' }, { status: 400 });
  }
}
