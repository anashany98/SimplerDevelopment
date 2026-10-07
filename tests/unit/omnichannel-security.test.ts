import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { extractMetaExternalAccountIds } from '@/lib/channels/meta-webhook';
import { verifyMetaWebhookSignature } from '@/lib/channels/security';
import { isAllowedWidgetOrigin } from '@/lib/chat/origin';
import { validateAiBaseUrl } from '@/lib/channels/ai-url';

describe('omnichannel webhook and widget security @critical', () => {
  it('verifies Meta against the exact raw body and rejects tampering', () => {
    const raw = '{"object":"whatsapp_business_account"}';
    const signature = `sha256=${createHmac('sha256', 'secret').update(raw).digest('hex')}`;
    expect(verifyMetaWebhookSignature(raw, signature, 'secret')).toBe(true);
    expect(verifyMetaWebhookSignature(`${raw} `, signature, 'secret')).toBe(false);
    expect(verifyMetaWebhookSignature(raw, 'sha256=bad', 'secret')).toBe(false);
  });

  it('routes WhatsApp by phone-number id, not the WABA entry id', () => {
    expect(extractMetaExternalAccountIds({ entry: [{ id: 'waba-1', changes: [{ value: { metadata: { phone_number_id: 'phone-1' } } }] }] }))
      .toEqual(['phone-1']);
  });

  it('falls back to Page or Instagram entry ids', () => {
    expect(extractMetaExternalAccountIds({ entry: [{ id: 'page-1', messaging: [] }] })).toEqual(['page-1']);
  });

  it('uses exact hosts and explicit subdomain wildcards', () => {
    expect(isAllowedWidgetOrigin('https://app.example.com', ['app.example.com'])).toBe(true);
    expect(isAllowedWidgetOrigin('https://evil-app.example.com', ['app.example.com'])).toBe(false);
    expect(isAllowedWidgetOrigin('https://store.example.com', ['*.example.com'])).toBe(true);
    expect(isAllowedWidgetOrigin('https://example.com', ['*.example.com'])).toBe(false);
    expect(isAllowedWidgetOrigin(null, ['app.example.com'])).toBe(false);
  });

  it('rejects insecure, credentialed and private AI endpoints by default', () => {
    expect(() => validateAiBaseUrl('http://api.example.com/v1')).toThrow(/HTTPS/);
    expect(() => validateAiBaseUrl('https://user:secret@api.example.com/v1')).toThrow(/credentials/);
    expect(() => validateAiBaseUrl('https://169.254.169.254/latest')).toThrow(/allowlisted/);
    expect(() => validateAiBaseUrl('https://10.0.0.8/v1')).toThrow(/allowlisted/);
    expect(validateAiBaseUrl('https://api.example.com/v1/').toString()).toBe('https://api.example.com/v1');
  });

  it('permits only an explicitly allowlisted private AI host', () => {
    const previous = process.env.AI_COMPATIBLE_ALLOWED_HOSTS;
    process.env.AI_COMPATIBLE_ALLOWED_HOSTS = '10.0.0.8';
    try {
      expect(validateAiBaseUrl('https://10.0.0.8/v1').hostname).toBe('10.0.0.8');
      expect(validateAiBaseUrl('https://api.example.com/v1').hostname).toBe('api.example.com');
      expect(() => validateAiBaseUrl('https://10.0.0.9/v1')).toThrow(/allowlisted/);
    } finally {
      if (previous === undefined) delete process.env.AI_COMPATIBLE_ALLOWED_HOSTS;
      else process.env.AI_COMPATIBLE_ALLOWED_HOSTS = previous;
    }
  });

  it('requires every production AI hostname to be operator allowlisted', () => {
    const previousHosts = process.env.AI_COMPATIBLE_ALLOWED_HOSTS;
    const previousNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    process.env.AI_COMPATIBLE_ALLOWED_HOSTS = 'inference.example.com';
    try {
      expect(validateAiBaseUrl('https://inference.example.com/v1').hostname).toBe('inference.example.com');
      expect(() => validateAiBaseUrl('https://tenant-supplied.example/v1')).toThrow(/explicitly allowlisted/);
    } finally {
      if (previousHosts === undefined) delete process.env.AI_COMPATIBLE_ALLOWED_HOSTS;
      else process.env.AI_COMPATIBLE_ALLOWED_HOSTS = previousHosts;
      if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = previousNodeEnv;
    }
  });
});
