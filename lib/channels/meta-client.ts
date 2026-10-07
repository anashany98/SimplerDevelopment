import { redactProviderError } from './security';

export const META_GRAPH_VERSION = process.env.META_GRAPH_VERSION || 'v26.0';

export class MetaGraphError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: number,
    readonly retryable = false,
  ) {
    super(message);
    this.name = 'MetaGraphError';
  }
}

function retryableStatus(status: number, code?: number): boolean {
  return status === 429 || status >= 500 || code === 613;
}

export async function metaGraphRequest<T>(args: {
  path: string;
  accessToken: string;
  method?: 'GET' | 'POST' | 'DELETE';
  body?: Record<string, unknown>;
  query?: URLSearchParams;
}): Promise<T> {
  const query = args.query ?? new URLSearchParams();
  const url = new URL(`https://graph.facebook.com/${META_GRAPH_VERSION}/${args.path.replace(/^\//, '')}`);
  query.forEach((value, key) => url.searchParams.set(key, value));

  const response = await fetch(url, {
    method: args.method ?? 'GET',
    headers: {
      Authorization: `Bearer ${args.accessToken}`,
      ...(args.body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: args.body ? JSON.stringify(args.body) : undefined,
    signal: AbortSignal.timeout(15_000),
  });
  const raw = await response.text();
  let payload: Record<string, unknown> = {};
  try { payload = raw ? JSON.parse(raw) as Record<string, unknown> : {}; } catch { /* non-JSON error */ }
  if (!response.ok) {
    const err = payload.error as Record<string, unknown> | undefined;
    const code = typeof err?.code === 'number' ? err.code : undefined;
    throw new MetaGraphError(
      redactProviderError(err?.message ?? `Meta Graph returned HTTP ${response.status}`),
      response.status,
      code,
      retryableStatus(response.status, code),
    );
  }
  return payload as T;
}

export async function exchangeMetaAuthorizationCode(
  code: string,
  redirectUri: string,
  credentials?: { appId: string; appSecret: string },
): Promise<string> {
  const appId = credentials?.appId ?? process.env.META_APP_ID;
  const appSecret = credentials?.appSecret ?? process.env.META_APP_SECRET;
  if (!appId || !appSecret) throw new Error('Meta app credentials are required');
  const query = new URLSearchParams({ client_id: appId, client_secret: appSecret, code, redirect_uri: redirectUri });
  const response = await fetch(`https://graph.facebook.com/${META_GRAPH_VERSION}/oauth/access_token?${query}`, {
    signal: AbortSignal.timeout(15_000),
  });
  const payload = await response.json() as { access_token?: string; error?: { message?: string } };
  if (!response.ok || !payload.access_token) {
    throw new Error(redactProviderError(payload.error?.message ?? 'Meta OAuth code exchange failed'));
  }
  return payload.access_token;
}

export interface WhatsAppPhoneAsset {
  businessId: string;
  businessName?: string;
  wabaId: string;
  wabaName?: string;
  phoneNumberId: string;
  displayPhoneNumber?: string;
  verifiedName?: string;
  qualityRating?: string;
}

export async function discoverWhatsAppAssets(accessToken: string): Promise<WhatsAppPhoneAsset[]> {
  type Row = Record<string, unknown>;
  const businesses = await metaGraphRequest<{ data?: Row[] }>({
    path: 'me/businesses', accessToken, query: new URLSearchParams({ fields: 'id,name' }),
  });
  const assets: WhatsAppPhoneAsset[] = [];
  for (const business of businesses.data ?? []) {
    if (typeof business.id !== 'string') continue;
    const wabas = await metaGraphRequest<{ data?: Row[] }>({
      path: `${business.id}/owned_whatsapp_business_accounts`, accessToken,
      query: new URLSearchParams({ fields: 'id,name' }),
    });
    for (const waba of wabas.data ?? []) {
      if (typeof waba.id !== 'string') continue;
      const phones = await metaGraphRequest<{ data?: Row[] }>({
        path: `${waba.id}/phone_numbers`, accessToken,
        query: new URLSearchParams({ fields: 'id,display_phone_number,verified_name,quality_rating' }),
      });
      for (const phone of phones.data ?? []) {
        if (typeof phone.id !== 'string') continue;
        assets.push({
          businessId: business.id,
          businessName: typeof business.name === 'string' ? business.name : undefined,
          wabaId: waba.id,
          wabaName: typeof waba.name === 'string' ? waba.name : undefined,
          phoneNumberId: phone.id,
          displayPhoneNumber: typeof phone.display_phone_number === 'string' ? phone.display_phone_number : undefined,
          verifiedName: typeof phone.verified_name === 'string' ? phone.verified_name : undefined,
          qualityRating: typeof phone.quality_rating === 'string' ? phone.quality_rating : undefined,
        });
      }
    }
  }
  return assets;
}
