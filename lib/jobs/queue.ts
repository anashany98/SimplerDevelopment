// Public producer surface for durable internal jobs.
// Kept separate from the worker registry so job handlers can enqueue follow-up
// work without importing the module that dynamically imports those handlers.

import { db as defaultDb } from '@/lib/db';
import { internalJobs, type InternalJobType } from '@/lib/db/schema';

type Db = typeof defaultDb;
type Transaction = Parameters<Parameters<typeof defaultDb.transaction>[0]>[0];

export type JobQueueDatabase = Db | Transaction;

/** Maximum handler executions before a job moves to dead_letter. */
export const MAX_ATTEMPTS = 3;

/** Execution facts that a handler needs without giving it control of job state. */
export interface JobExecutionContext {
  /** One-based: 1 is the first execution attempt. */
  attempt: number;
  /** The current failure would move the job to dead_letter. */
  isFinalAttempt: boolean;
}

export interface EnqueueJobParams {
  /** Tenant that owns the work. Cascade-deletes with the client. */
  clientId: number;
  type: InternalJobType;
  payload: Record<string, unknown>;
  /** Idempotency key, unique table-wide. Convention: `<type>:<entity id>`. */
  dedupeKey?: string;
  /** Earliest time the job may run; used for delayed jobs. */
  runAt?: Date;
}

/**
 * Enqueue a job. Safe to call twice with the same dedupeKey — the second is
 * dropped by the unique index, not by a read-then-write race.
 *
 * Callers should AWAIT this. It is one INSERT; making it fire-and-forget would
 * reintroduce exactly the durability hole the queue exists to close.
 */
export async function enqueueJob(
  params: EnqueueJobParams,
  db: JobQueueDatabase = defaultDb,
): Promise<void> {
  await db
    .insert(internalJobs)
    .values({
      clientId: params.clientId,
      type: params.type,
      payload: params.payload,
      dedupeKey: params.dedupeKey ?? null,
      nextRetryAt: params.runAt ?? null,
    })
    .onConflictDoNothing({ target: internalJobs.dedupeKey });
}
