// @vitest-environment node
/**
 * Unit tests for lib/ai/portal-tools/team.ts.
 *
 * Focuses on update_profile (must target the acting user, not the owner) and
 * invite_team_member (role validation + invite-email parity with the canonical
 * app/api/portal/team route). Same in-memory mock pattern as
 * ai-portal-tools-crm.test.ts. The invite email is mocked; token hashing uses
 * the real pure helper.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// In-memory state
// ---------------------------------------------------------------------------

interface MockState {
  users: Array<Record<string, unknown>>;
  clients: Array<Record<string, unknown>>;
  clientMembers: Array<Record<string, unknown>>;
  suggestedProjects: Array<Record<string, unknown>>;
  suggestedProjectRequests: Array<Record<string, unknown>>;
  nextId: Record<string, number>;
}

const state: MockState = {
  users: [],
  clients: [],
  clientMembers: [],
  suggestedProjects: [],
  suggestedProjectRequests: [],
  nextId: {
    users: 1,
    clients: 1,
    clientMembers: 1,
    suggestedProjects: 1,
    suggestedProjectRequests: 1,
  },
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
  const tables = [
    'users', 'clients', 'clientMembers',
    'suggestedProjects', 'suggestedProjectRequests',
  ];
  const base: Record<string, ReturnType<typeof wrap>> = {};
  for (const t of tables) base[t] = wrap(t);
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
  or: (...args: unknown[]) => ({ op: 'or', args: args.filter(Boolean) }),
  isNull: (a: unknown) => ({ op: 'isNull', a }),
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
// Invite email mock
// ---------------------------------------------------------------------------

const mockSendInviteEmail = vi.fn();
vi.mock('@/lib/email/invite-email', () => ({ sendInviteEmail: mockSendInviteEmail }));

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
  };
  switch (f.op) {
    case 'eq':
      return readField(row, f.a) === f.b;
    case 'and':
      return (f.args ?? []).every((arg) => evalPredicate(arg, row));
    case 'or':
      return (f.args ?? []).some((arg) => evalPredicate(arg, row));
    case 'isNull':
      return readField(row, f.a) == null;
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
    const joinedTables: string[] = [];

    const chain: Record<string, unknown> = {
      from(table: { __table: string }) {
        activeTable = table.__table;
        return chain;
      },
      leftJoin(table: { __table: string }) {
        joinedTables.push(table.__table);
        return chain;
      },
      innerJoin(table: { __table: string }) {
        joinedTables.push(table.__table);
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
      const enriched = joinedTables.reduce<Array<Record<string, unknown>>>((acc, jt) => {
        return acc.map((r) => ({ ...r, ...(tableArray(jt)[0] ?? {}) }));
      }, rows);
      let out = enriched.map((r) => projectRow(r, projection));
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

  function buildUpdate(table: { __table: string }) {
    let setPayload: Record<string, unknown> = {};
    const chain: Record<string, unknown> = {
      set(payload: Record<string, unknown>) {
        setPayload = payload;
        return chain;
      },
      where(f: unknown) {
        const arr = tableArray(table.__table);
        for (const row of arr) {
          if (evalPredicate(f, row)) Object.assign(row, setPayload);
        }
        return Promise.resolve(undefined);
      },
    };
    return chain;
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
      update(table: { __table: string }) {
        return buildUpdate(table);
      },
    },
  };
});

// ---------------------------------------------------------------------------
// beforeEach — wipe state
// ---------------------------------------------------------------------------

beforeEach(() => {
  for (const key of Object.keys(state) as Array<keyof MockState>) {
    if (key === 'nextId') continue;
    (state[key] as Array<Record<string, unknown>>).length = 0;
  }
  state.nextId = {
    users: 1,
    clients: 1,
    clientMembers: 1,
    suggestedProjects: 1,
    suggestedProjectRequests: 1,
  };
  mockSendInviteEmail.mockReset();
});

async function importModule() {
  return await import('@/lib/ai/portal-tools/team');
}

function seedUser(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  const row: Record<string, unknown> = {
    id: state.nextId.users++,
    name: 'User',
    email: 'user@example.com',
    password: 'hash',
    role: 'client',
    ...overrides,
  };
  state.users.push(row);
  return row;
}

// ---------------------------------------------------------------------------
// update_profile
// ---------------------------------------------------------------------------

describe('update_profile', () => {
  it('updates the acting user, not the client owner', async () => {
    state.clients.push({ id: 10, userId: 1, company: 'Acme' });
    seedUser({ id: 1, name: 'Owner', email: 'owner@example.com' });
    seedUser({ id: 2, name: 'Actor', email: 'actor@example.com' });

    const { teamHandlers } = await importModule();
    const res = (await teamHandlers.update_profile({ name: 'Renamed' }, 10, 2)) as Record<
      string,
      unknown
    >;

    expect(res.success).toBe(true);
    expect(state.users.find((u) => u.id === 1)?.name).toBe('Owner');
    expect(state.users.find((u) => u.id === 2)?.name).toBe('Renamed');
  });

  it('updates client fields scoped to clientId only', async () => {
    state.clients.push({ id: 10, userId: 1, company: 'Old' });
    state.clients.push({ id: 99, userId: 5, company: 'Foreign' });
    seedUser({ id: 2, name: 'Actor' });

    const { teamHandlers } = await importModule();
    await teamHandlers.update_profile({ company: 'New', phone: '123' }, 10, 2);

    const mine = state.clients.find((c) => c.id === 10)!;
    const foreign = state.clients.find((c) => c.id === 99)!;
    expect(mine.company).toBe('New');
    expect(mine.phone).toBe('123');
    expect(foreign.company).toBe('Foreign');
  });
});

// ---------------------------------------------------------------------------
// invite_team_member
// ---------------------------------------------------------------------------

describe('invite_team_member', () => {
  it('returns an error when name or email is missing', async () => {
    const { teamHandlers } = await importModule();
    const res = await teamHandlers.invite_team_member({ role: 'admin' }, 10, 1);
    expect(res).toEqual({ error: 'Name and email are required' });
  });

  it('falls back to member for an invalid role', async () => {
    seedUser({ id: 1, name: 'Owner', email: 'owner@example.com' });
    seedUser({ id: 2, name: 'Actor', email: 'actor@example.com' });
    const { teamHandlers } = await importModule();

    const res = (await teamHandlers.invite_team_member(
      { name: 'Newbie', email: 'newbie@example.com', role: 'superadmin' },
      10,
      2,
    )) as Record<string, unknown>;

    expect(res.success).toBe(true);
    expect(state.clientMembers[0].role).toBe('member');
    expect(mockSendInviteEmail).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'member' }),
    );
  });

  it('preserves a valid admin role', async () => {
    seedUser({ id: 1, name: 'Owner', email: 'owner@example.com' });
    seedUser({ id: 2, name: 'Actor', email: 'actor@example.com' });
    const { teamHandlers } = await importModule();

    await teamHandlers.invite_team_member(
      { name: 'Admin', email: 'admin@example.com', role: 'admin' },
      10,
      2,
    );

    expect(state.clientMembers[0].role).toBe('admin');
  });

  it('sends the invite email with the canonical args and a token', async () => {
    seedUser({ id: 1, name: 'Owner', email: 'owner@example.com' });
    seedUser({ id: 2, name: 'Actor', email: 'actor@example.com' });
    state.clients.push({ id: 10, userId: 1, company: 'Acme' });
    const { teamHandlers } = await importModule();

    await teamHandlers.invite_team_member(
      { name: 'Recruit', email: 'recruit@example.com', role: 'viewer' },
      10,
      2,
    );

    expect(mockSendInviteEmail).toHaveBeenCalledTimes(1);
    expect(mockSendInviteEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientEmail: 'recruit@example.com',
        recipientName: 'Recruit',
        companyName: 'Acme',
        inviterName: 'Actor',
        role: 'viewer',
        inviteToken: expect.any(String),
      }),
    );
  });

  it('creates a new user with an invite token when the email is unknown', async () => {
    seedUser({ id: 2, name: 'Actor', email: 'actor@example.com' });
    state.clients.push({ id: 10, userId: 2, company: 'Acme' });
    const { teamHandlers } = await importModule();

    await teamHandlers.invite_team_member(
      { name: 'Guest', email: 'guest@example.com', role: 'member' },
      10,
      2,
    );

    const created = state.users.find((u) => u.email === 'guest@example.com');
    expect(created).toBeDefined();
    expect(typeof created?.inviteToken).toBe('string');
    expect(created?.inviteExpiresAt).toBeInstanceOf(Date);
    expect(state.clientMembers[0].userId).toBe(created?.id);
  });

  it('returns an error when the user is already a member', async () => {
    seedUser({ id: 1, name: 'Owner', email: 'owner@example.com' });
    seedUser({ id: 2, name: 'Actor', email: 'actor@example.com' });
    state.clientMembers.push({ id: 1, clientId: 10, userId: 1 });
    const { teamHandlers } = await importModule();

    const res = await teamHandlers.invite_team_member(
      { name: 'Owner', email: 'owner@example.com', role: 'member' },
      10,
      2,
    );

    expect(res).toEqual({ error: 'owner@example.com is already a team member.' });
    expect(state.clientMembers).toHaveLength(1);
  });
});
