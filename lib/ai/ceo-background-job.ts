import { and, eq, sql } from 'drizzle-orm';
import { db as defaultDb } from '@/lib/db';
import { aiConversations, aiMessages, clients } from '@/lib/db/schema';
import { hasCredits, deductCredits, getBalance } from '@/lib/ai-credits';
import { recordAiUsage } from '@/lib/ai/audit';
import { anthropicToolsToToolSet, completeAgentLoop } from '@/lib/ai/agent-loop';
import { selectBackgroundSpecialists } from '@/lib/ai/background-agent-delegation';
import { buildPortalAgentSystemPrompt } from '@/lib/ai/portal-chat-prompt';
import { getPortalAgent, type PortalAgentId, type PortalAgentProfile } from '@/lib/ai/portal-agents';
import { portalAgentAllowsTool, readOnlyToolsForPortalAgent, toolsForPortalAgent } from '@/lib/ai/portal-agent-tools';
import { PORTAL_TOOLS, executePortalTool } from '@/lib/ai/portal-tools';
import { checkAiPlanGate } from '@/lib/ai/plan-gate';
import { resolveClientApiKey, type AiProvider } from '@/lib/ai/resolve-client-key';
import { resolveChoice, type AiTask } from '@/lib/ai/models';
import { withSpan } from '@/lib/ai/tracer';
import { enqueueJob, type JobExecutionContext } from '@/lib/jobs/queue';

type Db = typeof defaultDb;

const MAX_TASK_CHARS = 4_000;

interface BackgroundPayload {
  clientId: number;
  conversationId: number;
  taskId: string;
  task: string;
  /** Omitted by legacy CEO jobs; those default safely to the CEO profile. */
  agentId: PortalAgentId;
}

function operationName(agentId: PortalAgentId): 'ceo_background_analysis' | 'portal_agent_background_analysis' {
  return agentId === 'ceo' ? 'ceo_background_analysis' : 'portal_agent_background_analysis';
}

function parsePayload(payload: Record<string, unknown>): BackgroundPayload {
  const { clientId, conversationId, taskId, task } = payload;
  const agent = getPortalAgent(payload.agentId ?? 'ceo');
  if (
    typeof clientId !== 'number' || clientId <= 0 ||
    typeof conversationId !== 'number' || conversationId <= 0 ||
    typeof taskId !== 'string' || taskId.length < 8 ||
    typeof task !== 'string' || task.trim().length === 0 || task.length > MAX_TASK_CHARS ||
    !agent
  ) {
    throw new Error('portal_agent.background_analysis: malformed payload');
  }
  return { clientId, conversationId, taskId, task: task.trim(), agentId: agent.id };
}

function taskForAgent(agentId: PortalAgentId): AiTask {
  return agentId === 'ceo' ? 'ceoBackground' : 'agentBackground';
}

function providerForTask(task: AiTask): AiProvider {
  const provider = resolveChoice(task).provider;
  return provider === 'anthropic' ? 'anthropic' : provider === 'openai' ? 'openai' : 'huggingface';
}

function completedTask(toolCalls: unknown, taskId: string, agentId: PortalAgentId): boolean {
  return Array.isArray(toolCalls) && toolCalls.some((tool) => {
    if (!tool || typeof tool !== 'object') return false;
    const record = tool as { name?: unknown; input?: { taskId?: unknown; agentId?: unknown }; result?: { status?: unknown } };
    return record.name === operationName(agentId) &&
      record.input?.taskId === taskId &&
      record.input?.agentId === agentId &&
      record.result?.status === 'completed';
  });
}

async function appendResult(
  db: Db,
  payload: BackgroundPayload,
  content: string,
  result: Record<string, unknown>,
  inputTokens = 0,
  outputTokens = 0,
): Promise<void> {
  const rows = await db
    .select({ toolCalls: aiMessages.toolCalls })
    .from(aiMessages)
    .where(eq(aiMessages.conversationId, payload.conversationId));
  if (rows.some((row) => completedTask(row.toolCalls, payload.taskId, payload.agentId))) return;

  await db.insert(aiMessages).values({
    conversationId: payload.conversationId,
    role: 'assistant',
    content,
    toolCalls: [{
      agentId: payload.agentId,
      name: operationName(payload.agentId),
      input: { taskId: payload.taskId, agentId: payload.agentId },
      result,
    }],
    inputTokens,
    outputTokens,
  });

  await db
    .update(aiConversations)
    .set({
      totalInputTokens: sql`${aiConversations.totalInputTokens} + ${inputTokens}`,
      totalOutputTokens: sql`${aiConversations.totalOutputTokens} + ${outputTokens}`,
      updatedAt: new Date(),
    })
    .where(and(eq(aiConversations.id, payload.conversationId), eq(aiConversations.clientId, payload.clientId)));
}

async function appendFinalFailure(db: Db, payload: BackgroundPayload, agent: PortalAgentProfile): Promise<void> {
  const agentName = agent.shortName || agent.name || 'agente';
  await appendResult(
    db,
    payload,
    `No he podido terminar el análisis del ${agentName} después de varios intentos. No se ha realizado ningún cambio. Revisa la configuración de IA o vuelve a intentarlo.`,
    { status: 'failed' },
  );
}

function toolsForBackgroundAgent(agent: PortalAgentProfile) {
  // The CEO is already a read-only profile. Delegated specialists receive the
  // same strict filter so an unattended task can never bypass human approval.
  return agent.readOnly
    ? toolsForPortalAgent(agent, PORTAL_TOOLS)
    : readOnlyToolsForPortalAgent(agent, PORTAL_TOOLS);
}

