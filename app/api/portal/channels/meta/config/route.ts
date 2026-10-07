import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { channelProviderConfigs, conversationAuditLogs } from '@/lib/db/schema';
import { hasWorkspaceTenantSecretsKey } from '@/lib/crypto/secrets';
import { metaCallbackUrl, metaWebhookUrl } from '@/lib/channels/meta-config';
import { authorizePortal, isAuthError } from '@/lib/portal-auth';

type Input = {
  appId?: unknown;
  appSecret?: unknown;
  loginConfigId?: unknown;
  webhookVerifyToken?: unknown;
};

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function validNumericId(value: string): boolean {
  return /^\d{5,64}$/.test(value);
}

function responseData(args: {
  source: 'tenant' | 'environment' | 'none';
  appId: string;
  loginConfigId: string;
  publicId: string | null;
  origin: string;
}) {
  return {
    configured: args.source !== 'none',
    source: args.source,
    appId: args.appId,
    loginConfigId: args.loginConfigId,
    hasAppSecret: args.source === 'tenant',
    hasWebhookVerifyToken: args.source === 'tenant',
    callbackUrl: metaCallbackUrl(args.origin),
    webhookUrl: metaWebhookUrl(args.origin, args.publicId),
  };
}

export async function GET(req: Request) {
  const authz = await authorizePortal({ action: 'admin', scope: 'chat:write' });
  if (isAuthError(authz)) return authz.response;
  const origin = process.env.NEXT_PUBLIC_APP_URL || new URL(req.url).origin;
  const [row] = await db.select({
    publicId: channelProviderConfigs.publicId,
    appId: channelProviderConfigs.appId,
    loginConfigId: channelProviderConfigs.loginConfigId,
  }).from(channelProviderConfigs).where(and(
    eq(channelProviderConfigs.clientId, authz.client.id),
    eq(channelProviderConfigs.provider, 'meta'),
  )).limit(1);
  if (row) {
    return NextResponse.json({ success: true, data: responseData({
      source: 'tenant', appId: row.appId, loginConfigId: row.loginConfigId,
      publicId: row.publicId, origin,
    }) });
  }
  const appId = process.env.META_APP_ID ?? '';
  const appSecret = process.env.META_APP_SECRET ?? '';
  const loginConfigId = process.env.META_LOGIN_CONFIG_ID ?? '';
  const verifyToken = process.env.META_WEBHOOK_VERIFY_TOKEN ?? '';
  const source = appId && appSecret && loginConfigId && verifyToken ? 'environment' : 'none';
  return NextResponse.json({ success: true, data: responseData({
    source, appId, loginConfigId, publicId: null, origin,
  }) });
}

export async function PUT(req: Request) {
  const authz = await authorizePortal({ action: 'admin', scope: 'chat:write' });
  if (isAuthError(authz)) return authz.response;
  if (!hasWorkspaceTenantSecretsKey()) {
    return NextResponse.json({
      success: false,
      message: 'Secret encryption is not configured on this deployment.',
    }, { status: 503 });
  }
  const body = await req.json().catch(() => ({})) as Input;
  const appId = stringValue(body.appId);
  const loginConfigId = stringValue(body.loginConfigId);
  const suppliedAppSecret = stringValue(body.appSecret);
  const suppliedVerifyToken = stringValue(body.webhookVerifyToken);
  if (!validNumericId(appId)) {
    return NextResponse.json({ success: false, message: 'Meta App ID must contain 5 to 64 digits.' }, { status: 400 });
  }
  if (!validNumericId(loginConfigId)) {
    return NextResponse.json({ success: false, message: 'Login configuration ID must contain 5 to 64 digits.' }, { status: 400 });
  }
  if (suppliedAppSecret && (!/^[0-9a-f]{32}$/i.test(suppliedAppSecret))) {
    return NextResponse.json({ success: false, message: 'Meta App Secret must be 32 hexadecimal characters.' }, { status: 400 });
  }
  if (suppliedVerifyToken && (suppliedVerifyToken.length < 16 || suppliedVerifyToken.length > 256 || /[\r\n]/.test(suppliedVerifyToken))) {
    return NextResponse.json({ success: false, message: 'Webhook verify token must contain 16 to 256 characters.' }, { status: 400 });
  }

  const [existing] = await db.select().from(channelProviderConfigs).where(and(
    eq(channelProviderConfigs.clientId, authz.client.id),
    eq(channelProviderConfigs.provider, 'meta'),
  )).limit(1);
  const appSecret = suppliedAppSecret || existing?.appSecret;
  const webhookVerifyToken = suppliedVerifyToken || existing?.webhookVerifyToken;
  if (!appSecret || !webhookVerifyToken) {
    return NextResponse.json({
      success: false,
      message: 'App Secret and webhook verify token are required the first time you save.',
    }, { status: 400 });
  }
  const publicId = existing?.publicId ?? randomUUID();
  const now = new Date();
  const savedPublicId = await db.transaction(async (tx) => {
    const [saved] = await tx.insert(channelProviderConfigs).values({
      clientId: authz.client.id,
      provider: 'meta',
      publicId,
      appId,
      appSecret,
      loginConfigId,
      webhookVerifyToken,
      configuredByUserId: authz.userId,
      updatedAt: now,
    }).onConflictDoUpdate({
      target: [channelProviderConfigs.clientId, channelProviderConfigs.provider],
      set: { appId, appSecret, loginConfigId, webhookVerifyToken, configuredByUserId: authz.userId, updatedAt: now },
    }).returning({ publicId: channelProviderConfigs.publicId });
    await tx.insert(conversationAuditLogs).values({
      clientId: authz.client.id,
      actorKind: 'user',
      actorUserId: authz.userId,
      action: 'channel.meta_config_saved',
      details: { provider: 'meta' },
    });
    return saved.publicId;
  });
  const origin = process.env.NEXT_PUBLIC_APP_URL || new URL(req.url).origin;
  return NextResponse.json({ success: true, data: responseData({
    source: 'tenant', appId, loginConfigId, publicId: savedPublicId, origin,
  }) });
}
