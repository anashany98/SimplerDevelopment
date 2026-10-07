import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { channelConnections } from '@/lib/db/schema';
import { getChannelAdapter } from '@/lib/channels/adapters';
import { extractMetaExternalAccountIds } from '@/lib/channels/meta-webhook';
import { safeEqualText, verifyMetaWebhookSignature } from '@/lib/channels/security';
import { adapterConnection, applyProviderStatus, ingestInboundMessage } from '@/lib/channels/service';
import type { Channel } from '@/lib/channels/types';
import { resolveEnvironmentMetaConfig, resolveMetaConfigByPublicId } from '@/lib/channels/meta-config';

export const runtime = 'nodejs';

type UnknownRecord = Record<string, unknown>;
export async function GET(req: Request) {
  const url = new URL(req.url);
  const publicId = url.searchParams.get('config');
  let expected: string | undefined;
  try {
    expected = publicId
      ? (await resolveMetaConfigByPublicId(publicId))?.webhookVerifyToken
      : resolveEnvironmentMetaConfig()?.webhookVerifyToken;
  } catch {
    return new NextResponse('Webhook configuration unavailable', { status: 503 });
  }
  if (!expected) return new NextResponse('Webhook not configured', { status: 503 });
  const mode = url.searchParams.get('hub.mode');
  const token = url.searchParams.get('hub.verify_token') ?? '';
  const challenge = url.searchParams.get('hub.challenge') ?? '';
  if (mode !== 'subscribe' || !challenge || !safeEqualText(token, expected)) {
    return new NextResponse('Forbidden', { status: 403 });
  }
  return new NextResponse(challenge, { status: 200, headers: { 'Content-Type': 'text/plain' } });
}

export async function POST(req: Request) {
  const rawBody = await req.text();
  const url = new URL(req.url);
  const publicId = url.searchParams.get('config');
  let webhookConfig;
  try {
    webhookConfig = publicId
      ? await resolveMetaConfigByPublicId(publicId)
      : resolveEnvironmentMetaConfig();
  } catch {
    return new NextResponse('Webhook configuration unavailable', { status: 503 });
  }
  if (!webhookConfig) return new NextResponse('Webhook not configured', { status: 503 });
  if (!verifyMetaWebhookSignature(rawBody, req.headers.get('x-hub-signature-256'), webhookConfig.appSecret)) {
    return new NextResponse('Invalid signature', { status: 401 });
  }
  let payload: UnknownRecord;
  try { payload = JSON.parse(rawBody) as UnknownRecord; }
  catch { return new NextResponse('Invalid JSON', { status: 400 }); }
  const ids = extractMetaExternalAccountIds(payload);
  if (ids.length !== 1) return NextResponse.json({ received: false, error: 'ambiguous_asset' }, { status: 409 });
  const predicates = [
    eq(channelConnections.provider, 'meta'),
    eq(channelConnections.externalAccountId, ids[0]),
  ];
  if (webhookConfig.clientId !== null) predicates.push(eq(channelConnections.clientId, webhookConfig.clientId));
  const matches = await db.select().from(channelConnections).where(and(...predicates)).limit(2);
  if (matches.length !== 1 || matches[0].status !== 'connected') {
    return NextResponse.json({ received: false, error: matches.length > 1 ? 'ambiguous_connection' : 'unknown_asset' }, { status: 404 });
  }
  const connection = matches[0];
  try {
    const adapter = getChannelAdapter(connection.channel as Channel);
    const normalized = await adapter.handleWebhook(adapterConnection(connection), payload);
    for (const message of normalized.messages) {
      await ingestInboundMessage({
        clientId: connection.clientId, connectionId: connection.id, message, rawPayload: payload,
      });
    }
    for (const status of normalized.statuses) {
      await applyProviderStatus({
        clientId: connection.clientId,
        connectionId: connection.id,
        externalEventId: status.externalEventId,
        externalMessageId: status.externalMessageId,
        status: status.status === 'received' || status.status === 'queued' ? 'sent' : status.status,
        occurredAt: status.occurredAt,
        error: status.error,
        rawPayload: payload,
      });
    }
    return NextResponse.json({ received: true });
  } catch (error) {
    console.error(JSON.stringify({
      level: 'error', event: 'channel.webhook.processing_failed', connectionId: connection.id,
      clientId: connection.clientId, error: error instanceof Error ? error.message.slice(0, 500) : 'Unknown error',
    }));
    return NextResponse.json({ received: false }, { status: 503 });
  }
}
