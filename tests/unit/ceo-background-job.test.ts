// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const aiConversations = { id: 'conversation.id', clientId: 'conversation.clientId', totalInputTokens: 'conversation.input', totalOutputTokens: 'conversation.output' };
const aiMessages = { conversationId: 'message.conversationId', toolCalls: 'message.toolCalls' };
const clients = { id: 'client.id', userId: 'client.userId' };
vi.mock('@/lib/db/schema', () => ({ aiConversations, aiMessages, clients }));
vi.mock('drizzle-orm', () => ({ and: vi.fn(), eq: vi.fn(), sql: vi.fn() }));

const storedMessages: Array<{ toolCalls: unknown; values?: Record<string, unknown> }> = [];
const dbMock = {
  select: vi.fn(() => ({
    from: (table: unknown) => {
      const resultForTable = () =>
        table === aiConversations ? [{ id: 21 }]
        : table === clients ? [{ userId: 9 }]
        : table === aiMessages ? storedMessages
        : [];
      const query = {
        limit: async () => resultForTable(),
        then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) => Promise.resolve(resultForTable()).then(resolve, reject),
      };
      return { where: () => query };
    },
  })),
  insert: vi.fn(() => ({
    values: async (values: Record<string, unknown>) => {
      storedMessages.push({ toolCalls: values.toolCalls, values });
    },
  })),
  update: vi.fn(() => ({
    set: () => ({ where: async () => undefined }),
  })),
};
vi.mock('@/lib/db', () => ({ db: dbMock }));

const checkAiPlanGateMock = vi.fn();
vi.mock('@/lib/ai/plan-gate', () => ({ checkAiPlanGate: (...args: unknown[]) => checkAiPlanGateMock(...args) }));
const resolveClientApiKeyMock = vi.fn();
vi.mock('@/lib/ai/resolve-client-key', () => ({ resolveClientApiKey: (...args: unknown[]) => resolveClientApiKeyMock(...args) }));
vi.mock('@/lib/ai/models', () => ({ resolveChoice: () => ({ provider: 'anthropic', model: 'test-model' }) }));
vi.mock('@/lib/ai-credits', () => ({ hasCredits: vi.fn(), deductCredits: vi.fn(), getBalance: vi.fn() }));
vi.mock('@/lib/ai/audit', () => ({ recordAiUsage: vi.fn() }));

const ceo = { id: 'ceo', name: 'Agente CEO', shortName: 'CEO', domains: [], readOnly: true };
const crm = { id: 'crm', name: 'Agente comercial y CRM', shortName: 'Comercial', domains: ['crm'], readOnly: false };
const getPortalAgentMock = vi.fn((id: unknown) => id === 'crm' ? crm : id === 'ceo' ? ceo : null);
vi.mock('@/lib/ai/portal-agents', () => ({ getPortalAgent: (...args: unknown[]) => getPortalAgentMock(...args) }));
const toolsForPortalAgentMock = vi.fn();
const readOnlyToolsForPortalAgentMock = vi.fn();
const portalAgentAllowsToolMock = vi.fn();
vi.mock('@/lib/ai/portal-agent-tools', () => ({
  toolsForPortalAgent: (...args: unknown[]) => toolsForPortalAgentMock(...args),
  readOnlyToolsForPortalAgent: (...args: unknown[]) => readOnlyToolsForPortalAgentMock(...args),
  portalAgentAllowsTool: (...args: unknown[]) => portalAgentAllowsToolMock(...args),
}));
vi.mock('@/lib/ai/portal-tools', () => ({ PORTAL_TOOLS: [{ name: 'get_crm_contacts' }], executePortalTool: vi.fn() }));
vi.mock('@/lib/ai/portal-chat-prompt', () => ({ buildPortalAgentSystemPrompt: () => 'CEO system prompt' }));
const completeAgentLoopMock = vi.fn();
vi.mock('@/lib/ai/agent-loop', () => ({
  anthropicToolsToToolSet: vi.fn(() => ({})),
  completeAgentLoop: (...args: unknown[]) => completeAgentLoopMock(...args),
}));
vi.mock('@/lib/ai/tracer', () => ({ withSpan: (_name: unknown, _attrs: unknown, fn: () => unknown) => fn() }));
const enqueueJobMock = vi.fn();
vi.mock('@/lib/jobs', () => ({ enqueueJob: (...args: unknown[]) => enqueueJobMock(...args) }));
const selectBackgroundSpecialistsMock = vi.fn(() => []);
vi.mock('@/lib/ai/background-agent-delegation', () => ({ selectBackgroundSpecialists: (...args: unknown[]) => selectBackgroundSpecialistsMock(...args) }));

