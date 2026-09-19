// @vitest-environment node
/**
 * Unit tests for the small pure billing helpers plus the dunning emails.
 *
 * - service-category: alias normalization (booking <-> bookings).
 * - disabled: the payments-off switch and its 403 envelope.
 * - dunning-emails: subjects, greeting/invoice-link branches, CTA link.
 *   The Resend client (@/lib/email `resend`) is mocked; no network, no DB.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { canonicalServiceCategory } from '@/lib/billing/service-category';
import { PAYMENTS_DISABLED, billingDisabledResponse } from '@/lib/billing/disabled';

const H = vi.hoisted(() => ({ sendMock: vi.fn() }));

vi.mock('@/lib/email', () => ({
  resend: { emails: { send: (...args: unknown[]) => H.sendMock(...args) } },
}));

import {
  sendPaymentFailedEmail,
  sendTrialWillEndEmail,
  sendSubscriptionSuspendedEmail,
} from '@/lib/billing/dunning-emails';
import {
  buildDesiredItems,
  toPriceData,
  toNamedCheckoutLineItem,
  toCheckoutLineItem,
} from '@/lib/billing/subscription-items';

beforeEach(() => {
  H.sendMock.mockReset();
  H.sendMock.mockResolvedValue({ data: { id: 'em_1' }, error: null });
});

describe('canonicalServiceCategory', () => {
  it('collapses the legacy booking alias to bookings', () => {
    expect(canonicalServiceCategory('booking')).toBe('bookings');
  });
  it('passes through current names and empties', () => {
    expect(canonicalServiceCategory('bookings')).toBe('bookings');
    expect(canonicalServiceCategory('crm')).toBe('crm');
    expect(canonicalServiceCategory(null)).toBe('');
    expect(canonicalServiceCategory(undefined)).toBe('');
    expect(canonicalServiceCategory('')).toBe('');
  });
});

describe('payments disabled switch', () => {
  it('is on and returns a 403 envelope', async () => {
    expect(PAYMENTS_DISABLED).toBe(true);
    const res = billingDisabledResponse();
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ success: false, message: 'Payments are disabled.' });
  });
  it('honors a custom status', () => {
    expect(billingDisabledResponse(402).status).toBe(402);
  });
});

describe('dunning emails', () => {
  it('payment_failed greets by company and links the invoice when present', async () => {
    await sendPaymentFailedEmail({ toEmail: 'a@a.test', companyName: 'Acme', invoiceUrl: 'https://inv.test/1' });
    expect(H.sendMock).toHaveBeenCalledTimes(1);
    const payload = H.sendMock.mock.calls[0][0] as Record<string, unknown>;
    expect(payload.to).toBe('a@a.test');
    expect(payload.html as string).toContain('Hi Acme,');
    expect(payload.html as string).toContain('https://inv.test/1');
    expect(payload.html as string).toContain('/portal/settings/billing/plans');
  });

  it('payment_failed falls back to a generic greeting without invoice', async () => {
    await sendPaymentFailedEmail({ toEmail: 'a@a.test', companyName: null });
    const payload = H.sendMock.mock.calls[0][0] as Record<string, unknown>;
    expect(payload.html as string).toContain('Hi there,');
    expect(payload.html as string).not.toContain('View the failed invoice');
  });

  it('trial_will_end and subscription_suspended send with distinct subjects', async () => {
    await sendTrialWillEndEmail({ toEmail: 'b@b.test', companyName: 'Beta', trialEndDate: new Date('2026-10-01') });
    await sendSubscriptionSuspendedEmail({ toEmail: 'c@c.test', companyName: null });
    expect(H.sendMock).toHaveBeenCalledTimes(2);
    const subjects = H.sendMock.mock.calls.map((c) => (c[0] as Record<string, unknown>).subject);
    expect(new Set(subjects).size).toBe(2);
  });
});

describe('subscription line items', () => {
  const modules = [
    { key: 'crm', stripeProductId: 'prod_crm', fullPriceCents: 2_500 },
    { key: 'email', stripeProductId: 'prod_email', fullPriceCents: 1_900 },
  ];

  it('builds one discounted module line each, no seat line for a single seat', () => {
    const { items, billing, seatLineOmitted } = buildDesiredItems({ modules, seatCount: 1 });
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ kind: 'module', productId: 'prod_crm', unitAmountCents: 2_500, quantity: 1, moduleKey: 'crm' });
    expect(billing.totalCents).toBe(4_400);
    expect(seatLineOmitted).toBe(false);
  });

  it('appends a seat line when seats exceed the included one', () => {
    const { items, billing, seatLineOmitted } = buildDesiredItems({
      modules,
      seatCount: 3,
      seatProductId: 'prod_seat',
    });
    expect(items).toHaveLength(3);
    const seat = items[2];
    expect(seat).toMatchObject({ kind: 'seat', productId: 'prod_seat', unitAmountCents: 3_000, quantity: 2 });
    expect(billing.totalCents).toBe(4_400 + 6_000);
    expect(seatLineOmitted).toBe(false);
  });

  it('omits (but flags) the seat line when the seat product is not provisioned', () => {
    const { items, seatLineOmitted } = buildDesiredItems({ modules, seatCount: 3 });
    expect(items).toHaveLength(2);
    expect(seatLineOmitted).toBe(true);
  });

  it('converts items to Stripe price_data and checkout lines', () => {
    const { items } = buildDesiredItems({ modules, seatCount: 2, seatProductId: 'prod_seat' });
    const priceData = toPriceData(items[0]);
    expect(priceData).toMatchObject({ currency: 'eur', product: 'prod_crm', unit_amount: 2_500 });
    expect(priceData.recurring).toMatchObject({ interval: 'month' });

    const checkout = toCheckoutLineItem(items[2]);
    expect(checkout.quantity).toBe(1);
    expect(checkout.price_data).toMatchObject({ product: 'prod_seat', unit_amount: 3_000 });

    const named = toNamedCheckoutLineItem(items[0], 'CRM & Sales');
    expect(named.price_data).toMatchObject({ unit_amount: 2_500 });
    expect((named.price_data as Record<string, unknown>).product_data).toMatchObject({ name: 'CRM & Sales' });
  });
});
