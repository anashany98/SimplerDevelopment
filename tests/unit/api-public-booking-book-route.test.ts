// @vitest-environment node
/**
 * Unit tests for POST /api/public/booking/[slug]/book.
 *
 * The route performs many sequential db.select / db.insert / db.update calls.
 * Rather than re-implementing Drizzle, we use a small "scripted queue" mock:
 *  - selectQueue: array of result rows (in call order)
 *  - insertQueue: array of returned-rows arrays
 *  - updateCalls: simply tracked
 * Each test pushes the exact responses needed for that branch.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

type Row = Record<string, unknown>;

const selectQueue: Row[][] = [];
// A queued Error makes the next .returning() reject — used to simulate a DB
// unique-constraint violation (the exclusive-slot double-booking guard).
const insertReturns: (Row[] | Error)[] = [];
const insertCalls: { table: unknown; values: unknown }[] = [];
const updateCalls: { table: unknown; values: unknown }[] = [];

vi.mock('@/lib/db', () => {
  const makeSelectChain = () => {
    const chain: Record<string, unknown> = {};
    chain.from = () => chain;
    chain.where = () => chain;
    chain.limit = () => Promise.resolve(selectQueue.shift() ?? []);
    chain.groupBy = () => Promise.resolve(selectQueue.shift() ?? []);
    // For the legacy assignedMembers branch that ends with .where() (no limit/groupBy)
    // we make .where return both a thenable and chainable shape.
    const where = () => {
      const inner: Record<string, unknown> = {};
      inner.limit = () => Promise.resolve(selectQueue.shift() ?? []);
      inner.groupBy = () => Promise.resolve(selectQueue.shift() ?? []);
      inner.then = (resolve: (v: unknown) => unknown) =>
        Promise.resolve(selectQueue.shift() ?? []).then(resolve);
      return inner;
    };
    chain.where = where;
    return chain;
  };
  return {
    db: {
      select: () => makeSelectChain(),
      insert: (table: unknown) => ({
        values: (values: unknown) => {
          insertCalls.push({ table, values });
          return {
            returning: () => {
              const next = insertReturns.shift() ?? [];
              return next instanceof Error ? Promise.reject(next) : Promise.resolve(next);
            },
            // For insertions without .returning() (e.g. attendees, addons, redemptions)
            then: (resolve: (v: unknown) => unknown) => Promise.resolve(undefined).then(resolve),
          };
        },
      }),
      update: (table: unknown) => ({
        set: (values: unknown) => ({
          where: () => {
            updateCalls.push({ table, values });
            return Promise.resolve(undefined);
          },
        }),
      }),
    },
  };
});

vi.mock('@/lib/db/schema', () => {
  const col = (name: string) => ({ __col: name });
  const tbl = (name: string, cols: string[]) => {
    const t: Record<string, unknown> = { __table: name };
    for (const c of cols) t[c] = col(c);
    return t;
  };
  return {
    bookingPages: tbl('bookingPages', ['id', 'slug', 'active']),
    bookings: tbl('bookings', [
      'id', 'bookingPageId', 'status', 'startTime', 'endTime', 'groupSize', 'assignedTo',
    ]),
    bookingAddOns: tbl('bookingAddOns', ['id', 'bookingPageId', 'active']),
    bookingSelectedAddOns: tbl('bookingSelectedAddOns', []),
    bookingAttendees: tbl('bookingAttendees', []),
    bookingDateOverrides: tbl('bookingDateOverrides', ['id', 'bookingPageId', 'date', 'type', 'startTime', 'endTime']),
    bookingPageMembers: tbl('bookingPageMembers', ['id', 'bookingPageId', 'userId', 'active', 'availability']),
    discountCodes: tbl('discountCodes', [
      'websiteId', 'code', 'active', 'applicableTo', 'usedCount',
    ]),
    giftCertificates: tbl('giftCertificates', [
      'id', 'code', 'status', 'clientId', 'redeemableAt',
    ]),
    giftCertificateRedemptions: tbl('giftCertificateRedemptions', []),
    clientWebsites: tbl('clientWebsites', ['id', 'clientId', 'active']),
    storeSettings: tbl('storeSettings', ['websiteId', 'enabled']),
    products: tbl('products', ['id']),
    productVariants: tbl('productVariants', ['id']),
    clients: tbl('clients', ['id', 'userId']),
    users: tbl('users', ['id', 'email']),
  };
});

vi.mock('drizzle-orm', () => ({
  eq: (col: unknown, val: unknown) => ({ kind: 'eq', col, val }),
  and: (...parts: unknown[]) => ({ kind: 'and', parts }),
  ne: (col: unknown, val: unknown) => ({ kind: 'ne', col, val }),
  gte: (col: unknown, val: unknown) => ({ kind: 'gte', col, val }),
  lte: (col: unknown, val: unknown) => ({ kind: 'lte', col, val }),
  sql: Object.assign(
    (strings: TemplateStringsArray, ...values: unknown[]) => ({ kind: 'sql', strings, values }),
    {},
  ),
  isNull: (a: unknown) => ({ op: 'isNull', a }),
  or: (...args: unknown[]) => ({ op: 'or', args: args.filter(Boolean) }),
  inArray: (a: unknown, list: unknown[]) => ({ op: 'inArray', a, list }),
}));

// Email + integration mocks
const sendGuestConfirmation = vi.fn().mockResolvedValue(undefined);
const sendHostNotification = vi.fn().mockResolvedValue(undefined);
vi.mock('@/lib/email/booking-emails', () => ({
  sendGuestConfirmation: (...args: unknown[]) => sendGuestConfirmation(...args),
  sendHostNotification: (...args: unknown[]) => sendHostNotification(...args),
  loadBookingBrand: (..._args: unknown[]) => Promise.resolve(null),
}));

const createCalendarEvent = vi.fn().mockResolvedValue({ meetingLink: null });
vi.mock('@/lib/google-calendar', () => ({
  createCalendarEvent: (...args: unknown[]) => createCalendarEvent(...args),
}));

const createZoomMeeting = vi.fn().mockResolvedValue('https://zoom.us/j/123');
vi.mock('@/lib/zoom', () => ({
  createZoomMeeting: (...args: unknown[]) => createZoomMeeting(...args),
}));

const emitEvent = vi.fn();
vi.mock('@/lib/automation', () => ({
  emitEvent: (...args: unknown[]) => emitEvent(...args),
}));

const pickAssignee = vi.fn().mockResolvedValue(null);
vi.mock('@/lib/booking/assign', () => ({
  pickAssignee: (...args: unknown[]) => pickAssignee(...args),
}));

const checkSlotCapacity = vi.fn().mockResolvedValue({ available: true, remaining: 10 });
vi.mock('@/lib/booking/capacity', () => ({
  checkSlotCapacity: (...args: unknown[]) => checkSlotCapacity(...args),
}));

const isSlotWithinAvailability = vi.fn().mockResolvedValue(true);
vi.mock('@/lib/booking/availability', () => ({
  isSlotWithinAvailability: (...args: unknown[]) => isSlotWithinAvailability(...args),
}));

// Stripe — route does `(await import('stripe')).default`
const paymentIntentsCreate = vi.fn().mockResolvedValue({
  id: 'pi_test_123',
  client_secret: 'pi_test_123_secret_abc',
});
vi.mock('stripe', () => {
  class StripeCtor {
    paymentIntents = { create: paymentIntentsCreate };
  }
  return { default: StripeCtor };
});

// Import the route AFTER all mocks are set up
const { POST } = await import('@/app/api/public/booking/[slug]/book/route');

function makeReq(body: unknown): Request {
  return new Request('http://test/api/public/booking/test-slug/book', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

function makeParams(slug = 'test-slug'): { params: Promise<{ slug: string }> } {
  return { params: Promise.resolve({ slug }) };
}

function basePage(overrides: Row = {}): Row {
  return {
    id: 100,
    clientId: 7,
    slug: 'test-slug',
    title: 'Coffee Chat',
    active: true,
    bookingType: 'individual',
    duration: 30,
    timezone: 'America/New_York',
    price: 0,
    minNoticeMins: 0,
    maxAdvanceDays: 365,
    bufferBefore: 0,
    bufferAfter: 0,
    maxGuests: null,
    enableAddOns: false,
    enableDiscountCodes: false,
    enableGiftCertificates: false,
    allowStaffSelection: false,
    assignmentMode: 'fixed',
    assignedMembers: [],
    checkinEnabled: false,
    googleCalendarSync: false,
    conferenceType: null,
    websiteId: null,
    ...overrides,
  };
}

function futureIso(minutesFromNow = 60): string {
  return new Date(Date.now() + minutesFromNow * 60 * 1000).toISOString();
}

beforeEach(() => {
  selectQueue.length = 0;
  insertReturns.length = 0;
  insertCalls.length = 0;
  updateCalls.length = 0;
  sendGuestConfirmation.mockClear();
  sendHostNotification.mockClear();
  createCalendarEvent.mockReset().mockResolvedValue({ meetingLink: null });
  createZoomMeeting.mockReset().mockResolvedValue('https://zoom.us/j/123');
  emitEvent.mockClear();
  pickAssignee.mockReset().mockResolvedValue(null);
  checkSlotCapacity.mockReset().mockResolvedValue({ available: true, remaining: 10 });
  isSlotWithinAvailability.mockReset().mockResolvedValue(true);
  paymentIntentsCreate.mockReset().mockResolvedValue({
    id: 'pi_test_123',
    client_secret: 'pi_test_123_secret_abc',
  });
});

describe('POST /api/public/booking/[slug]/book — page lookup', () => {
  it('returns 404 when no active page matches the slug', async () => {
    selectQueue.push([]); // page lookup → no rows
    const res = await POST(
      makeReq({ name: 'A', email: 'a@b.com', startTime: futureIso() }),
      makeParams(),
    );
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.message).toMatch(/not found/i);
  });
});

describe('POST — request validation', () => {
  it('rejects missing name (400)', async () => {
    selectQueue.push([basePage()]);
    const res = await POST(
      makeReq({ email: 'a@b.com', startTime: futureIso() }),
      makeParams(),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).message).toMatch(/nombre es obligatorio/i);
  });

  it('rejects whitespace-only name (400)', async () => {
    selectQueue.push([basePage()]);
    const res = await POST(
      makeReq({ name: '   ', email: 'a@b.com', startTime: futureIso() }),
      makeParams(),
    );
    expect(res.status).toBe(400);
  });

  it('rejects missing email (400)', async () => {
    selectQueue.push([basePage()]);
    const res = await POST(
      makeReq({ name: 'Alice', startTime: futureIso() }),
      makeParams(),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).message).toMatch(/correo electrónico es obligatorio/i);
  });

  it('rejects missing startTime (400)', async () => {
    selectQueue.push([basePage()]);
    const res = await POST(
      makeReq({ name: 'Alice', email: 'a@b.com' }),
      makeParams(),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).message).toMatch(/hora de inicio es obligatoria/i);
  });

  it('rejects unparseable startTime (400)', async () => {
    selectQueue.push([basePage()]);
    const res = await POST(
      makeReq({ name: 'Alice', email: 'a@b.com', startTime: 'not-a-date' }),
      makeParams(),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).message).toMatch(/hora de inicio no válida/i);
  });
});

describe('POST — scheduling window validation', () => {
  it('rejects slots inside minNoticeMins window (409)', async () => {
    selectQueue.push([basePage({ minNoticeMins: 120 })]); // 2hr notice
    const res = await POST(
      makeReq({ name: 'Alice', email: 'a@b.com', startTime: futureIso(30) }),
      makeParams(),
    );
    expect(res.status).toBe(409);
    expect((await res.json()).message).toMatch(/ya no está disponible/i);
  });

  it('rejects slots beyond maxAdvanceDays (400)', async () => {
    selectQueue.push([basePage({ maxAdvanceDays: 7 })]);
    const tooFar = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    const res = await POST(
      makeReq({ name: 'Alice', email: 'a@b.com', startTime: tooFar }),
      makeParams(),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).message).toMatch(/demasiado lejos en el futuro/i);
  });
});

describe('POST — 1:1 individual booking (free)', () => {
  it('creates a free booking and emits guest_booked event when no conflicts exist', async () => {
    selectQueue.push([basePage()]);          // page lookup
    selectQueue.push([]);                    // conflict check (none)
    insertReturns.push([{                    // booking insert
      id: 555,
      guestName: 'Alice',
      guestEmail: 'alice@example.com',
      startTime: new Date('2030-01-01T15:00:00Z'),
      endTime: new Date('2030-01-01T15:30:00Z'),
      timezone: 'America/New_York',
      status: 'confirmed',
    }]);

    const res = await POST(
      makeReq({ name: 'Alice', email: 'alice@example.com', startTime: futureIso() }),
      makeParams(),
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(555);
    expect(body.data.paymentStatus).toBe('free');
    expect(emitEvent).toHaveBeenCalledWith(
      'booking.guest_booked',
      7,
      0,
      expect.objectContaining({ bookingId: 555 }),
    );
    expect(sendGuestConfirmation).toHaveBeenCalled();
  });

  it('returns 409 when a conflicting booking is found', async () => {
    selectQueue.push([basePage()]);
    selectQueue.push([{ id: 999 }]); // conflict exists
    const res = await POST(
      makeReq({ name: 'Alice', email: 'a@b.com', startTime: futureIso() }),
      makeParams(),
    );
    expect(res.status).toBe(409);
    expect((await res.json()).message).toMatch(/ya no está disponible/i);
  });

  it('returns 409 when the exclusive-slot unique index rejects a racing insert (23505)', async () => {
    // The availability SELECT passes (the racing request has not committed yet),
    // but the DB partial unique index rejects the second INSERT — the guard that
    // a SELECT-then-INSERT cannot provide. The route must translate 23505 → 409.
    selectQueue.push([basePage()]);
    selectQueue.push([]); // conflict check sees nothing (race window)
    insertReturns.push(Object.assign(new Error('duplicate key value violates unique constraint'), { code: '23505' }));
    const res = await POST(
      makeReq({ name: 'Bob', email: 'bob@example.com', startTime: futureIso() }),
      makeParams(),
    );
    expect(res.status).toBe(409);
    expect((await res.json()).message).toMatch(/ya no está disponible/i);
  });

  it('trims guest name/email/phone and stores them on the booking', async () => {
    selectQueue.push([basePage()]);
    selectQueue.push([]); // no conflicts
    insertReturns.push([{ id: 1, guestName: 'Alice', guestEmail: 'alice@example.com' }]);

    await POST(
      makeReq({
        name: '  Alice  ',
        email: '  alice@example.com ',
        phone: '  555-1234 ',
        startTime: futureIso(),
      }),
      makeParams(),
    );

    const bookingInsert = insertCalls[0];
    expect(bookingInsert.values).toMatchObject({
      guestName: 'Alice',
      guestEmail: 'alice@example.com',
      guestPhone: '555-1234',
    });
  });

  it('generates a checkinCode when checkinEnabled is true', async () => {
    selectQueue.push([basePage({ checkinEnabled: true })]);
    selectQueue.push([]);
    insertReturns.push([{ id: 1 }]);
    const res = await POST(
      makeReq({ name: 'A', email: 'a@b.com', startTime: futureIso() }),
      makeParams(),
    );
    const body = await res.json();
    expect(body.data.checkinCode).toMatch(/^BK-[A-Z2-9]{4}$/);
  });

  it('omits the checkinCode when checkinEnabled is false', async () => {
    selectQueue.push([basePage()]);
    selectQueue.push([]);
    insertReturns.push([{ id: 1 }]);
    const res = await POST(
      makeReq({ name: 'A', email: 'a@b.com', startTime: futureIso() }),
      makeParams(),
    );
    const body = await res.json();
    expect(body.data.checkinCode).toBeNull();
  });
});

describe('POST — legacy maxGuests capacity mode', () => {
  it('rejects when existing bookings already fill maxGuests', async () => {
    selectQueue.push([basePage({ maxGuests: 5 })]);
    selectQueue.push([{ groupSize: 3 }, { groupSize: 2 }]); // total 5 booked
    const res = await POST(
      makeReq({ name: 'A', email: 'a@b.com', startTime: futureIso(), groupSize: 1 }),
      makeParams(),
    );
    expect(res.status).toBe(409);
    expect((await res.json()).message).toMatch(/plazas disponibles/i);
  });

  it('treats null groupSize as 1 when counting against maxGuests', async () => {
    selectQueue.push([basePage({ maxGuests: 3 })]);
    selectQueue.push([{ groupSize: null }, { groupSize: null }, { groupSize: null }]);
    const res = await POST(
      makeReq({ name: 'A', email: 'a@b.com', startTime: futureIso() }),
      makeParams(),
    );
    expect(res.status).toBe(409);
  });

  it('accepts when room is available under maxGuests', async () => {
    selectQueue.push([basePage({ maxGuests: 10 })]);
    selectQueue.push([{ groupSize: 3 }]);
    insertReturns.push([{ id: 22 }]);
    const res = await POST(
      makeReq({ name: 'A', email: 'a@b.com', startTime: futureIso(), groupSize: 2 }),
      makeParams(),
    );
    expect(res.status).toBe(200);
  });
});

describe('POST — group bookings', () => {
  it('rejects when attendees array length does not match seats', async () => {
    selectQueue.push([basePage({ bookingType: 'group' })]);
    const res = await POST(
      makeReq({
        name: 'A',
        email: 'a@b.com',
        startTime: futureIso(),
        seats: 3,
        attendees: [{ name: 'X', email: 'x@b.com' }],
      }),
      makeParams(),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).message).toMatch(/coincidir con las plazas/i);
  });

  it('rejects when an attendee is missing name/email', async () => {
    selectQueue.push([basePage({ bookingType: 'group' })]);
    const res = await POST(
      makeReq({
        name: 'A',
        email: 'a@b.com',
        startTime: futureIso(),
        seats: 2,
        attendees: [
          { name: 'X', email: 'x@b.com' },
          { name: 'Y' }, // missing email
        ],
      }),
      makeParams(),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).message).toMatch(/nombre y correo electrónico/i);
  });

  it('rejects when capacity helper reports the slot is full', async () => {
    selectQueue.push([basePage({ bookingType: 'group' })]);
    checkSlotCapacity.mockResolvedValueOnce({ available: false, remaining: 1 });
    const res = await POST(
      makeReq({
        name: 'A',
        email: 'a@b.com',
        startTime: futureIso(),
        seats: 1,
      }),
      makeParams(),
    );
    expect(res.status).toBe(409);
    expect((await res.json()).message).toMatch(/plazas para esta franja/i);
  });

  it('inserts one attendee row per seat when no explicit attendees passed (legacy widget)', async () => {
    selectQueue.push([basePage({ bookingType: 'group' })]);
    insertReturns.push([{ id: 77, guestName: 'A', guestEmail: 'a@b.com' }]);

    const res = await POST(
      makeReq({
        name: 'A',
        email: 'a@b.com',
        startTime: futureIso(),
        seats: 3,
      }),
      makeParams(),
    );
    expect(res.status).toBe(200);
    // insertCalls[0] is bookings; insertCalls[1] is bookingAttendees
    const attendeeInsert = insertCalls.find(c => Array.isArray(c.values) && c.values.length === 3);
    expect(attendeeInsert).toBeTruthy();
    const rows = attendeeInsert!.values as Array<{ name: string; bookingId: number }>;
    expect(rows[0].name).toBe('A');
    expect(rows[1].name).toBe('A (+1)');
    expect(rows[2].name).toBe('A (+2)');
    expect(rows.every(r => r.bookingId === 77)).toBe(true);
  });

  it('persists each attendee row when an explicit attendees[] is provided', async () => {
    selectQueue.push([basePage({ bookingType: 'group' })]);
    insertReturns.push([{ id: 88 }]);

    await POST(
      makeReq({
        name: 'A',
        email: 'a@b.com',
        startTime: futureIso(),
        seats: 2,
        attendees: [
          { name: 'Bob', email: 'bob@example.com', phone: '555-0001', notes: 'VIP' },
          { name: 'Cara', email: 'cara@example.com' },
        ],
      }),
      makeParams(),
    );
    const attendeeInsert = insertCalls.find(c => Array.isArray(c.values) && c.values.length === 2);
    expect(attendeeInsert).toBeTruthy();
    const rows = attendeeInsert!.values as Array<{ name: string; phone: string | null; notes: string | null }>;
    expect(rows[0]).toMatchObject({ name: 'Bob', phone: '555-0001', notes: 'VIP' });
    expect(rows[1].name).toBe('Cara');
    expect(rows[1].phone).toBeNull();
  });
});

describe('POST — add-ons', () => {
  it('skips add-on resolution when enableAddOns is false', async () => {
    selectQueue.push([basePage()]);
    selectQueue.push([]);
    insertReturns.push([{ id: 1 }]);
    await POST(
      makeReq({
        name: 'A',
        email: 'a@b.com',
        startTime: futureIso(),
        addOns: [{ addOnId: 1, quantity: 1 }],
      }),
      makeParams(),
    );
    const bookingInsert = insertCalls[0];
    expect((bookingInsert.values as { subtotal: number }).subtotal).toBe(0);
  });

  // Payments were removed (PAYMENTS_DISABLED) — a booking page that carries a
  // non-zero price would require a charge, so it is rejected outright with 403
  // before any add-on write. (The add-on *lookup* still runs so the route knows
  // the total, but nothing is persisted.) These assertions capture that.
  it('rejects a paid booking even with add-ons (total stays > 0)', async () => {
    selectQueue.push([basePage({ enableAddOns: true, price: 5000 })]);
    selectQueue.push([]); // conflict check
    selectQueue.push([{ id: 11, name: 'Workbook', price: 1500, maxQuantity: 5, active: true, source: 'manual' }]);

    const res = await POST(
      makeReq({
        name: 'A',
        email: 'a@b.com',
        startTime: futureIso(),
        addOns: [{ addOnId: 11, quantity: 2 }],
      }),
      makeParams(),
    );
    expect(res.status).toBe(403);
    // No booking, attendee or selected-add-on rows are written.
    expect(insertCalls.length).toBe(0);
  });

  it('rejects a paid booking regardless of add-on quantity clamping', async () => {
    selectQueue.push([basePage({ enableAddOns: true })]);
    selectQueue.push([]);
    selectQueue.push([{ id: 11, name: 'X', price: 100, maxQuantity: 3, active: true, source: 'manual' }]);

    const res = await POST(
      makeReq({
        name: 'A',
        email: 'a@b.com',
        startTime: futureIso(),
        addOns: [{ addOnId: 11, quantity: 999 }],
      }),
      makeParams(),
    );
    expect(res.status).toBe(403);
    expect(insertCalls.length).toBe(0);
  });
});

describe('POST — discount codes', () => {
  it('rejects a paid booking even with a discount that leaves a remainder', async () => {
    selectQueue.push([basePage({ price: 10000, enableDiscountCodes: true, websiteId: 50 })]);
    selectQueue.push([]); // conflict
    selectQueue.push([{
      code: 'SAVE10',
      discountType: 'percent',
      amount: 1000, // 10.00%
      active: true,
      startsAt: null,
      expiresAt: null,
      maxUses: null,
      usedCount: 0,
      minOrderAmount: null,
    }]);

    const res = await POST(
      makeReq({ name: 'A', email: 'a@b.com', startTime: futureIso(), discountCode: 'save10' }),
      makeParams(),
    );
    // 10% of 10000 = 9000 remaining → paid → blocked before any write.
    expect(res.status).toBe(403);
    expect(insertCalls.length).toBe(0);
  });

  it('applies a fixed_amount discount and caps it at subtotal', async () => {
    selectQueue.push([basePage({ price: 500, enableDiscountCodes: true, websiteId: 50 })]);
    selectQueue.push([]);
    selectQueue.push([{
      code: 'FLAT',
      discountType: 'fixed_amount',
      amount: 9999,
      active: true,
      startsAt: null,
      expiresAt: null,
      maxUses: null,
      usedCount: 0,
      minOrderAmount: null,
    }]);
    insertReturns.push([{ id: 1 }]);

    await POST(
      makeReq({ name: 'A', email: 'a@b.com', startTime: futureIso(), discountCode: 'flat' }),
      makeParams(),
    );
    const v = insertCalls[0].values as { subtotal: number; discountTotal: number; total: number };
    expect(v.discountTotal).toBe(500);
    expect(v.total).toBe(0);
  });

  it('rejects a paid booking when no valid discount zeros the total', async () => {
    selectQueue.push([basePage({ price: 1000, enableDiscountCodes: true, websiteId: 50 })]);
    selectQueue.push([]); // conflict
    selectQueue.push([{
      code: 'EXPIRED', discountType: 'percent', amount: 5000, active: true,
      startsAt: null,
      expiresAt: new Date(Date.now() - 24 * 60 * 60 * 1000), // yesterday → invalid
      maxUses: null, usedCount: 0, minOrderAmount: null,
    }]);

    const res = await POST(
      makeReq({ name: 'A', email: 'a@b.com', startTime: futureIso(), discountCode: 'expired' }),
      makeParams(),
    );
    // 1000 remains → paid → blocked.
    expect(res.status).toBe(403);
    expect(insertCalls.length).toBe(0);
  });
});

describe('POST — gift certificates', () => {
  it('rejects a paid booking when a gift cert only covers part of the total', async () => {
    selectQueue.push([basePage({ price: 10000, enableGiftCertificates: true })]);
    selectQueue.push([]); // conflict
    selectQueue.push([{
      id: 33, code: 'GIFT100', remainingAmount: 3000, status: 'active', clientId: 7,
    }]);

    const res = await POST(
      makeReq({
        name: 'A',
        email: 'a@b.com',
        startTime: futureIso(),
        giftCertificateCode: 'gift100',
      }),
      makeParams(),
    );
    // 10000 - 3000 = 7000 remains → paid → blocked, no certificate redemption.
    expect(res.status).toBe(403);
    expect(insertCalls.length).toBe(0);
    expect(updateCalls.length).toBe(0);
  });

  it('marks a fully-drained gift cert as fully_redeemed', async () => {
    selectQueue.push([basePage({ price: 3000, enableGiftCertificates: true })]);
    selectQueue.push([]);
    selectQueue.push([{ id: 33, code: 'G', remainingAmount: 3000, status: 'active', clientId: 7 }]);
    insertReturns.push([{ id: 1 }]);
    selectQueue.push([{ id: 33, remainingAmount: 3000 }]);

    await POST(
      makeReq({ name: 'A', email: 'a@b.com', startTime: futureIso(), giftCertificateCode: 'G' }),
      makeParams(),
    );
    const giftUpdate = updateCalls.find(u =>
      typeof u.values === 'object' && u.values !== null
      && (u.values as { status?: string }).status === 'fully_redeemed',
    );
    expect(giftUpdate).toBeTruthy();
  });

  it('rejects a paid booking when a gift cert adds no value (remainingAmount 0)', async () => {
    selectQueue.push([basePage({ price: 1000, enableGiftCertificates: true })]);
    selectQueue.push([]);
    selectQueue.push([{ id: 33, code: 'G', remainingAmount: 0, status: 'active', clientId: 7 }]);

    const res = await POST(
      makeReq({ name: 'A', email: 'a@b.com', startTime: futureIso(), giftCertificateCode: 'G' }),
      makeParams(),
    );
    // Nothing zeroes the 1000 price → paid → blocked.
    expect(res.status).toBe(403);
    expect(insertCalls.length).toBe(0);
  });
});

describe('POST — paid booking flow (payments disabled)', () => {
  // Billing was removed (PAYMENTS_DISABLED=true in lib/billing/disabled.ts):
  // any booking whose total would be > 0 is rejected with a clean 403 BEFORE
  // any write, so no Strip intent, no booking row, and no discount/gift-cert
  // usage is ever recorded. Free bookings (total 0) are unaffected.
  it('rejects a paid booking (total > 0) with 403 "Payments are disabled."', async () => {
    selectQueue.push([basePage({ price: 5000 })]);
    selectQueue.push([]); // conflict
    selectQueue.push([{ id: 1 }]); // booking insert would never be reached

    const res = await POST(
      makeReq({ name: 'A', email: 'a@b.com', startTime: futureIso() }),
      makeParams(),
    );
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.message).toBe('Payments are disabled.');
    // No booking row (nor any other write) happens when payment is blocked.
    expect(insertCalls.length).toBe(0);
    expect(paymentIntentsCreate).not.toHaveBeenCalled();
  });

  it('does not create a Stripe intent or increment discount usage for paid bookings', async () => {
    selectQueue.push([basePage({ price: 10000, enableDiscountCodes: true, websiteId: 50 })]);
    selectQueue.push([]);
    selectQueue.push([{
      code: 'PROMO', discountType: 'percent', amount: 1000, active: true,
      startsAt: null, expiresAt: null, maxUses: null, usedCount: 2, minOrderAmount: null,
    }]);

    await POST(
      makeReq({ name: 'A', email: 'a@b.com', startTime: futureIso(), discountCode: 'promo' }),
      makeParams(),
    );
    expect(paymentIntentsCreate).not.toHaveBeenCalled();
    expect(insertCalls.length).toBe(0);
    expect(updateCalls.some(u =>
      typeof u.values === 'object' && u.values !== null
      && 'usedCount' in (u.values as object),
    )).toBe(false);
  });

  it('still creates a free booking when a discounted total reaches 0', async () => {
    selectQueue.push([basePage({ price: 10000, enableDiscountCodes: true, websiteId: 50 })]);
    selectQueue.push([]);
    // 100% off -> total 0, booking is free and must still be created.
    selectQueue.push([{
      code: 'FULL', discountType: 'percent', amount: 10000, active: true,
      startsAt: null, expiresAt: null, maxUses: null, usedCount: 2, minOrderAmount: null,
    }]);
    insertReturns.push([{ id: 9 }]);

    await POST(
      makeReq({ name: 'A', email: 'a@b.com', startTime: futureIso(), discountCode: 'full' }),
      makeParams(),
    );
    // insertCalls[0] is the bookings row (comment at line 533 confirms order).
    const booking = insertCalls[0];
    expect(booking).toBeTruthy();
    expect((booking.values as { total: number }).total).toBe(0);
    expect(paymentIntentsCreate).not.toHaveBeenCalled();
  });
});

describe('POST — staff / assignee resolution', () => {
  it('respects customer-picked staffId when allowStaffSelection is enabled', async () => {
    selectQueue.push([basePage({ allowStaffSelection: true })]);
    selectQueue.push([]); // conflict
    insertReturns.push([{ id: 1 }]);
    await POST(
      makeReq({ name: 'A', email: 'a@b.com', startTime: futureIso(), staffId: '42' }),
      makeParams(),
    );
    expect((insertCalls[0].values as { assignedTo: number | null }).assignedTo).toBe(42);
  });

  it('ignores customer-picked staffId when allowStaffSelection is false', async () => {
    selectQueue.push([basePage({ allowStaffSelection: false, assignedMembers: [] })]);
    selectQueue.push([]);
    insertReturns.push([{ id: 1 }]);
    await POST(
      makeReq({ name: 'A', email: 'a@b.com', startTime: futureIso(), staffId: '42' }),
      makeParams(),
    );
    expect((insertCalls[0].values as { assignedTo: number | null }).assignedTo).toBeNull();
  });

  it('calls pickAssignee when assignmentMode is round_robin', async () => {
    selectQueue.push([basePage({ assignmentMode: 'round_robin' })]);
    selectQueue.push([]);
    pickAssignee.mockResolvedValueOnce(17);
    insertReturns.push([{ id: 1 }]);
    await POST(
      makeReq({ name: 'A', email: 'a@b.com', startTime: futureIso() }),
      makeParams(),
    );
    expect(pickAssignee).toHaveBeenCalled();
    const v = insertCalls[0].values as { assignedTo: number | null; assignedUserId: number | null };
    expect(v.assignedTo).toBe(17);
    expect(v.assignedUserId).toBe(17);
  });

  it('auto-assigns the single member when assignedMembers has exactly one and mode=fixed', async () => {
    selectQueue.push([basePage({ assignedMembers: [99] })]);
    selectQueue.push([]);
    insertReturns.push([{ id: 1 }]);
    await POST(
      makeReq({ name: 'A', email: 'a@b.com', startTime: futureIso() }),
      makeParams(),
    );
    expect((insertCalls[0].values as { assignedTo: number | null }).assignedTo).toBe(99);
  });

  it('picks the assignedMember with the fewest upcoming bookings (legacy load-balancer)', async () => {
    selectQueue.push([basePage({ assignedMembers: [1, 2, 3] })]);
    selectQueue.push([]); // conflict
    // upcoming counts grouped by assignedTo
    selectQueue.push([
      { assignedTo: 1, count: 5 },
      { assignedTo: 2, count: 1 },
      { assignedTo: 3, count: 3 },
    ]);
    insertReturns.push([{ id: 1 }]);
    await POST(
      makeReq({ name: 'A', email: 'a@b.com', startTime: futureIso() }),
      makeParams(),
    );
    expect((insertCalls[0].values as { assignedTo: number | null }).assignedTo).toBe(2);
  });
});

describe('POST — conferencing integrations on free bookings', () => {
  it('calls createCalendarEvent when googleCalendarSync is enabled', async () => {
    selectQueue.push([basePage({ googleCalendarSync: true })]);
    selectQueue.push([]);
    insertReturns.push([{ id: 1, guestName: 'A', guestEmail: 'a@b.com' }]);
    createCalendarEvent.mockResolvedValueOnce({ meetingLink: 'https://meet.example/abc' });

    const res = await POST(
      makeReq({ name: 'A', email: 'a@b.com', startTime: futureIso() }),
      makeParams(),
    );
    expect(createCalendarEvent).toHaveBeenCalled();
    expect((await res.json()).data.meetingLink).toBe('https://meet.example/abc');
  });

  it('asks the calendar event to add Google Meet when conferenceType=google_meet', async () => {
    selectQueue.push([basePage({ conferenceType: 'google_meet' })]);
    selectQueue.push([]);
    insertReturns.push([{ id: 1, guestName: 'A', guestEmail: 'a@b.com' }]);
    await POST(
      makeReq({ name: 'A', email: 'a@b.com', startTime: futureIso() }),
      makeParams(),
    );
    expect(createCalendarEvent).toHaveBeenCalledWith(
      expect.objectContaining({ addGoogleMeet: true }),
    );
  });

  it('creates a Zoom meeting when conferenceType=zoom', async () => {
    selectQueue.push([basePage({ conferenceType: 'zoom' })]);
    selectQueue.push([]);
    insertReturns.push([{ id: 1, guestName: 'A', guestEmail: 'a@b.com' }]);
    createZoomMeeting.mockResolvedValueOnce('https://zoom.us/j/777');
    const res = await POST(
      makeReq({ name: 'A', email: 'a@b.com', startTime: futureIso() }),
      makeParams(),
    );
    expect(createZoomMeeting).toHaveBeenCalled();
    expect((await res.json()).data.meetingLink).toBe('https://zoom.us/j/777');
  });
});

describe('POST — host notification', () => {
  it('does not crash when the host user lookup returns nothing', async () => {
    selectQueue.push([basePage()]);
    selectQueue.push([]); // conflict
    insertReturns.push([{ id: 1, guestName: 'A', guestEmail: 'a@b.com' }]);
    // The fire-and-forget IIFE issues 2 lookups (clients then users); both empty here.
    selectQueue.push([]); // clients lookup
    selectQueue.push([]); // users lookup (should not be reached)

    const res = await POST(
      makeReq({ name: 'A', email: 'a@b.com', startTime: futureIso() }),
      makeParams(),
    );
    expect(res.status).toBe(200);
  });
});
