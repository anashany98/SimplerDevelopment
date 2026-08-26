// @vitest-environment node
/**
 * Unit tests for the brain agent route's dual path
 * (POST /api/portal/brain/agent).
 *
 * Phase 2 (ADR mastra-consolidate-separate-service, item 3) added a branch:
 * when the standalone agents service is configured (SD_AGENTS_URL +
 * SD_AGENTS_INTERNAL_SECRET), the route calls runBrainWorkflowOnService and
 * maps the blocking result to SSE frames; otherwise it falls back to the
 * in-process Anthropic tool loop.
 *
 * Everything is mocked; we drive the two branches through the
 * `agentsServiceConfigured` mock.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock collaborators (declared BEFORE the route import — Vitest hoists vi.mock)
// ---------------------------------------------------------------------------

const requireBrainEntitlementMock = vi.fn();
vi.mock('@/lib/brain/entitlement', () => ({
  requireBrainEntitlement: (...args: unknown[]) => requireBrainEntitlementMock(...args),
}));

const resolveClientApiKeyMock = vi.fn();
vi.mock('@/lib/ai/resolve-client-key', () => ({
  resolveClientApiKey: (...args: unknown[]) => resolveClientApiKeyMock(...args),
}));

const hasCreditsMock = vi.fn();
const deductCreditsMock = vi.fn();
const getBalanceMock = vi.fn();
vi.mock('@/lib/ai-credits', () => ({
  hasCredits: (...args: unknown[]) => hasCreditsMock(...args),
  deductCredits: (...args: unknown[]) => deductCreditsMock(...args),
  getBalance: (...args: unknown[]) => getBalanceMock(...args),
}));

const recordAiUsageMock = vi.fn();
vi.mock('@/lib/ai/audit', () => ({
  recordAiUsage: (...args: unknown[]) => recordAiUsageMock(...args),
}));

const checkAiPlanGateMock = vi.fn();
vi.mock('@/lib/ai/plan-gate', () => ({
  checkAiPlanGate: (...args: unknown[]) => checkAiPlanGateMock(...args),
}));

const executeBrainToolMock = vi.fn();
vi.mock('@/lib/ai/brain-tools', () => ({
  BRAIN_TOOLS: [],
  executeBrainTool: (...args: unknown[]) => executeBrainToolMock(...args),
}));

const classifyIntentMock = vi.fn();
vi.mock('@/lib/ai/brain-tools/classifier', () => ({
  classifyIntent: (...args: unknown[]) => classifyIntentMock(...args),
}));

const generatePlanMock = vi.fn();
vi.mock('@/lib/ai/brain-tools/planner', () => ({
  generatePlan: (...args: unknown[]) => generatePlanMock(...args),
}));

const checkGroundednessMock = vi.fn();
vi.mock('@/lib/ai/brain-tools/grounder', () => ({
  checkGroundedness: (...args: unknown[]) => checkGroundednessMock(...args),
}));

const getAgentPreferencesMock = vi.fn();
const trackIntentUsageMock = vi.fn();
vi.mock('@/lib/brain/agent-preferences', () => ({
  getAgentPreferences: (...args: unknown[]) => getAgentPreferencesMock(...args),
  trackIntentUsage: (...args: unknown[]) => trackIntentUsageMock(...args),
}));

vi.mock('@/lib/brain/agent-preferences-api', () => ({
  formatPreferencesForPrompt: () => '',
}));

vi.mock('@/lib/ai/tracer', () => ({
  withSpan: async (_name: unknown, _attrs: unknown, fn: () => unknown) => fn(),
  startSpan: () => ({ end: () => {} }),
}));

// Agents service client — this is the branch we're testing.
const agentsServiceConfiguredMock = vi.fn();
const runBrainWorkflowOnServiceMock = vi.fn();
vi.mock('@/lib/ai/agents-client', () => ({
  runBrainWorkflowOnService: (...args: unknown[]) => runBrainWorkflowOnServiceMock(...args),
  agentsServiceConfigured: () => agentsServiceConfiguredMock(),
  AgentsServiceError: class extends Error {},
}));

// Anthropic SDK — never touch the network.
const messagesCreateMock = vi.fn();
vi.mock('@anthropic-ai/sdk', () => {
  class Anthropic {
    public messages: { create: typeof messagesCreateMock; stream: () => never };
    constructor() {
      this.messages = {
        create: messagesCreateMock,
        stream: () => {
          throw new Error('stream not expected in these tests');
        },
      };
    }
  }
  return { default: Anthropic };
});

// ---- schema + drizzle + db (in-memory, mirroring the chat-route test) ----

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
// Module under test (dynamic import AFTER mocks)
// ---------------------------------------------------------------------------

const { POST } = await import('@/app/api/portal/brain/agent/route');

function makeRequest(body: Record<string, unknown>): Request {
  return new Request('http://x/api/portal/brain/agent', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function readFrames(res: Response): Promise<Array<Record<string, unknown>>> {
  const text = await res.text();
  return text
    .split('\n\n')
    .filter((block) => block.startsWith('data:'))
    .map((block) => JSON.parse(block.slice(5).trim()) as Record<string, unknown>);
}

beforeEach(() => {
  state.aiConversations.length = 0;
  state.aiMessages.length = 0;
  idCounter = 1000;

  requireBrainEntitlementMock.mockReset().mockResolvedValue({ client: { id: 10 }, userId: 7 });
  resolveClientApiKeyMock.mockReset().mockResolvedValue({ source: 'byok', key: 'sk-test' });
  hasCreditsMock.mockReset().mockResolvedValue(true);
  deductCreditsMock.mockReset().mockResolvedValue({ newBalance: 1 });
  getBalanceMock.mockReset().mockResolvedValue({ balance: 0 });
  recordAiUsageMock.mockReset().mockResolvedValue(undefined);
  checkAiPlanGateMock.mockReset().mockResolvedValue({ allowed: true });
  executeBrainToolMock.mockReset();
  classifyIntentMock.mockReset().mockResolvedValue({
    intent: 'lookup',
    complexity: 'simple',
    reasoning: 'test',
  });
  generatePlanMock.mockReset().mockResolvedValue({ steps: [] });
  checkGroundednessMock.mockReset().mockResolvedValue({
    confidence: 0.9,
    grounded: true,
    uncertain: false,
    sources: ['brain_search'],
  });
  getAgentPreferencesMock.mockReset().mockResolvedValue([]);
  trackIntentUsageMock.mockReset().mockResolvedValue(undefined);
  agentsServiceConfiguredMock.mockReset().mockReturnValue(false);
  runBrainWorkflowOnServiceMock.mockReset();
  messagesCreateMock.mockReset();
});

describe('POST /api/portal/brain/agent — dual path', () => {
  it('calls the agents service and maps its result to SSE frames when configured', async () => {
    agentsServiceConfiguredMock.mockReturnValue(true);
    runBrainWorkflowOnServiceMock.mockResolvedValue({
      status: 'completed',
      result: {
        answer: 'The answer from the service.',
        intent: { intent: 'lookup', complexity: 'complex', reasoning: 'multi-hop' },
        plan: ['step one'],
        groundedness: { confidence: 0.8, grounded: true, uncertain: false, sources: ['brain_search'] },
      },
    });

    const res = await POST(makeRequest({ message: 'who knows stripe?' }));

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/event-stream');

    // Service called with tenant identity + query; in-process loop NOT used.
    expect(runBrainWorkflowOnServiceMock).toHaveBeenCalledWith(
      expect.objectContaining({ clientId: 10, userId: 7, query: 'who knows stripe?' }),
    );
    expect(messagesCreateMock).not.toHaveBeenCalled();

    const frames = await readFrames(res);
    const types = frames.map((f) => f.type);
    expect(types).toContain('intent');
    expect(types).toContain('plan');
    expect(types).toContain('token');
    expect(types).toContain('confidence');
    expect(types).toContain('done');

    const tokenFrame = frames.find((f) => f.type === 'token');
    expect(tokenFrame?.text).toBe('The answer from the service.');
    const doneFrame = frames.find((f) => f.type === 'done');
    expect(doneFrame?.conversationId).toBeTypeOf('number');

    // Conversation + user + assistant persisted.
    expect(state.aiConversations).toHaveLength(1);
    expect(state.aiMessages.filter((m) => m.role === 'user')).toHaveLength(1);
    const assistant = state.aiMessages.find((m) => m.role === 'assistant');
    expect(assistant?.content).toBe('The answer from the service.');
  });

  it('emits an error frame when the service workflow fails', async () => {
    agentsServiceConfiguredMock.mockReturnValue(true);
    runBrainWorkflowOnServiceMock.mockResolvedValue({
      status: 'failed',
      error: 'model exploded',
    });

    const res = await POST(makeRequest({ message: 'hi' }));
    const frames = await readFrames(res);
    const err = frames.find((f) => f.type === 'error');
    expect(err?.message).toContain('model exploded');
    // No assistant message persisted on failure.
    expect(state.aiMessages.filter((m) => m.role === 'assistant')).toHaveLength(0);
  });

  it('falls back to the in-process loop when the service is NOT configured', async () => {
    agentsServiceConfiguredMock.mockReturnValue(false);
    messagesCreateMock.mockResolvedValueOnce({
      content: [{ type: 'text', text: 'In-process answer.' }],
      stop_reason: 'end_turn',
      usage: { input_tokens: 10, output_tokens: 5 },
    });

    const res = await POST(makeRequest({ message: 'hello' }));
    expect(res.status).toBe(200);

    // The in-process loop runs inside the SSE stream's async start(), so we
    // must consume the body (readFrames) before asserting the Anthropic call.
    const frames = await readFrames(res);

    // Service NOT called; Anthropic loop used instead.
    expect(runBrainWorkflowOnServiceMock).not.toHaveBeenCalled();
    expect(messagesCreateMock).toHaveBeenCalled();

    const tokenFrame = frames.find((f) => f.type === 'token');
    expect(tokenFrame?.text).toContain('In-process answer.');
    const assistant = state.aiMessages.find((m) => m.role === 'assistant');
    expect(assistant?.content).toContain('In-process answer.');
  });
});