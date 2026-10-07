import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { channelConnections, conversationAuditLogs } from '@/lib/db/schema';
import { authorizePortal, isAuthError } from '@/lib/portal-auth';
import { getChannelAdapter } from '@/lib/channels/adapters';
import { verifyMetaOAuthState } from '@/lib/channels/oauth-state';
import { metaCallbackUrl, resolveMetaConfigForClient } from '@/lib/channels/meta-config';

function settingsRedirect(req: Request, result: string) {
  const origin = process.env.NEXT_PUBLIC_APP_URL || new URL(req.url).origin;
  return NextResponse.redirect(`${origin.replace(/\/$/, '')}/portal/settings/channels?meta=${encodeURIComponent(result)}`);
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  if (url.searchParams.get('error')) return settingsRedirect(req, 'cancelled');
  const code = url.searchParams.get('code');
  const state = verifyMetaOAuthState(url.searchParams.get('state') ?? '');
  if (!code || !state) return settingsRedirect(req, 'invalid_state');
  const authz = await authorizePortal({ action: 'admin', scope: 'chat:write' });
  if (isAuthError(authz)) return authz.response;
  if (authz.userId !== state.userId || authz.client.id !== state.clientId) return settingsRedirect(req, 'tenant_mismatch');
  const origin = process.env.NEXT_PUBLIC_APP_URL || url.origin;
  const redirectUri = metaCallbackUrl(origin);
  try {
    const config = await resolveMetaConfigForClient(state.clientId);
    if (!config) return settingsRedirect(req, 'configuration_missing');
    const adapter = getChannelAdapter(state.channel);
    const assets = await adapter.connect({
      clientId: state.clientId,
      authorizationCode: code,
      redirectUri,
      oauthCredentials: { appId: config.appId, appSecret: config.appSecret },
    });
    for (const asset of assets) {
      const [row] = await db.insert(channelConnections).values({
        clientId: state.clientId,
        channel: asset.channel,
        provider: asset.provider,
        externalAccountId: asset.externalAccountId,
        displayName: asset.displayName,
        status: asset.metadata?.selectionRequired ? 'incomplete' : 'connected',
        credentials: JSON.stringify(asset.credentials),
        metadata: asset.metadata ?? {},
        capabilities: Object.entries(adapter.getCapabilities()).filter(([, value]) => value === true).map(([key]) => key),
        createdByUserId: state.userId,
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
      }).returning({ id: channelConnections.id });
      await db.insert(conversationAuditLogs).values({
        clientId: state.clientId, actorKind: 'user', actorUserId: state.userId,
        action: 'channel.oauth_connected', details: { connectionId: row.id, channel: asset.channel },
      });
    }
    return settingsRedirect(req, assets.some((asset) => asset.metadata?.selectionRequired) ? 'selection_required' : 'connected');
  } catch (error) {
    console.error(JSON.stringify({
      level: 'error', event: 'channel.oauth.failed', clientId: state.clientId, channel: state.channel,
      error: error instanceof Error ? error.message.slice(0, 500) : 'Unknown error',
    }));
    return settingsRedirect(req, 'failed');
  }
}
