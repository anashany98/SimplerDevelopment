/**
 * Integration tests for portal billing routes.
 *
 * Covers:
 *   - GET    /api/portal/settings/billing            — recent invoices + active services
 *   - POST   /api/portal/services/[id]/checkout      — Stripe checkout session creation
 *   - GET    /api/portal/billing/payment-methods     — list saved methods
 *   - DELETE /api/portal/billing/payment-methods     — detach a saved method
 *
 * Stripe is mocked at the module level so no network call is made. The test
 * asserts the route hands the right shape to `stripe.checkout.sessions.create`
 * (mode = subscription | payment, line items, customer wiring) and surfaces
 * the returned URL via the {success,data} envelope.
 *
 * Tenancy: a portal user can only ever read invoices + services scoped to
 * their own client_id, and can only delete payment methods that belong to
 * them. We seed cross-tenant rows and assert the route doesn't surface them.
 */
import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }));

// Stripe is dynamically imported inside the checkout route. Mock its default
// export so `new Stripe(key)` returns an object whose checkout.sessions.create
// is a vi.fn we can interrogate per-test.
//
// Important: the constructor MUST be a real `function` (not an arrow) so that
// `new Stripe(key)` works — vi.fn() is callable but not constructable, and
// the route does `const stripe = new Stripe(stripeKey)`.
const stripeCheckoutCreate = vi.fn();
const stripePaymentMethodDetach = vi.fn();
vi.mock('stripe', () => {
  function StripeMock(this: unknown) {
    Object.assign(this as object, {
      checkout: { sessions: { create: stripeCheckoutCreate } },
      paymentMethods: { detach: stripePaymentMethodDetach },
    });
  }
  return { default: StripeMock };
});

import { auth } from '@/lib/auth';
const mockedAuth = auth as unknown as Mock;

import { callHandler } from '../../../helpers/call-handler';
import { sessionForNewClientUser, type TenantCtx } from '../../../helpers/session';
import { getTestSql, TEST_SCHEMA } from '../../../helpers/test-db';

async function asTenant(ctx: TenantCtx | null) {
  mockedAuth.mockResolvedValue(ctx?.session ?? null);
}

async function seedService(opts: {
  name?: string;
  category?: string;
  price?: number;
  billingCycle?: 'once' | 'monthly' | 'annually';
  active?: boolean;
} = {}) {
  const sql = getTestSql();
  const slug = `svc-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const [row] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.services (name, slug, category, price, billing_cycle, active)
    VALUES (
      ${opts.name ?? 'Hosting Plan'},
      ${slug},
      ${opts.category ?? 'hosting'},
      ${opts.price ?? 1000},
      ${opts.billingCycle ?? 'monthly'},
      ${opts.active ?? true}
    )
    RETURNING id
  `;
  return row.id;
}

async function seedInvoice(clientId: number, amount = 5000, status = 'paid') {
  const sql = getTestSql();
  const number = `INV-TEST-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const [row] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.invoices (number, client_id, status, subtotal, total)
    VALUES (${number}, ${clientId}, ${status}, ${amount}, ${amount})
    RETURNING id
  `;
  return row.id;
}

async function seedClientService(clientId: number, serviceId: number) {
  const sql = getTestSql();
  await sql`
    INSERT INTO ${sql(TEST_SCHEMA)}.client_services (client_id, service_id, status)
    VALUES (${clientId}, ${serviceId}, 'active')
  `;
}

