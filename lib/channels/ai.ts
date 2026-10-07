import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { generateText } from 'ai';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  channelAiConfigs,
  channelAiRuns,
  chatConversations,
  chatMessages,
  conversationAuditLogs,
} from '@/lib/db/schema';
import { searchBrain } from '@/lib/brain/search';
import { getModelForTask } from '@/lib/ai/models';
import { checkAiPlanGate } from '@/lib/ai/plan-gate';
import { recordAiUsage, type AiUsageSource } from '@/lib/ai/audit';
import { withSpan } from '@/lib/ai/tracer';
import { processOutboxItem, queueOutboundMessage } from './service';
import { redactProviderError } from './security';
import { validateAiBaseUrl } from './ai-url';

const decisionSchema = z.object({
  intent: z.string().min(1).max(100),
  action: z.enum(['answer', 'draft', 'handoff', 'ask_clarification']),
  answer: z.string().min(1).max(8_000),
  confidence: z.number().min(0).max(1),
  knowledgeRequired: z.boolean(),
  citations: z.array(z.string()).max(8),
  suggestedTags: z.array(z.string().max(50)).max(8),
  bookingRequested: z.boolean(),
  rationale: z.string().max(1_000),
});

/**
 * Pull the first balanced JSON object out of a model reply. Local chat models
 * often wrap JSON in prose or a ```json fence, so slice the outer braces rather
 * than JSON.parse the whole string. Throws if no object is found.
 */
function extractJsonObject(raw: string): Record<string, unknown> {
  const start = raw.indexOf('{');
  if (start === -1) throw new Error('AI returned no JSON object');
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < raw.length; i++) {
    const ch = raw[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === '\\') esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return JSON.parse(raw.slice(start, i + 1));
    }
  }
  throw new Error('AI returned malformed JSON (unbalanced braces)');
}

export type OmnichannelAiDecision = z.infer<typeof decisionSchema> & {
  grounded: boolean;
  autoSend: boolean;
  evidence: Array<{ title: string; url: string; score: number }>;
};

async function decide(args: {
  clientId: number;
  message: string;
  conversationMode: string;
  config: typeof channelAiConfigs.$inferSelect;
}): Promise<{ decision: OmnichannelAiDecision; provider: string; model: string; inputTokens: number; outputTokens: number; source: AiUsageSource }> {
  const brain = await searchBrain(args.clientId, args.message, { limit: 6, perTypeLimit: 3 }).catch(() => ({ query: args.message, total: 0, hits: [] }));
  const evidence = brain.hits.map((hit) => ({ title: hit.title, snippet: hit.snippet, url: hit.url, score: hit.score }));
  let model;
  let provider: string;
  let modelName: string;
  let source: AiUsageSource;
  if (args.config.provider === 'openai-compatible') {
    if (!args.config.baseUrl || !args.config.model || !args.config.apiKey) throw new Error('OpenAI-compatible AI configuration is incomplete');
    const baseURL = validateAiBaseUrl(args.config.baseUrl).toString();
    model = createOpenAICompatible({ name: 'tenant-openai-compatible', apiKey: args.config.apiKey, baseURL }).chatModel(args.config.model);
    provider = 'openai-compatible';
    modelName = args.config.model;
    source = 'byok';
  } else {
    const resolved = await getModelForTask('omnichannelReply', args.clientId);
    model = resolved.model;
    provider = resolved.choice.provider;
    modelName = resolved.choice.model;
    source = resolved.keySource;
  }
  const gate = await checkAiPlanGate({ clientId: args.clientId, provider: provider === 'anthropic' ? 'anthropic' : 'openai' });
  if (!gate.allowed) throw new Error('AI is not enabled for this subscription');

  // generateText (not generateObject): the AI SDK's object output for
  // OpenAI-compatible providers sends response_format.type='json_object', which
  // local servers like LM Studio reject with 400 ("must be 'json_schema' or
  // 'text'"). A forced-JSON prompt + tolerant parse works across every provider
  // the seam supports (Anthropic, OpenAI, HF, local).
  const jsonContract = 'Return ONLY a single JSON object, no prose, matching exactly: {"intent":string<=100,"action":"answer|draft|handoff|ask_clarification","answer":string,"confidence":0..1,"knowledgeRequired":bool,"citations":string[],"suggestedTags":string[],"bookingRequested":bool,"rationale":string}';
  const text = await generateText({
    model,
    temperature: 0.1,
    maxOutputTokens: 1_200,
    system: [
      'You are the support decision layer for a multi-tenant business inbox.',
      jsonContract,
      'Return a concise, helpful response in the customer language.',
      'Never claim business facts not present in EVIDENCE. If evidence is missing or contradictory, hand off or ask a clarification.',
      'Never promise refunds, legal commitments, policy exceptions or confirmed bookings. Those require deterministic tools or a human.',
      'Citations must be exact URLs from EVIDENCE. Set knowledgeRequired=false only for greetings, acknowledgements or simple clarification questions.',
      args.config.systemPrompt ?? '',
    ].filter(Boolean).join('\n'),
    prompt: `MODE: ${args.conversationMode}\nCUSTOMER MESSAGE:\n${args.message}\n\nEVIDENCE:\n${JSON.stringify(evidence)}`,
  });
  const decision = decisionSchema.parse(extractJsonObject(text.text));
  const allowedUrls = new Set(evidence.map((item) => item.url));
  const citationsValid = decision.citations.every((url) => allowedUrls.has(url));
  // The model cannot opt out of grounding. Even a seemingly harmless greeting
  // must stay a draft unless it is tied to retrieved tenant evidence; otherwise
  // `knowledgeRequired=false` becomes an unverified auto-send bypass.
  const grounded = evidence.length > 0 && citationsValid && decision.citations.length > 0;
  const threshold = Math.max(args.config.autoSendMinConfidence / 100, args.conversationMode === 'hybrid' ? 0.97 : 0);
  const autoSend = args.config.enabled && grounded && decision.action === 'answer' && decision.confidence >= threshold;
  const inputTokens = text.usage?.inputTokens ?? 0;
  const outputTokens = text.usage?.outputTokens ?? 0;
  return {
    decision: {
      ...decision,
      grounded,
      autoSend,
      evidence: evidence.map(({ title, url, score }) => ({ title, url, score })),
    },
    provider,
    model: modelName,
    inputTokens,
    outputTokens,
    source,
  };
}

