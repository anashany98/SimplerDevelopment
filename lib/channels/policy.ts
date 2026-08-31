import type { Channel } from './types';

export type OutboundPurpose = 'support' | 'transactional' | 'marketing';

export interface OutboundPolicyInput {
  channel: Channel;
  now?: Date;
  lastInboundAt?: Date | null;
  purpose?: OutboundPurpose;
  approvedTemplateName?: string | null;
  consentStatus?: 'granted' | 'revoked' | 'unknown';
}

export type PolicyDecision =
  | { allowed: true; mode: 'session' | 'template' | 'unrestricted'; reason: string }
  | { allowed: false; code: string; reason: string };

const CUSTOMER_SERVICE_WINDOW_MS = 24 * 60 * 60 * 1_000;

/** Deterministic provider-policy gate. Models and prompts never override it. */
export function evaluateOutboundPolicy(input: OutboundPolicyInput): PolicyDecision {
  const now = input.now ?? new Date();
  const purpose = input.purpose ?? 'support';
  if (purpose === 'marketing' && input.consentStatus !== 'granted') {
    return { allowed: false, code: 'consent_required', reason: 'Marketing requires recorded opt-in.' };
  }

  if (input.channel === 'webchat' || input.channel === 'email') {
    return { allowed: true, mode: 'unrestricted', reason: 'No provider conversation window applies.' };
  }

  const withinWindow = Boolean(
    input.lastInboundAt && now.getTime() - input.lastInboundAt.getTime() <= CUSTOMER_SERVICE_WINDOW_MS,
  );
  if (withinWindow) {
    return { allowed: true, mode: 'session', reason: 'Customer initiated within the 24-hour service window.' };
  }

  if (input.channel === 'whatsapp' && input.approvedTemplateName) {
    return { allowed: true, mode: 'template', reason: 'Approved WhatsApp template used outside the service window.' };
  }

  return {
    allowed: false,
    code: 'outside_customer_service_window',
    reason: input.channel === 'whatsapp'
      ? 'An approved template is required outside the 24-hour window.'
      : 'Messenger and Instagram replies require a user-initiated 24-hour window.',
  };
}
