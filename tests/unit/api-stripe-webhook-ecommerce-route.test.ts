// @vitest-environment node
/**
 * Unit tests for `POST /api/stripe/webhook/ecommerce`.
 *
 * Stripe sends webhook events to this route. The route:
 *   - Refuses to run without STRIPE_SECRET_KEY + STRIPE_ECOMMERCE_WEBHOOK_SECRET
 *   - Verifies the Stripe signature via stripe.webhooks.constructEvent
 *   - Branches on event.type:
 *       * payment_intent.succeeded  -> mark order paid, decrement inventory,
 *                                      mark cart converted, bump discount-code
 *                                      usage, send confirmation email, emit
 *                                      automation event
 *       * payment_intent.payment_failed -> mark order failed, send retry email
 *       * charge.refunded -> mark order refunded, send refund email
 *
 * Each test stubs the entire dependency surface (db, schema, drizzle-orm,
 * Stripe SDK, email + automation helpers) — no live network or DB.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock harness state
// ---------------------------------------------------------------------------

interface StripeMockState {
  constructEvent: ReturnType<typeof vi.fn>;
}

const stripeState: StripeMockState = {
  constructEvent: vi.fn(),
};

interface DbState {
  selectQueue: unknown[][];
  inserts: Array<{ table: string; values: unknown }>;
  updates: Array<{ table: string; values: unknown }>;
}

const dbState: DbState = {
  selectQueue: [],
  inserts: [],
  updates: [],
};

interface EmailMockState {
  sendTransactionalEmail: ReturnType<typeof vi.fn>;
  getWebsiteUrls: ReturnType<typeof vi.fn>;
}

const emailState: EmailMockState = {
  sendTransactionalEmail: vi.fn(),
  getWebsiteUrls: vi.fn(),
};

interface AutomationMockState {
  emitEvent: ReturnType<typeof vi.fn>;
}

const automationState: AutomationMockState = {
  emitEvent: vi.fn(),
};

// ---------------------------------------------------------------------------
// Mocks (must be declared before importing the route under test)
// ---------------------------------------------------------------------------

vi.mock('stripe', () => {
  class Stripe {
    webhooks = {
      constructEvent: (...args: unknown[]) => stripeState.constructEvent(...args),
    };
    // Static errors namespace so instanceof checks work in the route
    static errors = {
      StripeSignatureVerificationError: class StripeSignatureVerificationError extends Error {},
    };
  }
  return { default: Stripe };
});

// Mock getStripeClient so the route gets our spy-equipped Stripe instance without
// needing STRIPE_SECRET_KEY to be set. The Stripe class above is used because
// the stripe module is already mocked — but getStripeClient is a separate import
// so we provide a factory that creates an instance of the mocked Stripe class.
vi.mock('@/lib/stripe', () => ({
  getStripeClient: () => ({
    webhooks: {
      constructEvent: (...args: unknown[]) => stripeState.constructEvent(...args),
    },
  }),
}));

// resolveSiteStripe is called on the metadata-derived websiteId path to check
// if the site is BYOK. Return a Connect (non-byok) context so processing continues.
vi.mock('@/lib/stripe/site-stripe', () => ({
  resolveSiteStripe: vi.fn().mockResolvedValue({
    mode: 'connect',
    stripe: { webhooks: { constructEvent: (...args: unknown[]) => stripeState.constructEvent(...args) } },
    webhookSecret: null,
  }),
  SiteStripeError: class SiteStripeError extends Error {
    code: string;
    constructor(message: string, code: string) { super(message); this.code = code; }
  },
}));

vi.mock('@/lib/db/schema', () => {
  function tableProxy(name: string) {
    return new Proxy(
      { _name: name },
      {
        get(_target, prop) {
          if (prop === '_name') return name;
          return `${name}.${String(prop)}`;
        },
      },
    );
  }
  const tables = [
    'orders', 'orderItems', 'orderStatusHistory',
    'carts', 'products', 'productVariants', 'discountCodes',
    // Read on the paid path to resolve the order's owning client for the
    // pod.submit job row (internal_jobs.client_id).
    'clientWebsites', 'internalJobs',
  ];
  const exports: Record<string, unknown> = {};
  for (const t of tables) exports[t] = tableProxy(t);
  return exports;
});

vi.mock('drizzle-orm', () => ({
  eq: (a: unknown, b: unknown) => ({ _op: 'eq', a, b }),
  and: (...args: unknown[]) => ({ _op: 'and', args }),
  sql: (strings: TemplateStringsArray, ...vals: unknown[]) => ({
    _op: 'sql',
    strings,
    vals,
  }),
  isNull: (a: unknown) => ({ op: 'isNull', a }),
  or: (...args: unknown[]) => ({ op: 'or', args: args.filter(Boolean) }),
  inArray: (a: unknown, list: unknown[]) => ({ op: 'inArray', a, list }),
}));

vi.mock('@/lib/db', () => {
  function makeSelectChain() {
    const rows = dbState.selectQueue.shift() ?? [];
    const chain: Record<string, unknown> = {};
    const passthrough = ['from', 'where', 'innerJoin', 'leftJoin', 'orderBy', 'limit', 'groupBy', 'offset'];
    for (const m of passthrough) chain[m] = () => chain;
    chain.then = (resolve: (v: unknown) => unknown) =>
      Promise.resolve(rows).then(resolve);
    return chain;
  }

  function makeInsertChain(table: string) {
    const insertChain: Record<string, unknown> = {};
    insertChain.values = (v: unknown) => {
      dbState.inserts.push({ table, values: v });
      return insertChain;
    };
    insertChain.returning = () => Promise.resolve([]);
    // enqueueJob (lib/jobs) inserts with ON CONFLICT DO NOTHING for idempotency.
    insertChain.onConflictDoNothing = () => insertChain;
    insertChain.then = (resolve: (v: unknown) => unknown) =>
      Promise.resolve(undefined).then(resolve);
    return insertChain;
  }

  function makeUpdateChain(table: string) {
    const updateChain: Record<string, unknown> = {};
    updateChain.set = (v: unknown) => {
      dbState.updates.push({ table, values: v });
      return updateChain;
    };
    updateChain.where = () => updateChain;
    updateChain.returning = () => Promise.resolve(dbState.selectQueue.shift() ?? []);
    updateChain.then = (resolve: (v: unknown) => unknown) =>
      Promise.resolve(undefined).then(resolve);
    return updateChain;
  }

  function tableName(t: unknown): string {
    if (t && typeof t === 'object' && '_name' in t) {
      return String((t as { _name: unknown })._name);
    }
    return 'unknown';
  }

  return {
    db: {
      select: () => makeSelectChain(),
      insert: (t: unknown) => makeInsertChain(tableName(t)),
      update: (t: unknown) => makeUpdateChain(tableName(t)),
    },
  };
});

vi.mock('@/lib/email/send-transactional', () => ({
  sendTransactionalEmail: (...args: unknown[]) => emailState.sendTransactionalEmail(...args),
  getWebsiteUrls: (...args: unknown[]) => emailState.getWebsiteUrls(...args),
  formatCents: (n: number) => `$${(n / 100).toFixed(2)}`,
  formatAddress: (addr: unknown) => JSON.stringify(addr ?? {}),
  formatEmailDate: (d: unknown) => String(d ?? ''),
  buildItemsHtml: (items: unknown[]) => `<ul>${items.length}</ul>`,
}));

vi.mock('@/lib/automation/event-bus', () => ({
  emitEvent: (...args: unknown[]) => automationState.emitEvent(...args),
}));

// Billing was removed (2026-08): the route short-circuits with 403 when
// PAYMENTS_DISABLED is true. The gate is mocked open here so the tests below
// can exercise the webhook-handling logic itself (same pattern as
// api-billing-verify-session.test.ts).
vi.mock('@/lib/billing/disabled', () => ({
  PAYMENTS_DISABLED: false,
  billingDisabledResponse: (status = 403) =>
    new Response(JSON.stringify({ success: false, message: 'Payments are disabled.' }), {
      status,
    }),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(body: string, sig: string | null = 't=1,v1=sig'): Request {
  const headers: Record<string, string> = {};
  if (sig !== null) headers['stripe-signature'] = sig;
  return new Request('http://localhost/api/stripe/webhook/ecommerce', {
    method: 'POST',
    headers,
    body,
  });
}

interface JsonResponse {
  received?: boolean;
  error?: string;
}

/**
 * The client_websites lookup on the paid path, which resolves the order's
 * owning tenant for the queued pod.submit job. The db mock serves selects
 * positionally, so every paid-path test must queue this row between the order
 * lookup and the order-items lookup or the sequence shifts by one.
 */
