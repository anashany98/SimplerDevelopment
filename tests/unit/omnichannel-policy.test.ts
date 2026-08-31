import { describe, expect, it } from 'vitest';
import { evaluateOutboundPolicy } from '@/lib/channels/policy';

describe('omnichannel outbound policy @critical', () => {
  const now = new Date('2026-08-25T12:00:00.000Z');

  it('allows a provider reply inside the 24-hour customer window', () => {
    expect(evaluateOutboundPolicy({ channel: 'instagram', now, lastInboundAt: new Date('2026-08-24T12:00:00.000Z') }))
      .toMatchObject({ allowed: true, mode: 'session' });
  });

  it('fails closed one millisecond after the provider window', () => {
    expect(evaluateOutboundPolicy({ channel: 'messenger', now, lastInboundAt: new Date(now.getTime() - 86_400_001) }))
      .toMatchObject({ allowed: false, code: 'outside_customer_service_window' });
  });

  it('allows only an approved WhatsApp template outside the window', () => {
    expect(evaluateOutboundPolicy({ channel: 'whatsapp', now, approvedTemplateName: 'order_update' }))
      .toMatchObject({ allowed: true, mode: 'template' });
    expect(evaluateOutboundPolicy({ channel: 'whatsapp', now }))
      .toMatchObject({ allowed: false });
  });

  it('never permits marketing without recorded consent', () => {
    expect(evaluateOutboundPolicy({ channel: 'email', purpose: 'marketing', consentStatus: 'revoked' }))
      .toMatchObject({ allowed: false, code: 'consent_required' });
  });
});
