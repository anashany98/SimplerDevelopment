/**
 * Read-only tenant-scoped history for CEO-coordinated background analysis.
 *
 * This is intentionally separate from agent activity, which is reconstructed
 * from chat messages. Queue state answers the operational question "what is
 * still running or needs attention?" without exposing jobs from another
 * workspace.
 */
import { and, desc, eq, inArray } from 'drizzle-orm';
import { db } from '@/lib/db';
import { internalJobs, type InternalJobStatus } from '@/lib/db/schema';
import { getPortalAgent, type PortalAgentId } from '@/lib/ai/portal-agents';

const BACKGROUND_ANALYSIS_TYPES = ['ceo.background_analysis', 'agent.background_analysis'] as const;

export interface BackgroundAgentRun {
  id: number;
  agentId: PortalAgentId;
  agentName: string;
  task: string;
  status: InternalJobStatus;
  attemptCount: number;
  createdAt: Date;
  processedAt: Date | null;
  nextRetryAt: Date | null;
}

function taskFromPayload(payload: Record<string, unknown>): string {
  const task = payload.task;
  if (typeof task !== 'string' || !task.trim()) return 'Análisis sin descripción disponible';
  return task.trim().slice(0, 220);
}

function agentFromPayload(type: typeof BACKGROUND_ANALYSIS_TYPES[number], payload: Record<string, unknown>): PortalAgentId {
  const selected = getPortalAgent(payload.agentId);
  if (selected) return selected.id;
  return type === 'ceo.background_analysis' ? 'ceo' : 'general';
}

export function mapBackgroundAgentRun(row: {
  id: number;
  type: typeof BACKGROUND_ANALYSIS_TYPES[number];
  payload: Record<string, unknown>;
  status: InternalJobStatus;
  attemptCount: number;
  createdAt: Date;
  processedAt: Date | null;
  nextRetryAt: Date | null;
}): BackgroundAgentRun {
  const agentId = agentFromPayload(row.type, row.payload ?? {});
  return {
    id: row.id,
    agentId,
    agentName: getPortalAgent(agentId)?.shortName ?? agentId,
    task: taskFromPayload(row.payload ?? {}),
    status: row.status,
    attemptCount: row.attemptCount,
    createdAt: row.createdAt,
    processedAt: row.processedAt,
    nextRetryAt: row.nextRetryAt,
  };
}

/** Returns only the current workspace's most recent CEO/specialist jobs. */
export async function getBackgroundAgentRuns(clientId: number, limit = 12): Promise<BackgroundAgentRun[]> {
  const rows = await db
    .select({
      id: internalJobs.id,
      type: internalJobs.type,
      payload: internalJobs.payload,
      status: internalJobs.status,
      attemptCount: internalJobs.attemptCount,
      createdAt: internalJobs.createdAt,
      processedAt: internalJobs.processedAt,
      nextRetryAt: internalJobs.nextRetryAt,
    })
    .from(internalJobs)
    .where(and(
      eq(internalJobs.clientId, clientId),
      inArray(internalJobs.type, BACKGROUND_ANALYSIS_TYPES),
    ))
    .orderBy(desc(internalJobs.createdAt))
    .limit(Math.min(Math.max(limit, 1), 50));

  return rows.map((row) => mapBackgroundAgentRun({
    ...row,
    type: row.type as typeof BACKGROUND_ANALYSIS_TYPES[number],
    payload: row.payload ?? {},
  }));
}
