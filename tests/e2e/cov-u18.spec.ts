/**
 * Billing Stripe E2E coverage — unit 18 slice (cards 0-3)
 *
 * All four cards in this slice reference features with no implemented API
 * routes. Tests are skipped and serve as gap documentation.
 *
 *  Card 0 — Failed-payment dunning + automatic retry
 *    No dunning or retry webhook handler exists (invoice.payment_failed is
 *    handled for e-commerce / bookings only; no platform-subscription dunning).
 *
 *  Card 1 — Customer self-serve billing portal
 *    The endpoint exists, but customer payment actions are disabled by policy.
 *
 *  Card 2 — Stripe Connect / BYOK flow
 *    The store-level stripe-connect route exists but the platform-level
 *    Stripe Connect / BYOK billing flow has no dedicated API endpoint.
 *
 *  Card 3 — Module subscription checkout
 *    The endpoint exists, but customer payment actions are disabled by policy.
 */

import { test, expect } from './setup/fixtures';

// ── Card 0: Failed-payment dunning + automatic retry ──

test.describe('Billing — Failed-payment dunning + automatic retry @billing', () => {
  test.skip(true, 'gap: no dunning/retry webhook handler implemented for platform subscriptions');

  test('invoice.payment_failed triggers dunning email and schedules retry', async ({ clientApi }) => {
    // No route to test — implementation does not exist
    const res = await clientApi.post('/api/billing/dunning/retry', {});
    expect(res.status).toBe(200);
  });
});

// ── Card 1: Customer self-serve billing portal ──

test.describe('Billing — Customer self-serve billing portal @billing', () => {
  test('customer portal reports that payments are disabled', async ({ clientApi }) => {
    const res = await clientApi.post('/api/portal/billing/customer-portal', {});
    expect(res.status).toBe(403);
    expect(res.data).toMatchObject({ success: false, message: 'Payments are disabled.' });
  });
});

// ── Card 2: Stripe Connect / BYOK flow ──

test.describe('Billing — Stripe Connect / BYOK flow @billing', () => {
  test.skip(true, 'gap: no platform-level Stripe Connect / BYOK billing API endpoint');

  test('Stripe Connect / BYOK flow has a dedicated API endpoint', async ({ clientApi }) => {
    // Store-level stripe-connect exists but platform BYOK billing flow does not
    const res = await clientApi.post('/api/billing/connect', {});
    expect(res.status).toBe(200);
  });
});

// ── Card 3: Module subscription checkout ──

test.describe('Billing — Module subscription checkout @billing', () => {
  test('module checkout reports that payments are disabled', async ({ clientApi }) => {
    const res = await clientApi.post('/api/portal/billing/modules/checkout', {
      slug: 'crm',
    });
    expect(res.status).toBe(403);
    expect(res.data).toMatchObject({ success: false, message: 'Payments are disabled.' });
  });
});
