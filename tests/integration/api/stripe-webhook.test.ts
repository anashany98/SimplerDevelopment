/**
 * Stripe webhook behaviour with payments disabled.
 *
 * Payments are removed from Freebuff — the handler acknowledges every event
 * with a 200 (so Stripe stops retrying) but processes nothing, regardless of
 * the `stripe-signature` header. The old signature-verification and
 * invoice-marking flows are gone.
 *
 * No network calls hit Stripe's API during these tests — `constructEvent` is
 * pure HMAC and `new Stripe(key)` is just a client factory. So we don't need
 * MSW handlers for api.stripe.com here.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { createHmac } from 'node:crypto';

// These must be set BEFORE the route is imported. Conveniently, setup-api.ts
// runs first and defines TEST_SCHEMA env manipulation; extend it here via
// beforeAll which runs before any test-body imports.
process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || 'sk_test_mock';
process.env.STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || 'whsec_test_mock';

import { callHandler } from '../../helpers/call-handler';
import { sessionForNewClientUser } from '../../helpers/session';
import { getTestSql, TEST_SCHEMA } from '../../helpers/test-db';

function signStripeEvent(secret: string, payload: string, timestamp = Math.floor(Date.now() / 1000)): string {
  const signedPayload = `${timestamp}.${payload}`;
  const v1 = createHmac('sha256', secret).update(signedPayload).digest('hex');
  return `t=${timestamp},v1=${v1}`;
}

function buildCheckoutCompletedEvent(metadata: Record<string, string | number>, sessionId = 'cs_test_mock_1'): string {
  return JSON.stringify({
    id: 'evt_test_' + Date.now(),
    object: 'event',
    type: 'checkout.session.completed',
    created: Math.floor(Date.now() / 1000),
    livemode: false,
    api_version: '2024-06-20',
    data: {
      object: {
        id: sessionId,
        object: 'checkout.session',
        payment_status: 'paid',
        customer: 'cus_test_1',
        metadata,
      },
    },
  });
}

async function createInvoice(clientId: number): Promise<{ id: number; number: string }> {
  const sql = getTestSql();
  const number = `INV-${Date.now()}-${Math.floor(Math.random() * 9999)}`;
  const [row] = await sql<{ id: number; number: string }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.invoices (number, client_id, status, subtotal, tax, total)
    VALUES (${number}, ${clientId}, 'sent', 10000, 0, 10000) RETURNING id, number
  `;
  return row;
}

describe('Stripe webhook @billing @security', () => {
  const SECRET = process.env.STRIPE_WEBHOOK_SECRET!;

  // Payments are disabled in Freebuff — the webhook acknowledges every event
  // (200, so Stripe stops retrying) but processes nothing, regardless of the
  // signature.
  it('acknowledges every event without processing (payments disabled)', async () => {
    const route = await import('@/app/api/stripe/webhook/route');
    const body = buildCheckoutCompletedEvent({});
    const res = await callHandler(
      route as unknown as Record<string, unknown>,
      'POST',
      { body, headers: { 'content-type': 'application/json' } },   // no stripe-signature header
    );
    expect(res.status).toBe(200);
    const body = res.data as { billingDisabled?: boolean };
    expect(body.billingDisabled).toBe(true);
  });

  it('acknowledges signed events but never marks invoices paid', async () => {
    const ctx = await sessionForNewClientUser('stripe-disabled');
    const invoice = await createInvoice(ctx.client.id);
    const body = buildCheckoutCompletedEvent({ invoiceId: String(invoice.id) });
    const sig = signStripeEvent(SECRET, body);

    const route = await import('@/app/api/stripe/webhook/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>,
      'POST',
      { body, headers: { 'stripe-signature': sig, 'content-type': 'application/json' } },
    );
    expect(res.status).toBe(200);

    const sql = getTestSql();
    const [after] = await sql<{ status: string }[]>`
      SELECT status FROM ${sql(TEST_SCHEMA)}.invoices WHERE id = ${invoice.id}
    `;
    expect(after.status).toBe('sent'); // untouched — no payment processing
  });
});
