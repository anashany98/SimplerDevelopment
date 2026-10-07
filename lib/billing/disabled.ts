import { NextResponse } from 'next/server';

/**
 * Billing removed (2026-08): payments are disabled across Freebuff.
 * Every charging/billing entry point returns this envelope so nothing can
 * be charged, subscribed, or redirected to a payment portal.
 *
 * `PAYMENTS_DISABLED` is the single switch for this behaviour — set it to
 * `false` only if payments are ever reintroduced.
 */
export const PAYMENTS_DISABLED = true;

export function billingDisabledResponse(status = 403): NextResponse {
  return NextResponse.json(
    { success: false, message: 'Payments are disabled.' },
    { status },
  );
}
