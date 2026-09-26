// @vitest-environment node
/**
 * Unit tests for the pure parts of lib/survey-webhooks/dispatcher — HMAC
 * signing, secret generation, and durable-job idempotency keys. DB-coupled
 * paths (dispatchSurveyResponseWebhooks) are integration territory.
 */
import { describe, it, expect, vi } from 'vitest';

// The module imports @/lib/db which throws without DATABASE_URL at module load.
vi.mock('@/lib/db', () => ({ db: {} }));
vi.mock('@/lib/db/schema', () => ({
  surveyWebhooks: {},
  surveyWebhookDeliveries: {},
  surveyResponses: {},
}));
vi.mock('@/lib/ssrf-guard', () => ({ assertSafeUrl: vi.fn() }));

const {
  signPayload,
  generateWebhookSecret,
  surveyWebhookDeliveryDedupeKey,
} = await import(
  '@/lib/survey-webhooks/dispatcher'
);

describe('signPayload', () => {
  it('produces a 64-char lowercase hex string', () => {
    expect(signPayload('secret', 'payload')).toMatch(/^[0-9a-f]{64}$/);
  });

  it('matches a known RFC-4231-style HMAC-SHA256 vector', () => {
    // RFC 4231 §4.2: key = 20 × 0x0b, data = "Hi There"
    const key = Buffer.from('0b'.repeat(20), 'hex').toString('binary');
    const expected = 'b0344c61d8db38535ca8afceaf0bf12b881dc200c9833da726e9376c2e32cff7';
    expect(signPayload(key, 'Hi There')).toBe(expected);
  });

  it('is sensitive to body changes', () => {
    expect(signPayload('s', '{"a":1}')).not.toBe(signPayload('s', '{"a":2}'));
  });

  it('is sensitive to secret changes', () => {
    expect(signPayload('a', 'body')).not.toBe(signPayload('b', 'body'));
  });
});

describe('generateWebhookSecret', () => {
  it('returns 64 hex chars', () => {
    expect(generateWebhookSecret()).toMatch(/^[0-9a-f]{64}$/);
  });

  it('produces unique values across calls', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 64; i++) seen.add(generateWebhookSecret());
    expect(seen.size).toBe(64);
  });
});

describe('durable job idempotency keys', () => {
  it('assigns one delivery job per webhook and response', () => {
    expect(surveyWebhookDeliveryDedupeKey(7, 42)).toBe('survey.webhook_delivery:7:42');
    expect(surveyWebhookDeliveryDedupeKey(8, 42)).not.toBe(surveyWebhookDeliveryDedupeKey(7, 42));
  });
});