const SITE_ROW = [{ clientId: 99 }];

const DEFAULT_ORDER = {
  id: 500,
  websiteId: 1,
  orderNumber: 'ORD-0001',
  customerEmail: 'alice@example.com',
  customerName: 'Alice Smith',
  total: 5000,
  subtotal: 4500,
  shippingTotal: 500,
  taxTotal: 0,
  discountTotal: 0,
  discountCode: null as string | null,
  shippingAddress: { line1: '1 Main' },
  billingAddress: { line1: '1 Main' },
  createdAt: new Date('2026-01-15T10:00:00Z'),
};

beforeEach(() => {
  vi.clearAllMocks();
  process.env.STRIPE_ECOMMERCE_WEBHOOK_SECRET = 'whsec_platform';
  mocks.constructEvent.mockReturnValue(event);
  mocks.processStorePayment.mockResolvedValue(undefined);
  mocks.resolveSiteStripe.mockResolvedValue({ mode: 'connect', webhookSecret: 'whsec_site', stripe: { webhooks: { constructEvent: mocks.constructEvent } } });
});
describe('ecommerce webhook verified delivery', () => {
  it('validates the signature before delegating the canonical tenant and event', async () => {
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(mocks.constructEvent).toHaveBeenCalledWith('signed-body', 'valid-signature', 'whsec_platform');
    expect(mocks.processStorePayment).toHaveBeenCalledWith(event, 12);
  });
  it('rejects an invalid signature without claiming a payment event', async () => {
    mocks.constructEvent.mockImplementationOnce(() => { throw new Error('invalid signature'); });
    expect((await POST(request())).status).toBe(401);
    expect(mocks.processStorePayment).not.toHaveBeenCalled();
  });
  it('uses the per-site signing secret for BYOK', async () => {
    mocks.resolveSiteStripe.mockResolvedValueOnce({ mode: 'byok', webhookSecret: 'whsec_site', stripe: { webhooks: { constructEvent: mocks.constructEvent } } });
    expect((await POST(request())).status).toBe(200);
    expect(mocks.constructEvent).toHaveBeenCalledWith('signed-body', 'valid-signature', 'whsec_site');
  });
  it('derives the site from signed metadata on the Connect platform endpoint', async () => {
    expect((await POST(request(''))).status).toBe(200);
    expect(mocks.resolveSiteStripe).toHaveBeenCalledWith(12);
    expect(mocks.processStorePayment).toHaveBeenCalledWith(event, 12);
  });
  it('skips misrouted BYOK deliveries on the platform endpoint', async () => {
    mocks.resolveSiteStripe.mockResolvedValueOnce({ mode: 'byok' });
    expect((await POST(request(''))).status).toBe(200);
    expect(mocks.processStorePayment).not.toHaveBeenCalled();
  });
  it('fails retryably when the payment transaction fails instead of acknowledging lost effects', async () => {
    mocks.processStorePayment.mockRejectedValueOnce(new Error('database unavailable'));
    expect((await POST(request())).status).toBe(500);
  });
  it('cannot verify or process a delivery without a configured signing secret', async () => {
    delete process.env.STRIPE_ECOMMERCE_WEBHOOK_SECRET;
    expect((await POST(request())).status).toBe(500);
    expect(mocks.constructEvent).not.toHaveBeenCalled();
    expect(mocks.processStorePayment).not.toHaveBeenCalled();
  });
});
