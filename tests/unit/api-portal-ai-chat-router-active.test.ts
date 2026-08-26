// @vitest-environment node
/**
 * Unit tests for the env-gated intent router (PORTAL_ROUTER_MODE) in
 * POST /api/portal/ai/chat.
 *
 * The route reads the mode per-request via resolveRouterMode():
 *   - 'active'  → the loop gets only the routed domain subset (token savings)
 *   - 'shadow'  → the loop gets the full agent tool surface (default, no change)
 *
 * We set the env var BEFORE importing the route module and exercise the
 * Anthropic call's `tools` array to prove which surface reaches the loop.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock collaborators (declared BEFORE the route import — Vitest hoists vi.mock)
// ---------------------------------------------------------------------------

const authMock = vi.fn();
vi.mock('@/lib/auth', () => ({
  auth: () => authMock(),
}));

const authorizePortalMock = vi.fn();
const isAuthErrorMock = vi.fn();
vi.mock('@/lib/portal-auth', () => ({
  authorizePortal: (...args: unknown[]) => authorizePortalMock(...args),
  isAuthError: (result: unknown) => isAuthErrorMock(result),
}));

const getPortalClientMock = vi.fn();
vi.mock('@/lib/portal-client', () => ({
  getPortalClient: (...args: unknown[]) => getPortalClientMock(...args),
}));

const hasCreditsMock = vi.fn();
const deductCreditsMock = vi.fn();
vi.mock('@/lib/ai-credits', () => ({
  hasCredits: (...args: unknown[]) => hasCreditsMock(...args),
  deductCredits: (...args: unknown[]) => deductCreditsMock(...args),
}));

const resolveClientApiKeyMock = vi.fn();
vi.mock('@/lib/ai/resolve-client-key', () => ({
  resolveClientApiKey: (...args: unknown[]) => resolveClientApiKeyMock(...args),
}));

const recordAiUsageMock = vi.fn();
vi.mock('@/lib/ai/audit', () => ({
  recordAiUsage: (...args: unknown[]) => recordAiUsageMock(...args),
}));

const checkAiPlanGateMock = vi.fn();
vi.mock('@/lib/ai/plan-gate', () => ({
  checkAiPlanGate: (...args: unknown[]) => checkAiPlanGateMock(...args),
}));

const executePortalToolMock = vi.fn();
vi.mock('@/lib/ai/portal-tools', () => ({
  PORTAL_TOOLS: [
    { name: 'list_projects', description: 'x', input_schema: { type: 'object', properties: {} } },
    { name: 'get_crm_contacts', description: 'x', input_schema: { type: 'object', properties: {} } },
    { name: 'get_my_invoices', description: 'x', input_schema: { type: 'object', properties: {} } },
  ],
  executePortalTool: (...args: unknown[]) => executePortalToolMock(...args),
}));

const resolveChoiceMock = vi.fn();
vi.mock('@/lib/ai/models', () => ({
  resolveChoice: (...args: unknown[]) => resolveChoiceMock(...args),
}));

vi.mock('@/lib/ai/agent-loop', () => ({
  anthropicToolsToToolSet: (...args: unknown[]) => args,
  completeAgentLoop: () => ({ text: '', usage: { inputTokens: 0, outputTokens: 0 }, steps: [] }),
}));

// Classifier — bypass Anthropic so it doesn't consume messagesCreateMock slots
const classifyPortalRequestMock = vi.fn();
vi.mock('@/lib/ai/portal-tools/classifier', () => ({
  classifyPortalRequest: (...args: unknown[]) => classifyPortalRequestMock(...args),
  classifyPortalComplexity: (...args: unknown[]) => classifyPortalRequestMock(...args),
}));

vi.mock('@/lib/ai/tracer', () => ({
  withSpan: async (_name: unknown, _attrs: unknown, fn: () => unknown) => fn(),
  startSpan: () => ({ end: () => {} }),
}));

// Domain-aware routing mock: list_projects→projects, get_crm_contacts→crm,
// get_my_invoices→billing. This lets us assert the loop got only the routed
// subset in 'active' mode.
vi.mock('@/lib/ai/portal-tools/domains', () => ({
  toolsForDomains: (domains: unknown, tools: unknown) => {
    const domainList = Array.isArray(domains) ? domains : [];
    const toolList = Array.isArray(tools) ? (tools as Array<{ name: string }>) : [];
    if (domainList.length === 0) return toolList;
    const domainByTool: Record<string, string> = {
      list_projects: 'projects',
      get_crm_contacts: 'crm',
      get_my_invoices: 'billing',
    };
    return toolList.filter((tool) => domainList.includes(domainByTool[tool.name]));
  },
  domainsOfToolCalls: () => [],
  PORTAL_DOMAINS: [],
}));

const messagesCreateMock = vi.fn();
vi.mock('@anthropic-ai/sdk', () => {
  class Anthropic {
    public messages: { create: typeof messagesCreateMock };
    constructor() {
      this.messages = { create: messagesCreateMock };
    }
  }
  return { default: Anthropic };
});

vi.mock('@/lib/db/schema', () => {
  const wrap = (tableName: string) =>
    new Proxy(
      { __table: tableName },
      {
        get(_t, prop: string) {
          if (prop === '__table') return tableName;
          return { __col: prop, __table: tableName };
        },
      },
    );
  return new Proxy(
    { aiConversations: wrap('aiConversations'), aiMessages: wrap('aiMessages') },
    {
      has: (t, p) => p in t || !(p === 'then' || p === '__esModule' || p === 'default' || typeof p !== 'string'),
      get: (t, p) => (p in t ? t[p] : p === 'then' || p === '__esModule' || p === 'default' || typeof p !== 'string' ? undefined : wrap(p)),
    },
  );
});

vi.mock('drizzle-orm', () => ({
  eq: (a: unknown, b: unknown) => ({ op: 'eq', a, b }),
  asc: (a: unknown) => ({ op: 'asc', a }),
  sql: (..._args: unknown[]) => ({ __sql: true }),
  isNull: (a: unknown) => ({ op: 'isNull', a }),
  or: (...args: unknown[]) => ({ op: 'or', args: args.filter(Boolean) }),
  inArray: (a: unknown, list: unknown[]) => ({ op: 'inArray', a, list }),
}));

interface MockState {
  aiConversations: Array<Record<string, unknown>>;
  aiMessages: Array<Record<string, unknown>>;
}
const state: MockState = { aiConversations: [], aiMessages: [] };
let idCounter = 1000;
function nextId(): number {
  return idCounter++;
}
function tableArray(name: string): Array<Record<string, unknown>> {
  return (state as unknown as Record<string, Array<Record<string, unknown>>>)[name] ?? [];
}
function evalPredicate(filter: unknown, row: Record<string, unknown>): boolean {
  if (!filter || typeof filter !== 'object') return true;
  const f = filter as { op?: string; a?: { __col?: string }; b?: unknown; args?: unknown[] };
  if (f.op === 'eq') {
    const col = f.a;
    if (!col?.__col) return true;
    return row[col.__col] === f.b;
  }
  if (f.op === 'and') return (f.args ?? []).every((arg) => evalPredicate(arg, row));
  return true;
}

vi.mock('@/lib/db', () => {
  function buildSelect() {
    let activeTable: string | null = null;
    let filter: unknown = null;
    let limit: number | null = null;
    const chain: Record<string, unknown> = {
      from(table: { __table: string }) {
        activeTable = table.__table;
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
        limit = n;
        return runQuery();
      },
      then(onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) {
        return runQuery().then(onFulfilled, onRejected);
      },
    };
    function runQuery(): Promise<Array<Record<string, unknown>>> {
      if (!activeTable) return Promise.resolve([]);
      const rows = tableArray(activeTable).filter((r) => evalPredicate(filter, r));
      let out = rows.map((r) => ({ ...r }));
      if (limit !== null) out = out.slice(0, limit);
      return Promise.resolve(out);
    }
    return chain;
  }
  function buildInsert(table: { __table: string }) {
    return {
      values(vals: Record<string, unknown> | Record<string, unknown>[]) {
        const arr = Array.isArray(vals) ? vals : [vals];
        const inserted = arr.map((v) => {
          const row = { ...v, id: nextId(), createdAt: new Date(), updatedAt: new Date() };
          tableArray(table.__table).push(row);
          return row;
        });
        return {
          returning() {
            return Promise.resolve(inserted.map((r) => ({ ...r })));
          },
          then(onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) {
            return Promise.resolve(inserted).then(onFulfilled, onRejected);
          },
        };
      },
    };
  }
  function buildUpdate(table: { __table: string }) {
    return {
      set(patch: Record<string, unknown>) {
        return {
          where(filter: unknown) {
            const rows = tableArray(table.__table).filter((r) => evalPredicate(filter, r));
            for (const r of rows) {
              for (const [k, v] of Object.entries(patch)) {
                if (v && typeof v === 'object' && '__sql' in (v as Record<string, unknown>)) continue;
                r[k] = v;
              }
            }
            return {
              then(onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) {
                return Promise.resolve(rows.map((r) => ({ ...r }))).then(onFulfilled, onRejected);
              },
            };
          },
        };
      },
    };
  }
  return {
    db: {
      select() {
        return { from(table: { __table: string }) { return buildSelect().from(table); } };
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
// Module under test — env var set BEFORE import so resolveRouterMode() reads it
// ---------------------------------------------------------------------------

const { POST } = await import('@/app/api/portal/ai/chat/route');

function makeRequest(body: Record<string, unknown>): Request {
  return new Request('http://x/api/portal/ai/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function textResponse(text: string) {
  return {
    content: [{ type: 'text', text }],
    stop_reason: 'end_turn',
    usage: { input_tokens: 100, output_tokens: 200 },
  };
}

beforeEach(() => {
  state.aiConversations.length = 0;
  state.aiMessages.length = 0;
  idCounter = 1000;
  authMock.mockReset().mockResolvedValue({ user: { id: '7', role: 'client' } });
  authorizePortalMock.mockReset().mockResolvedValue({ ok: true });
  isAuthErrorMock.mockReset().mockReturnValue(false);
  getPortalClientMock.mockReset().mockResolvedValue({ id: 10 });
  hasCreditsMock.mockReset().mockResolvedValue(true);
  deductCreditsMock.mockReset().mockResolvedValue({ newBalance: 1 });
  resolveClientApiKeyMock.mockReset().mockResolvedValue({ source: 'platform', key: 'sk-test' });
  recordAiUsageMock.mockReset().mockResolvedValue(undefined);
  checkAiPlanGateMock.mockReset().mockResolvedValue({ allowed: true });
  executePortalToolMock.mockReset();
  resolveChoiceMock.mockReset().mockReturnValue({ provider: 'anthropic', model: 'claude-haiku-4-5-20251001' });
  classifyPortalRequestMock.mockReset().mockResolvedValue({
    complexity: 'simple',
    domains: ['projects'],
    reasoning: 'projects only',
    inputTokens: 0,
    outputTokens: 0,
  });
  messagesCreateMock.mockReset();
  delete process.env.PORTAL_ROUTER_MODE;
});

describe('POST /api/portal/ai/chat — env-gated intent router', () => {
  it("defaults to 'shadow' (full tool surface) when PORTAL_ROUTER_MODE is unset", async () => {
    messagesCreateMock.mockResolvedValueOnce(textResponse('ok'));
    const res = await POST(makeRequest({ message: 'list projects' }));
    expect(res.status).toBe(200);
    const call = messagesCreateMock.mock.calls[0]![0] as { tools: Array<{ name: string }> };
    // Shadow → full surface, not narrowed to 'projects'
    expect(call.tools.map((t) => t.name).sort()).toEqual(['get_crm_contacts', 'get_my_invoices', 'list_projects']);
    const body = await res.json();
    expect(body.data.router.mode).toBe('shadow');
  });

  it("narrows to the routed domain subset when PORTAL_ROUTER_MODE=active", async () => {
    process.env.PORTAL_ROUTER_MODE = 'active';
    messagesCreateMock.mockResolvedValueOnce(textResponse('ok'));
    const res = await POST(makeRequest({ message: 'list projects' }));
    expect(res.status).toBe(200);
    const call = messagesCreateMock.mock.calls[0]![0] as { tools: Array<{ name: string }> };
    expect(call.tools.map((t) => t.name)).toEqual(['list_projects']);
    const body = await res.json();
    expect(body.data.router.mode).toBe('active');
    expect(body.data.router.routedToolCount).toBe(1);
    expect(body.data.router.totalToolCount).toBe(3);
  });

  it("fails open to the full surface in active mode when the classifier returns no domains", async () => {
    process.env.PORTAL_ROUTER_MODE = 'active';
    classifyPortalRequestMock.mockResolvedValueOnce({
      complexity: 'simple',
      domains: [],
      reasoning: 'ambiguous',
      inputTokens: 0,
      outputTokens: 0,
    });
    messagesCreateMock.mockResolvedValueOnce(textResponse('ok'));
    const res = await POST(makeRequest({ message: 'help' }));
    expect(res.status).toBe(200);
    const call = messagesCreateMock.mock.calls[0]![0] as { tools: Array<{ name: string }> };
    // Empty domains → toolsForDomains returns the full set (fail-open)
    expect(call.tools.map((t) => t.name).sort()).toEqual(['get_crm_contacts', 'get_my_invoices', 'list_projects']);
  });
});