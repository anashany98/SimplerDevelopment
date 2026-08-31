import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { authorizePortal, isAuthError } from '@/lib/portal-auth';
import { issueMetaOAuthState } from '@/lib/channels/oauth-state';
import { META_GRAPH_VERSION } from '@/lib/channels/meta-client';
import { metaCallbackUrl, resolveMetaConfigForClient } from '@/lib/channels/meta-config';

export async function GET(req: Request) {
  const authz = await authorizePortal({ action: 'admin', scope: 'chat:write' });
  if (isAuthError(authz)) return authz.response;
  const channel = new URL(req.url).searchParams.get('channel');
  if (channel !== 'whatsapp' && channel !== 'messenger' && channel !== 'instagram') {
    return NextResponse.json({ success: false, message: 'Unsupported Meta channel' }, { status: 400 });
  }
  let config;
  try { config = await resolveMetaConfigForClient(authz.client.id); }
  catch {
    return NextResponse.json({ success: false, message: 'Saved Meta secrets cannot be decrypted on this deployment.' }, { status: 503 });
  }
  if (!config) return NextResponse.json({ success: false, message: 'Save the Meta app configuration first.' }, { status: 503 });
  const origin = process.env.NEXT_PUBLIC_APP_URL || new URL(req.url).origin;
  const redirectUri = metaCallbackUrl(origin);
  const state = issueMetaOAuthState({
    clientId: authz.client.id,
    userId: authz.userId,
    channel,
    exp: Date.now() + 10 * 60 * 1_000,
    nonce: randomUUID(),
  });
  const url = new URL(`https://www.facebook.com/${META_GRAPH_VERSION}/dialog/oauth`);
  url.searchParams.set('client_id', config.appId);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('state', state);
  url.searchParams.set('config_id', config.loginConfigId);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('override_default_response_type', 'true');
  return NextResponse.json({ success: true, data: { authorizationUrl: url.toString(), expiresInSeconds: 600 } });
}