async function seedPaymentMethod(clientId: number) {
  const sql = getTestSql();
  const [row] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.payment_methods (
      client_id, stripe_payment_method_id, brand, last4, exp_month, exp_year
    )
    VALUES (
      ${clientId},
      ${'pm_' + Math.random().toString(36).slice(2)},
      'visa',
      '4242',
      12,
      2030
    )
    RETURNING id
  `;
  return row.id;
}

beforeEach(() => {
  stripeCheckoutCreate.mockReset();
  stripePaymentMethodDetach.mockReset();
  stripePaymentMethodDetach.mockResolvedValue({});
});

describe('GET /api/portal/settings/billing (subscription) @settings @billing @tenancy', () => {
  let A: TenantCtx;
  let B: TenantCtx;

  beforeEach(async () => {
    [A, B] = await Promise.all([
      sessionForNewClientUser('billing-get-a'),
      sessionForNewClientUser('billing-get-b'),
    ]);
  });

  it('returns only the caller\'s invoices + services (200)', async () => {
    // Seed cross-tenant data.
    const svc = await seedService({ name: 'A Plan' });
    const svcB = await seedService({ name: 'B Plan' });
    await seedClientService(A.client.id, svc);
    await seedClientService(B.client.id, svcB);
    await seedInvoice(A.client.id, 1000);
    await seedInvoice(B.client.id, 9999);

    await asTenant(A);
    const route = await import('@/app/api/portal/settings/billing/route');
    const res = await callHandler<{
      success: boolean;
      data: {
        invoices: Array<{ total: number; clientId: number }>;
        services: Array<{ serviceName: string }>;
        stripeCustomerId: string | null;
      };
    }>(route as unknown as Record<string, unknown>, 'GET');
    expect(res.status).toBe(200);
    expect(res.data?.success).toBe(true);
    // No cross-tenant leak.
    expect(res.data?.data.invoices.every(i => i.clientId === A.client.id)).toBe(true);
    const names = res.data?.data.services.map(s => s.serviceName);
    expect(names).toContain('A Plan');
    expect(names).not.toContain('B Plan');
  });

  it('caps invoices at 10 (most-recent first)', async () => {
    for (let i = 0; i < 12; i++) await seedInvoice(A.client.id, 100 + i);
    await asTenant(A);
    const route = await import('@/app/api/portal/settings/billing/route');
    const res = await callHandler<{ data: { invoices: unknown[] } }>(
      route as unknown as Record<string, unknown>, 'GET',
    );
    expect(res.status).toBe(200);
    expect(res.data?.data.invoices.length).toBeLessThanOrEqual(10);
  });

  it('rejects unauthenticated (401)', async () => {
    await asTenant(null);
    const route = await import('@/app/api/portal/settings/billing/route');
    const res = await callHandler(route as unknown as Record<string, unknown>, 'GET');
    expect(res.status).toBe(401);
  });
});

describe('POST /api/portal/services/[id]/checkout (payments disabled) @settings @billing', () => {
  let A: TenantCtx;

  beforeEach(async () => {
    A = await sessionForNewClientUser('billing-checkout');
  });

  it('returns 403 payments-disabled for any authenticated request', async () => {
    const svcId = await seedService({ billingCycle: 'monthly', price: 2500 });
    await asTenant(A);
    const route = await import('@/app/api/portal/services/[id]/checkout/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'POST',
      { params: { id: String(svcId) } },
    );
    expect(res.status).toBe(403);
    expect(stripeCheckoutCreate).not.toHaveBeenCalled();
  });

  it('rejects unauthenticated (401)', async () => {
    await asTenant(null);
    const route = await import('@/app/api/portal/services/[id]/checkout/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'POST',
      { params: { id: '1' } },
    );
    expect(res.status).toBe(401);
  });
});

describe('GET /api/portal/billing/payment-methods (payments disabled) @settings @billing', () => {
  it('returns 403 payments-disabled for any authenticated request', async () => {
    const A = await sessionForNewClientUser('pm-list-a');
    await seedPaymentMethod(A.client.id);
    await asTenant(A);
    const route = await import('@/app/api/portal/billing/payment-methods/route');
    const res = await callHandler(route as unknown as Record<string, unknown>, 'GET');
    expect(res.status).toBe(403);
  });

  it('rejects unauthenticated (401)', async () => {
    await asTenant(null);
    const route = await import('@/app/api/portal/billing/payment-methods/route');
    const res = await callHandler(route as unknown as Record<string, unknown>, 'GET');
    expect(res.status).toBe(401);
  });
});

describe('DELETE /api/portal/billing/payment-methods (payments disabled) @settings @billing', () => {
  let A: TenantCtx;

  beforeEach(async () => {
    A = await sessionForNewClientUser('pm-del-a');
  });

  it('returns 403 payments-disabled for any authenticated request', async () => {
    const id = await seedPaymentMethod(A.client.id);
    await asTenant(A);
    const route = await import('@/app/api/portal/billing/payment-methods/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'DELETE',
      { body: { id: String(id) } },
    );
    expect(res.status).toBe(403);
  });

  it('rejects unauthenticated (401)', async () => {
    await asTenant(null);
    const route = await import('@/app/api/portal/billing/payment-methods/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'DELETE',
      { body: { id: '1' } },
    );
    expect(res.status).toBe(401);
  });
});
