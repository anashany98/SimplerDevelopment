// @vitest-environment node
/**
 * Unit tests for lib/ai/portal-tools/support.ts.
 *
 * Focuses on create_support_ticket parity with the canonical REST route:
 * SLA deadlines are stamped from priority and the `ticket.created` event is
 * emitted. Uses the same in-memory mock pattern as ai-portal-tools-crm.test.ts.
 * `computeSlaDeadlines` is exercised for real (pure function); only the DB,
 * schema, drizzle, and event bus are mocked.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// In-memory state
// ---------------------------------------------------------------------------

interface MockState {
  supportTickets: Array<Record<string, unknown>>;
  ticketMessages: Array<Record<string, unknown>>;
  nextId: Record<string, number>;
}

const state: MockState = {
  supportTickets: [],
  ticketMessages: [],
  nextId: { supportTickets: 1, ticketMessages: 1 },
};

// ---------------------------------------------------------------------------
// Schema mock — thin proxy returning column references
// ---------------------------------------------------------------------------

vi.mock('@/lib/db/schema', () => {
  const wrap = (tableName: string) =>
    new Proxy(
      { __table: tableName, __isTable: true },
      {
        get(_t, prop: string) {
          if (prop === '__table') return tableName;
          if (prop === '__isTable') return true;
          if (prop === '__col') return undefined;
          return { __col: prop, __table: tableName };
        },
      },
    );
  const base: Record<string, ReturnType<typeof wrap>> = {
    supportTickets: wrap('supportTickets'),
    ticketMessages: wrap('ticketMessages'),
  };
  return new Proxy(base, {
    has: (t, p) =>
      p in t ||
      !(
        p === 'then' ||
        p === '__esModule' ||
        p === 'default' ||
        typeof p !== 'string'
      ),
    get: (t, p) =>
      p in t
        ? t[p as string]
        : p === 'then' ||
            p === '__esModule' ||
            p === 'default' ||
            typeof p !== 'string'
          ? undefined
          : wrap(p as string),
  });
});

// ---------------------------------------------------------------------------
// drizzle-orm mock
// ---------------------------------------------------------------------------

vi.mock('drizzle-orm', () => ({
  eq: (a: unknown, b: unknown) => ({ op: 'eq', a, b }),
  and: (...args: unknown[]) => ({ op: 'and', args: args.filter(Boolean) }),
  desc: (a: unknown) => ({ op: 'desc', a }),
  asc: (a: unknown) => ({ op: 'asc', a }),
  sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({
    op: 'sql',
    strings: Array.from(strings),
    values,
  }),
  inArray: (a: unknown, list: unknown[]) => ({ op: 'inArray', a, list }),
}));

// ---------------------------------------------------------------------------
// Event bus mock
// ---------------------------------------------------------------------------

const mockEmitEvent = vi.fn();
vi.mock('@/lib/automation/event-bus', () => ({ emitEvent: mockEmitEvent }));

// ---------------------------------------------------------------------------
// Predicate engine
// ---------------------------------------------------------------------------

function getCol(ref: unknown): { col: string; table: string } | null {
  const r = ref as { __col?: string; __table?: string } | undefined;
  if (!r?.__col || !r.__table) return null;
  return { col: r.__col, table: r.__table };
}

function readField(row: Record<string, unknown>, ref: unknown): unknown {
  const c = getCol(ref);
  if (!c) return undefined;
  return row[c.col];
}

function evalPredicate(filter: unknown, row: Record<string, unknown>): boolean {
  if (!filter) return true;
  if (typeof filter !== 'object') return true;
  const f = filter as {
    op?: string;
    a?: unknown;
    b?: unknown;
    args?: unknown[];
    list?: unknown[];
  };
  switch (f.op) {
    case 'eq':
      return readField(row, f.a) === f.b;
    case 'and':
      return (f.args ?? []).every((arg) => evalPredicate(arg, row));
    case 'inArray':
      return (f.list ?? []).includes(readField(row, f.a));
    default:
      return true;
  }
}

function projectRow(
  row: Record<string, unknown>,
  projection: Record<string, unknown> | null,
): Record<string, unknown> {
  if (!projection) return { ...row };
  const out: Record<string, unknown> = {};
  for (const [alias, ref] of Object.entries(projection)) {
    const c = getCol(ref);
    out[alias] = c ? row[c.col] : undefined;
  }
  return out;
}

function tableArray(name: string): Array<Record<string, unknown>> {
  return (state as unknown as Record<string, Array<Record<string, unknown>>>)[name] ?? [];
}

// ---------------------------------------------------------------------------
// DB mock
// ---------------------------------------------------------------------------

vi.mock('@/lib/db', () => {
  function buildSelect(projection: Record<string, unknown> | null) {
    let activeTable: string | null = null;
    let filter: unknown = null;
    let limitVal: number | null = null;

    const chain: Record<string, unknown> = {
      from(table: { __table: string }) {
        activeTable = table.__table;
        return chain;
      },
      leftJoin() {
        return chain;
      },
      innerJoin() {
        return chain;
      },
      where(arg: unknown) {
        filter = arg;
        return chain;
      },
      orderBy() {
        return chain;
      },
      limit(n: number) {
        limitVal = n;
        return runQuery();
      },
      then(
        onFulfilled: (v: unknown) => unknown,
        onRejected?: (e: unknown) => unknown,
      ) {
        return runQuery().then(onFulfilled, onRejected);
      },
    };

    function runQuery(): Promise<Array<Record<string, unknown>>> {
      if (!activeTable) return Promise.resolve([]);
      const rows = tableArray(activeTable).filter((r) => evalPredicate(filter, r));
      let out = rows.map((r) => projectRow(r, projection));
      if (limitVal !== null) out = out.slice(0, limitVal);
      return Promise.resolve(out);
    }

    return chain;
  }

  function buildInsert(table: { __table: string }) {
    return {
      values(payload: Record<string, unknown> | Array<Record<string, unknown>>) {
        const rows = Array.isArray(payload) ? payload : [payload];
        const inserted: Array<Record<string, unknown>> = [];
        for (const row of rows) {
          const arr = tableArray(table.__table);
          const idx = (state.nextId as Record<string, number>)[table.__table] ?? 1;
          const newRow = { id: idx, ...row };
          (state.nextId as Record<string, number>)[table.__table] = idx + 1;
          arr.push(newRow);
          inserted.push(newRow);
        }
        return {
          returning() {
            return Promise.resolve(inserted);
          },
          then(
            onFulfilled: (v: unknown) => unknown,
            onRejected?: (e: unknown) => unknown,
          ) {
            return Promise.resolve(inserted).then(onFulfilled, onRejected);
          },
        };
      },
    };
  }

  return {
    db: {
      select(projection?: Record<string, unknown>) {
        return {
          from(table: { __table: string }) {
            return buildSelect(projection ?? null).from(table);
          },
        };
      },
      insert(table: { __table: string }) {
        return buildInsert(table);
      },
    },
  };
});

// ---------------------------------------------------------------------------
// beforeEach — wipe state
// ---------------------------------------------------------------------------

beforeEach(() => {
  state.supportTickets.length = 0;
  state.ticketMessages.length = 0;
  state.nextId = { supportTickets: 1, ticketMessages: 1 };
  mockEmitEvent.mockReset();
});

async function importModule() {
  return await import('@/lib/ai/portal-tools/support');
}

const HOUR = 3_600_000;

// ---------------------------------------------------------------------------
// create_support_ticket
// ---------------------------------------------------------------------------

describe('create_support_ticket', () => {
  it('creates a ticket with a message and the expected return shape', async () => {
    const { supportHandlers } = await importModule();
    const res = (await supportHandlers.create_support_ticket(
      { subject: 'Cannot log in', body: 'It fails', priority: 'medium', category: 'technical' },
      10,
      3,
    )) as Record<string, unknown>;

    expect(res.success).toBe(true);
    expect(typeof res.ticketId).toBe('number');
    expect(res.ticketNumber).toBe(1);
    expect(state.supportTickets).toHaveLength(1);
    expect(state.supportTickets[0]).toMatchObject({
      clientId: 10,
      subject: 'Cannot log in',
      priority: 'medium',
      category: 'technical',
      status: 'open',
      createdBy: 3,
    });
    expect(state.ticketMessages).toHaveLength(1);
    expect(state.ticketMessages[0]).toMatchObject({
      ticketId: res.ticketId,
      authorId: 3,
      body: 'It fails',
      isInternal: false,
    });
  });

  it('stamps SLA deadlines from the priority (urgent = 2h / 8h)', async () => {
    const before = Date.now();
    const { supportHandlers } = await importModule();
    await supportHandlers.create_support_ticket(
      { subject: 'Down', body: 'All down', priority: 'urgent', category: 'technical' },
      10,
      3,
    );
    const after = Date.now();
    const row = state.supportTickets[0];

    expect(row.firstResponseDueAt).toBeInstanceOf(Date);
    expect(row.resolutionDueAt).toBeInstanceOf(Date);
    expect((row.firstResponseDueAt as Date).getTime()).toBeGreaterThanOrEqual(before + 2 * HOUR);
    expect((row.firstResponseDueAt as Date).getTime()).toBeLessThanOrEqual(after + 2 * HOUR);
    expect((row.resolutionDueAt as Date).getTime()).toBeGreaterThanOrEqual(before + 8 * HOUR);
    expect((row.resolutionDueAt as Date).getTime()).toBeLessThanOrEqual(after + 8 * HOUR);
  });

  it('uses the low-priority SLA window (24h / 168h)', async () => {
    const before = Date.now();
    const { supportHandlers } = await importModule();
    await supportHandlers.create_support_ticket(
      { subject: 'Minor', body: 'Nit', priority: 'low', category: 'general' },
      10,
      1,
    );
    const after = Date.now();
    const row = state.supportTickets[0];

    expect((row.firstResponseDueAt as Date).getTime()).toBeGreaterThanOrEqual(before + 24 * HOUR);
    expect((row.firstResponseDueAt as Date).getTime()).toBeLessThanOrEqual(after + 24 * HOUR);
    expect((row.resolutionDueAt as Date).getTime()).toBeGreaterThanOrEqual(before + 168 * HOUR);
    expect((row.resolutionDueAt as Date).getTime()).toBeLessThanOrEqual(after + 168 * HOUR);
  });

  it('emits ticket.created with the canonical payload', async () => {
    const { supportHandlers } = await importModule();
    await supportHandlers.create_support_ticket(
      { subject: 'Billing question', body: 'How?', priority: 'high', category: 'billing' },
      10,
      3,
    );
    const row = state.supportTickets[0];
    expect(mockEmitEvent).toHaveBeenCalledWith(
      'ticket.created',
      10,
      3,
      expect.objectContaining({
        id: row.id,
        number: row.number,
        subject: 'Billing question',
        category: 'billing',
        priority: 'high',
        status: 'open',
      }),
    );
  });

  it('allocates the next ticket number per client', async () => {
    state.supportTickets.push({ id: 1, clientId: 10, number: 41 });
    const { supportHandlers } = await importModule();
    const res = (await supportHandlers.create_support_ticket(
      { subject: 'Next', body: 'Body', priority: 'medium', category: 'general' },
      10,
      1,
    )) as Record<string, unknown>;
    expect(res.ticketNumber).toBe(42);
  });
});
