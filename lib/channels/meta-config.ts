import { and, eq, type SQL } from 'drizzle-orm';
import { db } from '@/lib/db';
import { channelProviderConfigs } from '@/lib/db/schema';
import { hasWorkspaceTenantSecretsKey } from '@/lib/crypto/secrets';

export interface ResolvedMetaConfig {
  source: 'tenant' | 'environment';
  clientId: number | null;
  publicId: string | null;
  appId: string;
  appSecret: string;
  loginConfigId: string;
  webhookVerifyToken: string;
}

export class MetaConfigEncryptionError extends Error {
  constructor() {
    super('WORKSPACE_TENANT_SECRETS_KEY is not configured correctly');
    this.name = 'MetaConfigEncryptionError';
  }
}

function environmentConfig(): ResolvedMetaConfig | null {
  const appId = process.env.META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;
  const loginConfigId = process.env.META_LOGIN_CONFIG_ID;
  const webhookVerifyToken = process.env.META_WEBHOOK_VERIFY_TOKEN;
  if (!appId || !appSecret || !loginConfigId || !webhookVerifyToken) return null;
  return {
    source: 'environment',
    clientId: null,
    publicId: null,
    appId,
    appSecret,
    loginConfigId,
    webhookVerifyToken,
  };
}

async function readTenantConfig(where: SQL | undefined) {
  const [header] = await db.select({ id: channelProviderConfigs.id })
    .from(channelProviderConfigs)
    .where(where)
    .limit(1);
  if (!header) return null;
  if (!hasWorkspaceTenantSecretsKey()) throw new MetaConfigEncryptionError();
  const [row] = await db.select({
    clientId: channelProviderConfigs.clientId,
    publicId: channelProviderConfigs.publicId,
    appId: channelProviderConfigs.appId,
    appSecret: channelProviderConfigs.appSecret,
    loginConfigId: channelProviderConfigs.loginConfigId,
    webhookVerifyToken: channelProviderConfigs.webhookVerifyToken,
  }).from(channelProviderConfigs).where(eq(channelProviderConfigs.id, header.id)).limit(1);
  return row ? { source: 'tenant' as const, ...row } : null;
}

export async function resolveMetaConfigForClient(clientId: number): Promise<ResolvedMetaConfig | null> {
  const tenant = await readTenantConfig(and(
    eq(channelProviderConfigs.clientId, clientId),
    eq(channelProviderConfigs.provider, 'meta'),
  ));
  return tenant ?? environmentConfig();
}

export async function resolveMetaConfigByPublicId(publicId: string): Promise<ResolvedMetaConfig | null> {
  if (!/^[0-9a-f-]{36}$/i.test(publicId)) return null;
  return readTenantConfig(and(
    eq(channelProviderConfigs.publicId, publicId),
    eq(channelProviderConfigs.provider, 'meta'),
  ));
}

export function resolveEnvironmentMetaConfig(): ResolvedMetaConfig | null {
  return environmentConfig();
}

export function metaCallbackUrl(origin: string): string {
  return `${origin.replace(/\/$/, '')}/api/portal/channels/meta/callback`;
}

export function metaWebhookUrl(origin: string, publicId: string | null): string {
  const url = new URL('/api/webhooks/meta', origin);
  if (publicId) url.searchParams.set('config', publicId);
  return url.toString();
}