async function dispatchSpecialists(payload: BackgroundPayload, db: Db): Promise<PortalAgentId[]> {
  const specialistIds = selectBackgroundSpecialists(payload.task);
  await Promise.all(specialistIds.map((agentId) =>
    enqueueJob({
      clientId: payload.clientId,
      type: 'agent.background_analysis',
      payload: { ...payload, agentId },
      // A retry of the CEO task reaches the same durable child row rather than
      // duplicating paid work or creating two competing conclusions.
      dedupeKey: `agent.background_analysis:${payload.taskId}:${agentId}`,
    }, db),
  ));
  return specialistIds;
}

function backgroundContract(agent: PortalAgentProfile): string {
  if (agent.id === 'ceo') {
    return 'This is an asynchronous executive analysis. Complete the requested diagnosis using only the supplied read-only tools. Matching specialists will receive their own bounded, read-only analysis jobs after you finish. Do not claim that they changed data, sent a message, published content, or completed work that requires approval.';
  }
  return `This is an asynchronous analysis delegated by the CEO. You are ${agent.name}. Use only the supplied read-only tools, state evidence and uncertainty clearly, and propose approval-gated next steps. Never create, update, send, publish, invite, pay, or trigger anything.`;
}

/**
 * Durable, tenant-scoped analysis for the CEO or a CEO-selected specialist.
 * Every run re-reads conversation ownership, plan, key and credits. Specialist
 * jobs are limited to registered read tools even if their interactive chat
 * profile normally exposes writes.
 */
export async function runBackgroundPortalAnalysis(
  rawPayload: Record<string, unknown>,
  db: Db = defaultDb,
  job: JobExecutionContext,
): Promise<void> {
  const payload = parsePayload(rawPayload);
  const agent = getPortalAgent(payload.agentId);
  if (!agent) throw new Error('portal_agent.background_analysis: profile is unavailable');

  const [conversationRows, ownerRows] = await Promise.all([
    db.select({ id: aiConversations.id }).from(aiConversations)
      .where(and(eq(aiConversations.id, payload.conversationId), eq(aiConversations.clientId, payload.clientId))).limit(1),
    db.select({ userId: clients.userId }).from(clients).where(eq(clients.id, payload.clientId)).limit(1),
  ]);
  const conversation = conversationRows[0];
  const owner = ownerRows[0];
  if (!conversation || !owner) {
    throw new Error('portal_agent.background_analysis: tenant conversation or owner no longer exists');
  }

  try {
    const task = taskForAgent(agent.id);
    const choice = resolveChoice(task);
    const gate = await checkAiPlanGate({ clientId: payload.clientId, provider: choice.provider });
    if (!gate.allowed) {
      await appendResult(db, payload, gate.message ?? 'El plan actual no permite ejecutar este análisis.', { status: 'not_allowed' });
      return;
    }

    const resolvedKey = await resolveClientApiKey({ clientId: payload.clientId, provider: providerForTask(task) });
    const usingPlatformCredits = resolvedKey.source === 'platform';
    if (usingPlatformCredits && !(await hasCredits(payload.clientId))) {
      const balance = await getBalance(payload.clientId);
      await appendResult(
        db,
        payload,
        `No se ha iniciado el análisis porque no quedan créditos de IA disponibles (${balance.balance} créditos).`,
        { status: 'insufficient_credits' },
      );
      return;
    }

    const agentTools = toolsForBackgroundAgent(agent);
    const result = await withSpan('portal.agent.background', { clientId: payload.clientId, agent: agent.id, attempt: job.attempt }, () =>
      completeAgentLoop({
        task,
        clientId: payload.clientId,
        system: `${buildPortalAgentSystemPrompt(agent)}\n\n## Background-run contract\n${backgroundContract(agent)}`,
        messages: [{ role: 'user', content: payload.task }],
        tools: anthropicToolsToToolSet(agentTools, (name, input) =>
          portalAgentAllowsTool(agentTools, name)
            ? executePortalTool(name, input, payload.clientId, owner.userId, { source: 'assistant' })
            : Promise.resolve({ error: 'tool_not_allowed' }),
        ),
        maxSteps: agent.id === 'ceo' ? 8 : 5,
        maxTokens: agent.id === 'ceo' ? 2_048 : 1_200,
      }),
    );

    const delegatedTo = agent.id === 'ceo' ? await dispatchSpecialists(payload, db) : [];
    const delegationNote = delegatedTo.length > 0
      ? `\n\nHe puesto en marcha análisis de apoyo: ${delegatedTo.map((id) => getPortalAgent(id)?.shortName ?? id).join(', ')}. Sus conclusiones aparecerán aquí cuando finalicen; ningún cambio se aplicará sin aprobación.`
      : '';
    const inputTokens = result.usage.inputTokens ?? 0;
    const outputTokens = result.usage.outputTokens ?? 0;
    await appendResult(
      db,
      payload,
      `${result.text || 'El análisis no ha devuelto conclusiones utilizables.'}${delegationNote}`,
      { status: 'completed', delegatedTo },
      inputTokens,
      outputTokens,
    );

    if (usingPlatformCredits) {
      await deductCredits(payload.clientId, inputTokens + outputTokens, 'ai', `${payload.taskId}:${agent.id}`, `${agent.shortName} background analysis`);
    }
    void recordAiUsage({ clientId: payload.clientId, source: resolvedKey.source, tokens: inputTokens + outputTokens });
  } catch (error) {
    if (job.isFinalAttempt) await appendFinalFailure(db, payload, agent);
    throw error;
  }
}

/** Backwards-compatible job handler for existing CEO queue rows. */
export async function runCeoBackgroundAnalysis(
  rawPayload: Record<string, unknown>,
  db: Db = defaultDb,
  job: JobExecutionContext,
): Promise<void> {
  await runBackgroundPortalAnalysis(rawPayload, db, job);
}
