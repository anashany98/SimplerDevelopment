import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { channelAiConfigs } from '@/lib/db/schema';
import { authorizePortal, isAuthError } from '@/lib/portal-auth';
import { validateAiBaseUrl } from '@/lib/channels/ai-url';

export async function GET() {
  const authz = await authorizePortal({ action: 'read', scope: 'chat:read' });
  if (isAuthError(authz)) return authz.response;
  const [row] = await db.select({
    enabled: channelAiConfigs.enabled,
    provider: channelAiConfigs.provider,
    model: channelAiConfigs.model,
    baseUrl: channelAiConfigs.baseUrl,
    systemPrompt: channelAiConfigs.systemPrompt,
    autoSendMinConfidence: channelAiConfigs.autoSendMinConfidence,
    dailyTokenLimit: channelAiConfigs.dailyTokenLimit,
    monthlyTokenLimit: channelAiConfigs.monthlyTokenLimit,
    allowedTools: channelAiConfigs.allowedTools,
    policies: channelAiConfigs.policies,
    updatedAt: channelAiConfigs.updatedAt,
  }).from(channelAiConfigs).where(eq(channelAiConfigs.clientId, authz.client.id)).limit(1);
  const [secret] = await db.select({ apiKey: channelAiConfigs.apiKey }).from(channelAiConfigs)
    .where(eq(channelAiConfigs.clientId, authz.client.id)).limit(1);
  return NextResponse.json({ success: true, data: row ? { ...row, hasApiKey: Boolean(secret?.apiKey) } : null });
}

export async function PUT(req: Request) {
  const authz = await authorizePortal({ action: 'admin', scope: 'chat:write' });
  if (isAuthError(authz)) return authz.response;
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const provider = body.provider === 'openai-compatible' ? 'openai-compatible' : 'platform';
  const model = typeof body.model === 'string' ? body.model.trim().slice(0, 255) || null : null;
  const baseUrl = typeof body.baseUrl === 'string' ? body.baseUrl.trim() || null : null;
  const apiKey = typeof body.apiKey === 'string' ? body.apiKey.trim() || null : null;
  if (provider === 'openai-compatible') {
    if (!baseUrl || !model) return NextResponse.json({ success: false, message: 'Custom provider requires baseUrl and model' }, { status: 400 });
    try { validateAiBaseUrl(baseUrl); }
    catch (error) { return NextResponse.json({ success: false, message: error instanceof Error ? error.message : 'Invalid AI base URL' }, { status: 400 }); }
  }
  const [existing] = await db.select().from(channelAiConfigs).where(eq(channelAiConfigs.clientId, authz.client.id)).limit(1);
  if (provider === 'openai-compatible' && !apiKey && !existing?.apiKey) {
    return NextResponse.json({ success: false, message: 'Custom provider requires an API key' }, { status: 400 });
  }
  const confidence = typeof body.autoSendMinConfidence === 'number'
    ? Math.min(100, Math.max(50, Math.round(body.autoSendMinConfidence))) : 92;
  const values = {
    clientId: authz.client.id,
    enabled: body.enabled === true,
    provider,
    model: provider === 'platform' ? null : model,
    baseUrl: provider === 'platform' ? null : baseUrl,
    apiKey: provider === 'platform' ? null : (apiKey ?? existing?.apiKey ?? null),
    systemPrompt: typeof body.systemPrompt === 'string' ? body.systemPrompt.slice(0, 8_000) : null,
    autoSendMinConfidence: confidence,
    dailyTokenLimit: typeof body.dailyTokenLimit === 'number' && body.dailyTokenLimit > 0 ? Math.round(body.dailyTokenLimit) : null,
    monthlyTokenLimit: typeof body.monthlyTokenLimit === 'number' && body.monthlyTokenLimit > 0 ? Math.round(body.monthlyTokenLimit) : null,
    allowedTools: Array.isArray(body.allowedTools) ? body.allowedTools.filter((v): v is string => typeof v === 'string').slice(0, 50) : [],
    policies: body.policies && typeof body.policies === 'object' ? body.policies as Record<string, unknown> : {},
    updatedAt: new Date(),
  };
  await db.insert(channelAiConfigs).values(values).onConflictDoUpdate({
    target: channelAiConfigs.clientId,
    set: values,
  });
  return NextResponse.json({ success: true, data: { enabled: values.enabled, provider, model: values.model, baseUrl: values.baseUrl, hasApiKey: Boolean(values.apiKey) } });
}