export async function processConversationAiRun(clientId: number, runId: number): Promise<'sent' | 'review' | 'skipped' | 'retry' | 'failed'> {
  const [run] = await db.select().from(channelAiRuns).where(and(
    eq(channelAiRuns.id, runId), eq(channelAiRuns.clientId, clientId),
  )).limit(1);
  if (!run || !['pending', 'retry'].includes(run.status)) throw new Error('AI run is unavailable');
  const claimed = await db.update(channelAiRuns).set({ status: 'running', startedAt: new Date(), attempts: run.attempts + 1 }).where(and(
    eq(channelAiRuns.id, run.id), eq(channelAiRuns.clientId, clientId), eq(channelAiRuns.status, run.status),
  )).returning({ id: channelAiRuns.id });
  if (claimed.length === 0) throw new Error('AI run was claimed by another worker');

  const [[config], [conversation], [message]] = await Promise.all([
    db.select().from(channelAiConfigs).where(eq(channelAiConfigs.clientId, clientId)).limit(1),
    db.select().from(chatConversations).where(and(eq(chatConversations.id, run.conversationId), eq(chatConversations.clientId, clientId))).limit(1),
    db.select().from(chatMessages).where(and(eq(chatMessages.id, run.messageId), eq(chatMessages.clientId, clientId))).limit(1),
  ]);
  if (!config?.enabled || !conversation || !message || !['ai', 'hybrid'].includes(conversation.aiMode)) {
    await db.update(channelAiRuns).set({ status: 'skipped', completedAt: new Date() }).where(and(
      eq(channelAiRuns.id, run.id), eq(channelAiRuns.clientId, clientId),
    ));
    return 'skipped';
  }

  try {
    const outcome = await withSpan('portal.omnichannel.ai_decision', {
      clientId, conversationId: conversation.id, runId: run.id, channel: conversation.channel,
    }, () => decide({ clientId, message: message.body, conversationMode: conversation.aiMode, config }));
    // Billing/audit is part of the durable result, not best-effort background
    // work that may disappear when a serverless invocation ends.
    await recordAiUsage({ clientId, source: outcome.source, tokens: outcome.inputTokens + outcome.outputTokens });
    let status = 'review';
    if (outcome.decision.action === 'handoff') {
      await db.update(chatConversations).set({ aiMode: 'human', priority: 'high', updatedAt: new Date() }).where(and(
        eq(chatConversations.id, conversation.id), eq(chatConversations.clientId, clientId),
      ));
    } else if (outcome.decision.autoSend) {
      const queued = await queueOutboundMessage({
        clientId, conversationId: conversation.id, text: outcome.decision.answer,
        idempotencyKey: `ai-run:${run.id}`, correlationId: `ai-run:${run.id}`,
      });
      void processOutboxItem(clientId, queued.outboxId).catch(() => {});
      status = 'sent';
    }
    await db.transaction(async (tx) => {
      await tx.update(channelAiRuns).set({
        status, decision: outcome.decision, provider: outcome.provider, model: outcome.model,
        inputTokens: outcome.inputTokens, outputTokens: outcome.outputTokens, completedAt: new Date(), lastError: null,
      }).where(and(eq(channelAiRuns.id, run.id), eq(channelAiRuns.clientId, clientId)));
      await tx.insert(conversationAuditLogs).values({
        clientId, conversationId: conversation.id, actorKind: 'ai', action: `ai.${status}`,
        correlationId: `ai-run:${run.id}`, details: {
          runId: run.id, confidence: outcome.decision.confidence, grounded: outcome.decision.grounded,
          action: outcome.decision.action, provider: outcome.provider, model: outcome.model,
        },
      });
    });
    return status === 'sent' ? 'sent' : 'review';
  } catch (error) {
    const attempts = run.attempts + 1;
    const failed = attempts >= 3;
    await db.update(channelAiRuns).set({
      status: failed ? 'failed' : 'retry', lastError: redactProviderError(error),
      nextAttemptAt: new Date(Date.now() + Math.min(4 ** attempts * 1_000, 30 * 60 * 1_000)),
      completedAt: failed ? new Date() : null,
    }).where(and(eq(channelAiRuns.id, run.id), eq(channelAiRuns.clientId, clientId)));
    return failed ? 'failed' : 'retry';
  }
}
