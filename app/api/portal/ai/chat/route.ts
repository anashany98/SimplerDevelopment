import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { aiConversations, aiMessages } from '@/lib/db/schema';
import { getPortalClient } from '@/lib/portal-client';
import { authorizePortal, isAuthError } from '@/lib/portal-auth';
import { eq, asc, sql } from 'drizzle-orm';
// Deliberate carve-out from the lib/ai/llm.ts provider seam: this route runs
// a Haiku intent-router pass and then streams the tool-use loop directly, and
// that streaming shape hasn't been ported to the seam yet. Don't route this
// through lib/ai/llm.ts without also porting the streaming path.
import Anthropic from '@anthropic-ai/sdk';
import { PORTAL_TOOLS, executePortalTool } from '@/lib/ai/portal-tools';
import { classifyPortalRequest } from '@/lib/ai/portal-tools/classifier';
import { toolsForDomains, domainsOfToolCalls } from '@/lib/ai/portal-tools/domains';
import { withSpan, startSpan } from '@/lib/ai/tracer';
import { hasCredits, deductCredits, getBalance } from '@/lib/ai-credits';
import { resolveClientApiKey } from '@/lib/ai/resolve-client-key';
import { recordAiUsage } from '@/lib/ai/audit';
import { checkAiPlanGate } from '@/lib/ai/plan-gate';
import { buildPortalAgentSystemPrompt } from '@/lib/ai/portal-chat-prompt';
import { sanitizeToolResult } from '@/lib/ai/brain-tools/sanitizer';
import { portalAgentAllowsTool, resolvePortalAgentTools } from '@/lib/ai/portal-agent-tools';
import { anthropicToolsToToolSet, completeAgentLoop } from '@/lib/ai/agent-loop';
import { resolveChoice } from '@/lib/ai/models';
import {
  enrichPortalHistoryContent,
  portalToolCallSucceeded,
} from '@/lib/ai/portal-tool-history';
import type { ModelMessage } from 'ai';

// Model routing: a cheap Haiku classifier decides which model runs the loop.
const HAIKU = 'claude-haiku-4-5-20251001';
const SONNET = 'claude-sonnet-4-6';

