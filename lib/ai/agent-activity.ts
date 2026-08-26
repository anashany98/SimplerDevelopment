/**
 * Agent activity aggregation for the portal's agent command center.
 *
 * Reads the append-only audit trail (`ai_messages.toolCalls` + token counts)
 * and attributes every executed tool call to the specialist whose domain owns
 * it (`domainOfTool` → agent profile domains). Calls that don't map to a
 * specialist fall through to the `general` supervisor.
 *
 * Read-only — this module never writes; it powers /portal/agents.
 */
import { db } from '@/lib/db';
import { aiConversations, aiMessages } from '@/lib/db/schema';
import { desc, eq } from 'drizzle-orm';
import { domainOfTool } from '@/lib/ai/portal-tools/domains';
import { PORTAL_AGENT_PROFILES } from '@/lib/ai/portal-agents';

export interface AgentActivityStat {
  agentId: string;
  toolCalls: number;
  inputTokens: number;
  outputTokens: number;
  lastActiveAt: Date | null;
}

export interface RecentToolCall {
  messageId: number;
  conversationId: number;
  conversationTitle: string;
  agentId: string;
  toolName: string;
  succeeded: boolean;
  createdAt: Date;
}

export interface AgentActivity {
  /** Per-agent stats, keyed by agent id (all profiles present, zero-filled). */
  stats: Record<string, AgentActivityStat>;
  /** Most recent tool calls across all agents, newest first. */
  recent: RecentToolCall[];
  totalConversations: number;
  totalToolCalls: number;
  totalTokens: number;
}

// First profile that owns a domain wins (profile order = preference order).
const AGENT_FOR_DOMAIN: Record<string, string> = {};
for (const agent of PORTAL_AGENT_PROFILES) {
  for (const domain of agent.domains) {
    if (!(domain in AGENT_FOR_DOMAIN)) AGENT_FOR_DOMAIN[domain] = agent.id;
  }
}

/** Which agent should be credited for a tool call. */
export function agentForTool(toolName: string): string {
  const domain = domainOfTool(toolName);
  return (domain && AGENT_FOR_DOMAIN[domain]) || 'general';
}

/**
 * A tool call failed when its result carries a non-empty `error` (string
 * bodies are JSON-parsed first, mirroring the tool-history enrichment logic).
 */
function toolCallFailed(result: unknown): boolean {
  let parsed = result;
  if (typeof result === 'string') {
    try {
      parsed = JSON.parse(result) as unknown;
    } catch {
      return false;
    }
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return false;
  const error = (parsed as Record<string, unknown>).error;
  return typeof error === 'string' && error.trim().length > 0;
}

export async function getAgentActivity(
  clientId: number,
  limitMessages = 400,
  recentLimit = 30,
): Promise<AgentActivity> {
  const stats: Record<string, AgentActivityStat> = {};
  for (const agent of PORTAL_AGENT_PROFILES) {
    stats[agent.id] = { agentId: agent.id, toolCalls: 0, inputTokens: 0, outputTokens: 0, lastActiveAt: null };
  }

  const [conversationIds, rows] = await Promise.all([
    db
      .select({ id: aiConversations.id })
      .from(aiConversations)
      .where(eq(aiConversations.clientId, clientId)),
    db
      .select({
        messageId: aiMessages.id,
        conversationId: aiMessages.conversationId,
        title: aiConversations.title,
        toolCalls: aiMessages.toolCalls,
        inputTokens: aiMessages.inputTokens,
        outputTokens: aiMessages.outputTokens,
        createdAt: aiMessages.createdAt,
      })
      .from(aiMessages)
      .innerJoin(aiConversations, eq(aiConversations.id, aiMessages.conversationId))
      .where(eq(aiConversations.clientId, clientId))
      .orderBy(desc(aiMessages.createdAt))
      .limit(limitMessages),
  ]);

  const recent: RecentToolCall[] = [];
  let totalToolCalls = 0;
  let totalTokens = 0;

  for (const row of rows) {
    totalTokens += row.inputTokens + row.outputTokens;

    const calls = Array.isArray(row.toolCalls) ? row.toolCalls : [];
    for (const call of calls) {
      const agentId = agentForTool(String(call?.name ?? ''));
      const stat = stats[agentId] ?? stats.general!;
      stat.toolCalls += 1;
      if (stat.lastActiveAt === null || row.createdAt > stat.lastActiveAt) {
        stat.lastActiveAt = row.createdAt;
      }
      totalToolCalls += 1;
      if (recent.length < recentLimit) {
        recent.push({
          messageId: row.messageId,
          conversationId: row.conversationId,
          conversationTitle: row.title ?? 'Sin título',
          agentId,
          toolName: String(call?.name ?? 'unknown'),
          succeeded: !toolCallFailed(call?.result),
          createdAt: row.createdAt,
        });
      }
    }

    // Message tokens are charged to the agent of the message's first tool call
    // (or the supervisor when the message made no tool calls), so per-agent
    // token figures reflect real work instead of dumping everything on
    // `general`.
    if (calls.length > 0) {
      const agentId = agentForTool(String(calls[0]?.name ?? ''));
      const stat = stats[agentId] ?? stats.general!;
      stat.inputTokens += row.inputTokens;
      stat.outputTokens += row.outputTokens;
    } else {
      stats.general!.inputTokens += row.inputTokens;
      stats.general!.outputTokens += row.outputTokens;
    }
  }

  return {
    stats,
    recent,
    totalConversations: conversationIds.length,
    totalToolCalls,
    totalTokens,
  };
}
