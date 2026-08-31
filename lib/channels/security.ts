import { createHmac, timingSafeEqual } from 'node:crypto';

/** Meta signs the exact raw request body as sha256=<hex>. */
export function verifyMetaWebhookSignature(rawBody: string, signature: string | null, appSecret: string): boolean {
  if (!signature?.startsWith('sha256=') || !appSecret) return false;
  const expected = createHmac('sha256', appSecret).update(rawBody, 'utf8').digest('hex');
  const supplied = signature.slice('sha256='.length).toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(supplied)) return false;
  return timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(supplied, 'hex'));
}

export function safeEqualText(left: string, right: string): boolean {
  const a = Buffer.from(left, 'utf8');
  const b = Buffer.from(right, 'utf8');
  return a.length === b.length && timingSafeEqual(a, b);
}

export function redactProviderError(value: unknown): string {
  const message = value instanceof Error ? value.message : String(value);
  return message
    .replace(/(access[_ -]?token|app[_ -]?secret|authorization)[=: ]+[^\s,;}]+/gi, '$1=[REDACTED]')
    .slice(0, 1_000);
}