// Intent router rollout (ADR agent-topology-router-not-domain-mesh):
//   'shadow' → measure router accuracy/latency; loop still gets ALL tools
//              (zero capability risk on this client-facing, billing route).
//   'active' → hand the loop only the routed domain subset (token savings).
//
// Gated by env (PORTAL_ROUTER_MODE, default 'shadow') so the operator can flip
// to 'active' — and roll back instantly — without a deploy, once the shadow
// miss-rate (portal.route spans / response data.router) is acceptably low.
function resolveRouterMode(): 'shadow' | 'active' {
  return process.env.PORTAL_ROUTER_MODE === 'active' ? 'active' : 'shadow';
}

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

    // Service access check
    const authResult = await authorizePortal({
      action: 'write',
      requireService: 'ai',
    });
    if (isAuthError(authResult)) return authResult.response;

    const userId = parseInt(session.user.id, 10);
    const role = (session.user as { role?: string })?.role;
    const isStaff = role === 'admin' || role === 'employee';

    const client = await getPortalClient(userId);
    if (!client) return NextResponse.json({ success: false, message: 'Client not found' }, { status: 404 });

    // Staff can't use the client chat widget — EXCEPT when the staff user IS
    // the owner of the resolved client (solo-operator deployments seed their
    // one account as role='admin' and still need the assistant).
    if (isStaff && client.userId !== userId) {
      return NextResponse.json({ success: false, message: 'Staff do not have a client portal chat.' }, { status: 403 });
    }

    const { message, conversationId, agentId } = await req.json();
    if (!message?.trim()) return NextResponse.json({ success: false, message: 'message is required' }, { status: 400 });

    // The client sends only a stable profile ID. The server owns the actual
    // identity, instructions and tool boundary; arbitrary client-authored
    // prompts or tool lists are never accepted.
    const resolvedAgent = resolvePortalAgentTools(agentId ?? 'general', PORTAL_TOOLS);
    if (!resolvedAgent) {
      return NextResponse.json(
        {
          success: false,
          error: 'invalid_agent',
          message: 'Unknown AI agent.',
        },
        { status: 400 },
      );
    }
    const { agent, tools: agentTools } = resolvedAgent;

    // UAG-003: contextual specialist sessions default to the safe posture —
    // high-blast-radius writes stage for approval. Legacy callers that do not
    // send agentId keep the tenant's explicit setting during rollout.
    const approvalArmed = typeof agentId === 'string' || client.aiChatRequiresApproval;
    const gateCtx = approvalArmed
      ? {
          userId,
          client,
          scopes: [] as string[],
          keyId: null,
          credentialKind: null,
          requireCmsApproval: true,
        }
      : undefined;

    // Plan-gate (currently a pass-through / extension point — post
    // BYOK-inversion, checkAiPlanGate always returns { allowed: true } for
    // every tier; kept as a call site for future per-tier/per-provider
    // gating). See lib/ai/plan-gate.ts. This is NOT the old "Starter without
    // BYOK is blocked" behavior — that rule no longer exists.
    const chatChoice = resolveChoice('chat');
    const gate = await checkAiPlanGate({
      clientId: client.id,
      provider: chatChoice.provider,
    });
    if (!gate.allowed) {
      return NextResponse.json(
        {
          success: false,
          message: gate.message ?? 'AI access is not available on the current plan.',
          reason: gate.reason,
        },
        { status: 402 },
      );
    }

    // Resolve which key to use (BYOK > platform). Cached per request via the
    // 60s in-memory cache inside resolveClientApiKey.
    const resolved = await resolveClientApiKey({
      clientId: client.id,
      provider: chatChoice.provider,
    });
    const anthropic = chatChoice.provider === 'anthropic' ? new Anthropic({ apiKey: resolved.key }) : null;
    const openAiBaseUrl = process.env.OPENAI_BASE_URL ?? '';
    const isLocalOpenAi = chatChoice.provider === 'openai' && /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?(?:\/|$)/i.test(openAiBaseUrl);
    const meterPlatformCredits = resolved.source === 'platform' && !isLocalOpenAi;

    // Credit balance check only matters for platform-keyed calls. BYOK clients
    // pay their provider directly so we don't gate on internal credits.
    if (meterPlatformCredits) {
      const canProceed = await hasCredits(client.id);
      if (!canProceed) {
        const bal = await getBalance(client.id);
        return NextResponse.json(
          {
            success: false,
            message: 'Insufficient AI credits. Purchase more credits, enable pay-as-you-go, or add a BYOK key in Settings → API Keys.',
            creditsRemaining: bal.balance,
          },
          { status: 402 },
        );
      }
    }

    // Get or create conversation
    let convId = conversationId as number | undefined;
    if (!convId) {
      // Auto-title from first message (truncated)
      const title = message.trim().slice(0, 80);
      const [conv] = await db
        .insert(aiConversations)
        .values({
          clientId: client.id,
          title,
        })
        .returning();
      convId = conv.id;
    } else {
      // Verify this conversation belongs to this client
      const [conv] = await db.select().from(aiConversations).where(eq(aiConversations.id, convId)).limit(1);
      if (!conv || conv.clientId !== client.id) {
        return NextResponse.json({ success: false, message: 'Conversation not found' }, { status: 404 });
      }
    }

    // Load history
    const history = await db.select().from(aiMessages).where(eq(aiMessages.conversationId, convId)).orderBy(asc(aiMessages.createdAt));

    // Build Anthropic messages array from history
    const anthropicMessages: Anthropic.MessageParam[] = history.map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: enrichPortalHistoryContent(m.role, m.content, m.toolCalls),
    }));

    // Append new user message
    anthropicMessages.push({ role: 'user', content: message.trim() });
    const portableMessages: ModelMessage[] = [
      ...history.map((item) => ({
        role: item.role as 'user' | 'assistant',
        content: enrichPortalHistoryContent(item.role, item.content, item.toolCalls),
      })),
      { role: 'user', content: message.trim() },
    ];

    // Cheap Haiku classifier does double duty in ONE call (no extra hop):
    //  - complexity → model routing (simple → Haiku, complex → Sonnet)
    //  - domains    → intent routing (which tool subset the request needs)
    const classification = anthropic
      ? await withSpan('portal.classify', { clientId: client.id }, () => classifyPortalRequest(message.trim(), anthropic))
      : {
          complexity: 'complex' as const,
          domains: [...agent.domains],
          reasoning: 'deterministic specialist routing for provider-compatible loop',
          inputTokens: 0,
          outputTokens: 0,
        };
    const loopModel = anthropic ? (classification.complexity === 'simple' ? HAIKU : SONNET) : chatChoice.model;

    // Intent classification: the subset the router would hand the loop. In 'shadow'
    // mode we still pass the full surface and only record what we *would* have
    // selected; in 'active' mode the loop actually gets just this subset.
    // Empty domains → toolsForDomains returns the full set (fail-open).
    const ROUTER_MODE = resolveRouterMode();
    const routedTools = toolsForDomains(classification.domains, agentTools);
    // Agent specialization stays enforced in both modes. Shadow mode only
    // controls the classifier's second-stage narrowing inside that hard
    // boundary.
    const loopTools = ROUTER_MODE === 'active' ? routedTools : agentTools;
    const agentSystemPrompt = buildPortalAgentSystemPrompt(agent);

    // Agentic tool loop. Seed token totals with the classifier spend so
    // platform-keyed credit deduction stays accurate.
    let finalText = '';
    const allToolCalls: {
      name: string;
      input: Record<string, unknown>;
      result: unknown;
    }[] = [];
    let totalInputTokens = classification.inputTokens;
    let totalOutputTokens = classification.outputTokens;

    let currentMessages = [...anthropicMessages];

    // Guardrails to prevent runaway agentic loops / tool-call storms.
    const MAX_LOOPS = 8;
    const MAX_TOOL_CALLS = 20;
    let loopCount = 0;
    let toolCallCount = 0;
    let hitLoopCap = false;

    if (anthropic) {
      while (loopCount < MAX_LOOPS) {
        loopCount++;
        const response = await anthropic.messages.create({
          model: loopModel,
          max_tokens: 2048,
          system: agentSystemPrompt,
          tools: loopTools,
          messages: currentMessages,
        });

        totalInputTokens += response.usage.input_tokens;
        totalOutputTokens += response.usage.output_tokens;

        if (response.stop_reason === 'tool_use') {
          const toolUseBlocks = response.content.filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use');

          toolCallCount += toolUseBlocks.length;
          if (toolCallCount > MAX_TOOL_CALLS) {
            return NextResponse.json({ success: false, error: 'tool_call_cap_exceeded' }, { status: 400 });
          }

          const toolResults: Anthropic.ToolResultBlockParam[] = [];
          for (const block of toolUseBlocks) {
            const result = portalAgentAllowsTool(agentTools, block.name)
              ? await withSpan('portal.tool', { tool: block.name, clientId: client.id, agent: agent.id }, () =>
                  executePortalTool(block.name, block.input as Record<string, unknown>, client.id, userId, { source: 'assistant', gate: gateCtx }),
                )
              : {
                  error: 'tool_not_allowed',
                  message: `The ${agent.name} cannot use ${block.name}. Switch to the appropriate specialist.`,
                };
            allToolCalls.push({
              name: block.name,
              input: block.input as Record<string, unknown>,
              result,
            });
            toolResults.push({
              type: 'tool_result',
              tool_use_id: block.id,
              content: sanitizeToolResult(JSON.stringify(result)),
            });
          }

          currentMessages = [...currentMessages, { role: 'assistant', content: response.content }, { role: 'user', content: toolResults }];

          if (loopCount >= MAX_LOOPS) {
            hitLoopCap = true;
            finalText = response.content
              .filter((b): b is Anthropic.TextBlock => b.type === 'text')
              .map((b) => b.text)
              .join('');
            break;
          }
        } else {
          // end_turn or max_tokens — extract text
          finalText = response.content
            .filter((b): b is Anthropic.TextBlock => b.type === 'text')
            .map((b) => b.text)
            .join('');
          break;
        }
      }

      if (hitLoopCap) {
        return NextResponse.json({ success: false, error: 'loop_cap_exceeded' }, { status: 400 });
      }
    } else {
      const portableResult = await withSpan('portal.loop', { clientId: client.id, agent: agent.id, provider: chatChoice.provider }, () =>
        completeAgentLoop({
          task: 'chat',
          clientId: client.id,
          system: agentSystemPrompt,
          messages: portableMessages,
          tools: anthropicToolsToToolSet(loopTools, (name, input) =>
            portalAgentAllowsTool(agentTools, name)
              ? withSpan('portal.tool', { tool: name, clientId: client.id, agent: agent.id }, () =>
                  executePortalTool(name, input, client.id, userId, {
                    source: 'assistant',
                    gate: gateCtx,
                  }),
                )
              : Promise.resolve({
                  error: 'tool_not_allowed',
                  message: `The ${agent.name} cannot use ${name}. Switch to the appropriate specialist.`,
                }),
          ),
          maxSteps: MAX_LOOPS,
          maxTokens: 2048,
        }),
      );

      finalText = portableResult.text;
      totalInputTokens += portableResult.usage.inputTokens ?? 0;
      totalOutputTokens += portableResult.usage.outputTokens ?? 0;
      allToolCalls.push(
        ...portableResult.steps.flatMap((step) =>
          step.toolCalls.map((toolCall) => {
            const toolResult = step.toolResults.find((result) => result.toolCallId === toolCall.toolCallId);
            return {
              name: toolCall.toolName,
              input: toolCall.input as Record<string, unknown>,
              result: toolResult?.output ?? null,
            };
          }),
        ),
      );
    }

    // Intent-router accuracy signal. Compare the domains the router predicted
    // against the domains the loop's tool calls actually touched. A "miss" is
    // a tool the model needed from a domain the router did NOT select — in
    // 'active' mode that tool would have been unavailable. This is the data the
    // ADR gate wants before flipping ROUTER_MODE to 'active'.
    const usedDomains = domainsOfToolCalls(allToolCalls);
    const predicted = new Set(classification.domains);
    const routerMisses = usedDomains.filter((d) => !predicted.has(d));
    startSpan('portal.route', {
      clientId: client.id,
      mode: ROUTER_MODE,
      agent: agent.id,
      predictedDomains: classification.domains.join(',') || '(none)',
      usedDomains: usedDomains.join(',') || '(none)',
      routedToolCount: routedTools.length,
      totalToolCount: agentTools.length,
      misses: routerMisses.join(',') || '(none)',
      hit: routerMisses.length === 0,
    }).end();

    // Save user message
    await db.insert(aiMessages).values({
      conversationId: convId,
      role: 'user',
      content: message.trim(),
      inputTokens: 0,
      outputTokens: 0,
    });

    // Persist the selected specialist with every tool call. Agent profiles can
    // intentionally share domains (for example, sales and retention both use
    // CRM), so inferring activity from a tool name would misattribute it.
    const loggedToolCalls = allToolCalls.map((toolCall) => ({ ...toolCall, agentId: agent.id }));

    // Save assistant message (with tool calls logged)
    await db.insert(aiMessages).values({
      conversationId: convId,
      role: 'assistant',
      content: finalText,
      toolCalls: loggedToolCalls.length > 0 ? loggedToolCalls : null,
      inputTokens: totalInputTokens,
      outputTokens: totalOutputTokens,
    });

    // Update conversation token totals + updatedAt
    await db
      .update(aiConversations)
      .set({
        totalInputTokens: sql`${aiConversations.totalInputTokens} + ${totalInputTokens}`,
        totalOutputTokens: sql`${aiConversations.totalOutputTokens} + ${totalOutputTokens}`,
        updatedAt: new Date(),
      })
      .where(eq(aiConversations.id, convId));

    // Deduct AI credits — only for platform-keyed calls. BYOK skips internal
    // credit deduction (the client paid their own provider directly).
    const totalTokens = totalInputTokens + totalOutputTokens;
    let creditsRemaining: number | null = null;
    if (meterPlatformCredits) {
      const creditResult = await deductCredits(client.id, totalTokens, 'ai', String(convId), `Chat conversation #${convId}`);
      creditsRemaining = creditResult.newBalance;
    }

    // Audit row for the call (best-effort).
    void recordAiUsage({
      clientId: client.id,
      source: resolved.source,
      tokens: totalTokens,
    });

    return NextResponse.json({
      success: true,
      data: {
        conversationId: convId,
        reply: finalText,
        toolCalls: allToolCalls.map((tc) => ({
          name: tc.name,
          input: tc.input,
          success: portalToolCallSucceeded(tc.result),
        })),
        tokensUsed: totalTokens,
        keySource: resolved.source,
        model: loopModel,
        agent: { id: agent.id, name: agent.name },
        router: {
          mode: ROUTER_MODE,
          domains: classification.domains,
          routedToolCount: routedTools.length,
          totalToolCount: agentTools.length,
          misses: routerMisses,
        },
        creditsRemaining,
      },
    });
  } catch (err) {
    console.error('[POST /api/portal/ai/chat]', err);
    return NextResponse.json({ success: false, message: 'Internal server error' }, { status: 500 });
  }
}
