// @vitest-environment node
/**
 * Unit tests for the process-workflow-schedules cron.
 *
 * Strategy: back `@/lib/db` with an in-memory store that simulates the
 * CAS-claim semantics (update applies only when the `last_fired_at < prev`
 * predicate holds), mock `enqueueWorkflowRunsForTrigger`, and use the REAL
 * `shouldFireSchedule` / `previousFireTime` so the firing decision is the
 * production one. Tests assert claim + enqueue behavior per scenario.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Hoisted mocks ─────────────────────────────────────────────────────────────

const mockEnqueue = vi.hoisted(() => vi.fn());

vi.mock('@/lib/workflows/trigger', () => ({
  enqueueWorkflowRunsForTrigger: mockEnqueue,
}));

// withCronHealth is a pass-through wrapper in tests.
vi.mock('@/lib/cron-health', () => ({
  withCronHealth: (_opts: unknown, fn: (req: Request) => Promise<Response>) => fn,
}));

// Always authorise cron requests.
vi.mock('@/lib/cron-auth', () => ({
  isAuthorizedCron: vi.fn().mockReturnValue(true),
}));

// ── Schema table marker ───────────────────────────────────────────────────────

function col(name: string) {
  return { __column: name };
}

const TABLES = {
  workflows: {
    __table: 'workflows',
    id: col('id'),
    clientId: col('clientId'),
    status: col('status'),
    trigger: col('trigger'),
    lastFiredAt: col('lastFiredAt'),
    updatedAt: col('updatedAt'),
  },
};

vi.mock('@/lib/db/schema', () => TABLES);

// ── Drizzle-orm mock (operators return tagged expr objects) ───────────────────

vi.mock('drizzle-orm', () => ({
  eq: (a: unknown, b: unknown) => ({ op: 'eq', a, b }),
  and: (...args: unknown[]) => ({ op: 'and', args }),
  or: (...args: unknown[]) => ({ op: 'or', args }),
  isNull: (a: unknown) => ({ op: 'isNull', a }),
  lt: (a: unknown, b: unknown) => ({ op: 'lt', a, b }),
  sql: (strings: TemplateStringsArray, ..._args: unknown[]) => ({
    op: 'sql',
    text: strings.join('?'),
  }),
}));

// ── In-memory state ───────────────────────────────────────────────────────────

type WorkflowRow = {
  id: number;
  clientId: number;
  status: string;
  trigger: { kind: string; cron?: string };
  lastFiredAt: Date | null;
  updatedAt: Date;
};

const state = {
  workflows: [] as WorkflowRow[],
};

function colName(ref: unknown): string | null {
  if (!ref || typeof ref !== 'object') return null;
  return (ref as { __column?: string }).__column ?? null;
}

function evalFilter(row: Record<string, unknown>, filter: unknown): boolean {
  if (!filter || typeof filter !== 'object') return true;
  const f = filter as { op: string; a?: unknown; b?: unknown; args?: unknown[] };
  switch (f.op) {
    case 'eq': {
      const name = colName(f.a);
      return name != null && row[name] === f.b;
    }
    case 'and':
      return (f.args ?? []).every((a) => evalFilter(row, a));
    case 'or':
      return (f.args ?? []).some((a) => evalFilter(row, a));
    case 'isNull': {
      const name = colName(f.a);
      return name != null && row[name] == null;
    }
    case 'lt': {
      const name = colName(f.a);
      if (!name) return false;
      const v = row[name];
      if (v instanceof Date && f.b instanceof Date) return v < f.b;
      return false;
    }
    // The `sql` trigger-kind predicate is treated as "always true" here —
    // the test controls which workflows are in the store, so the trigger
    // JSON filter isn't the thing under test.
    case 'sql':
      return true;
    default:
      return true;
  }
}

vi.mock('@/lib/db', () => {
  function buildSelectChain(tableName: string) {
    let pendingFilter: unknown = null;
    const resolve = () =>
      Promise.resolve(getStore(tableName).filter((row) => evalFilter(row, pendingFilter)));
    const chain = {
      from: () => chain,
      where: (f: unknown) => {
        pendingFilter = f;
        return chain;
      },
      limit: () => resolve(),
      // The route `await`s the select without `.limit()`, so the chain itself
      // must be thenable.
      then: (onFulfilled?: (v: unknown) => unknown) => resolve().then(onFulfilled),
    };
    return chain;
  }

  function buildUpdateChain(tableName: string) {
    let pendingPatch: Record<string, unknown> = {};
    return {
      set: (patch: Record<string, unknown>) => {
        pendingPatch = patch;
        return {
          where: (filter: unknown) => {
            const store = getStore(tableName);
            const updated: Record<string, unknown>[] = [];
            for (const row of store) {
              if (evalFilter(row as unknown as Record<string, unknown>, filter)) {
                Object.assign(row, pendingPatch);
                updated.push(row);
              }
            }
            return {
              returning: async () => updated.map((r) => ({ id: r.id as number })),
            };
          },
        };
      },
    };
  }

  function getStore(tableName: string): Record<string, unknown>[] {
    return tableName === 'workflows'
      ? (state.workflows as unknown as Record<string, unknown>[])
      : [];
  }

  return {
    db: {
      select: () => ({
        from: (table: { __table: string }) => buildSelectChain(table.__table),
      }),
      update: (table: { __table: string }) => buildUpdateChain(table.__table),
    },
  };
});

// ── Helpers ───────────────────────────────────────────────────────────────────

// The route is imported dynamically inside each test (like the sibling
// process-workflow-runs test) so the `vi.mock` factories above have already
// run and `TABLES` is initialized by the time the route pulls in the schema.
function makeReq() {
  return new Request('http://localhost/api/cron/process-workflow-schedules');
}

function wf(overrides: Partial<WorkflowRow>): WorkflowRow {
  return {
    id: 1,
    clientId: 3,
    status: 'active',
    trigger: { kind: 'schedule', cron: '0 9 * * *' },
    lastFiredAt: null,
    updatedAt: new Date('2026-08-27T00:00:00Z'),
    ...overrides,
  };
}

beforeEach(() => {
  state.workflows = [];
  mockEnqueue.mockReset();
  mockEnqueue.mockResolvedValue({ matchedWorkflowIds: [] });
});

describe('process-workflow-schedules cron', () => {
  async function runCron() {
    const { GET } = await import('@/app/api/cron/process-workflow-schedules/route');
    return GET(makeReq());
  }

  it('enqueues a due schedule workflow and stamps last_fired_at', async () => {
    // "now" is 09:00:30 — the 09:00 slot just passed. The route uses the real
    // clock, so freeze it via the cron expression + lastFiredAt: with a
    // per-minute cron and lastFiredAt null, it always fires in the window.
    state.workflows = [wf({ trigger: { kind: 'schedule', cron: '* * * * *' } })];

    const res = await runCron();
    const json = await res.json();

    expect(json.fired).toBe(1);
    expect(json.scanned).toBe(1);
    expect(mockEnqueue).toHaveBeenCalledTimes(1);
    const [clientId, trigger, ctx, opts] = mockEnqueue.mock.calls[0];
    expect(clientId).toBe(3);
    expect(trigger).toEqual({ kind: 'schedule', cron: '* * * * *' });
    expect(opts.triggeredBy).toBe('schedule');
    expect(opts.workflowIds).toEqual([1]);
    expect(ctx.triggeredAt).toBeTruthy();
    // Claim stamped last_fired_at.
    expect(state.workflows[0].lastFiredAt).not.toBeNull();
  });

  it('does not enqueue a workflow that already fired for the current slot', async () => {
    // lastFiredAt is set to the same slot the cron would fire — the CAS
    // predicate `last_fired_at < prev` fails, so no claim, no enqueue.
    state.workflows = [
      wf({
        trigger: { kind: 'schedule', cron: '* * * * *' },
        lastFiredAt: new Date(),
      }),
    ];

    const res = await runCron();
    const json = await res.json();

    expect(json.fired).toBe(0);
    expect(mockEnqueue).not.toHaveBeenCalled();
  });

  it('skips non-schedule workflows', async () => {
    state.workflows = [
      wf({ trigger: { kind: 'contact.created' } }),
    ];

    const res = await runCron();
    const json = await res.json();

    expect(json.fired).toBe(0);
    expect(json.skipped).toBe(1);
    expect(mockEnqueue).not.toHaveBeenCalled();
  });

  it('skips paused workflows', async () => {
    state.workflows = [
      wf({ status: 'paused', trigger: { kind: 'schedule', cron: '* * * * *' } }),
    ];

    const res = await runCron();
    const json = await res.json();

    expect(json.fired).toBe(0);
    expect(mockEnqueue).not.toHaveBeenCalled();
  });

  it('skips workflows with a malformed cron', async () => {
    state.workflows = [
      wf({ trigger: { kind: 'schedule', cron: 'not-a-cron' } }),
    ];

    const res = await runCron();
    const json = await res.json();

    expect(json.fired).toBe(0);
    expect(json.skipped).toBe(1);
    expect(mockEnqueue).not.toHaveBeenCalled();
  });

  it('captures enqueue errors without failing the whole tick', async () => {
    state.workflows = [
      wf({ id: 1, trigger: { kind: 'schedule', cron: '* * * * *' } }),
      wf({ id: 2, clientId: 4, trigger: { kind: 'schedule', cron: '* * * * *' } }),
    ];
    mockEnqueue.mockRejectedValueOnce(new Error('boom'));

    const res = await runCron();
    const json = await res.json();

    expect(json.fired).toBe(1);
    expect(json.errors).toHaveLength(1);
    expect(json.errors[0].workflowId).toBe(1);
    expect(json.success).toBe(false);
    expect(res.status).toBe(503);
    // The failed enqueue releases its schedule slot for a retry.
    expect(state.workflows[0].lastFiredAt).toBeNull();
    // Second workflow still fired.
    expect(mockEnqueue).toHaveBeenCalledTimes(2);
  });

  it('returns 401 for an unauthorized request', async () => {
    const { isAuthorizedCron } = await import('@/lib/cron-auth');
    (isAuthorizedCron as ReturnType<typeof vi.fn>).mockReturnValueOnce(false);

    const { GET } = await import('@/app/api/cron/process-workflow-schedules/route');
    const res = await GET(makeReq());
    expect(res.status).toBe(401);
    expect(mockEnqueue).not.toHaveBeenCalled();
  });
});