const { runBackgroundPortalAnalysis, runCeoBackgroundAnalysis } = await import('@/lib/ai/ceo-background-job');

const payload = {
  clientId: 10,
  conversationId: 21,
  taskId: 'task-12345678',
  task: 'Prioriza los riesgos comerciales',
};

describe('runCeoBackgroundAnalysis', () => {
  beforeEach(() => {
    storedMessages.length = 0;
    vi.clearAllMocks();
    checkAiPlanGateMock.mockResolvedValue({ allowed: true });
    resolveClientApiKeyMock.mockResolvedValue({ source: 'byok', key: 'not-used-here' });
    toolsForPortalAgentMock.mockReturnValue([{ name: 'get_crm_contacts' }]);
    readOnlyToolsForPortalAgentMock.mockReturnValue([{ name: 'get_crm_contacts' }]);
    portalAgentAllowsToolMock.mockReturnValue(true);
    selectBackgroundSpecialistsMock.mockReturnValue([]);
    enqueueJobMock.mockResolvedValue(undefined);
    completeAgentLoopMock.mockResolvedValue({
      text: 'Prioridad: recuperar oportunidades abiertas con el Agente comercial.',
      usage: { inputTokens: 12, outputTokens: 34 },
      steps: [{ toolCalls: [], toolResults: [] }],
    });
  });

  it('runs the CEO with only its read-only tool surface and posts the result into the tenant conversation', async () => {
    await runCeoBackgroundAnalysis(payload, dbMock as never, { attempt: 1, isFinalAttempt: false });

    expect(toolsForPortalAgentMock).toHaveBeenCalledWith(ceo, [{ name: 'get_crm_contacts' }]);
    expect(completeAgentLoopMock).toHaveBeenCalledWith(expect.objectContaining({
      task: 'ceoBackground',
      clientId: 10,
      maxSteps: 8,
      messages: [{ role: 'user', content: payload.task }],
    }));
    expect(storedMessages).toHaveLength(1);
    expect(storedMessages[0]?.values).toEqual(expect.objectContaining({
      conversationId: 21,
      role: 'assistant',
      content: 'Prioridad: recuperar oportunidades abiertas con el Agente comercial.',
      inputTokens: 12,
      outputTokens: 34,
      toolCalls: [expect.objectContaining({ agentId: 'ceo', name: 'ceo_background_analysis', result: expect.objectContaining({ status: 'completed' }) })],
    }));
  });

  it('notifies the conversation only after the last failed attempt and keeps the job failure visible to the queue', async () => {
    completeAgentLoopMock.mockRejectedValueOnce(new Error('provider unavailable'));

    await expect(runCeoBackgroundAnalysis(payload, dbMock as never, { attempt: 3, isFinalAttempt: true })).rejects.toThrow('provider unavailable');

    expect(storedMessages).toHaveLength(1);
    expect(storedMessages[0]?.values?.content).toContain('No he podido terminar el análisis del CEO');
    expect(storedMessages[0]?.values?.toolCalls).toEqual([
      expect.objectContaining({ result: { status: 'failed' } }),
    ]);
  });

  it('queues a bounded, idempotent read-only analysis for matching specialists after the CEO diagnosis', async () => {
    selectBackgroundSpecialistsMock.mockReturnValue(['crm']);

    await runCeoBackgroundAnalysis(payload, dbMock as never, { attempt: 1, isFinalAttempt: false });

    expect(enqueueJobMock).toHaveBeenCalledWith({
      clientId: 10,
      type: 'agent.background_analysis',
      payload: { ...payload, agentId: 'crm' },
      dedupeKey: 'agent.background_analysis:task-12345678:crm',
    }, dbMock);
    expect(storedMessages[0]?.values?.content).toContain('He puesto en marcha análisis de apoyo: Comercial');
  });

  it('runs a delegated specialist with the read-only tool boundary', async () => {
    await runBackgroundPortalAnalysis({ ...payload, agentId: 'crm' }, dbMock as never, { attempt: 1, isFinalAttempt: false });

    expect(readOnlyToolsForPortalAgentMock).toHaveBeenCalledWith(crm, [{ name: 'get_crm_contacts' }]);
    expect(toolsForPortalAgentMock).not.toHaveBeenCalled();
    expect(completeAgentLoopMock).toHaveBeenCalledWith(expect.objectContaining({
      task: 'agentBackground',
      clientId: 10,
      maxSteps: 5,
      maxTokens: 1_200,
    }));
    expect(storedMessages[0]?.values?.toolCalls).toEqual([
      expect.objectContaining({ agentId: 'crm', name: 'portal_agent_background_analysis', result: { status: 'completed', delegatedTo: [] } }),
    ]);
  });
});
