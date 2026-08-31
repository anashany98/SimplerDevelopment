import { NextResponse } from 'next/server';
import { withCronHealth } from '@/lib/cron-health';
import { db } from '@/lib/db';
import { workflows } from '@/lib/db/schema';
import { and, eq, isNull, lt, or, sql } from 'drizzle-orm';
import { isAuthorizedCron } from '@/lib/cron-auth';
import { enqueueWorkflowRunsForTrigger } from '@/lib/workflows/trigger';
import { shouldFireSchedule, previousFireTime } from '@/lib/automation/workflow-schedule';
import type { WorkflowTriggerConfig } from '@/lib/workflows/types';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Cron: fire visual workflows whose trigger is `schedule`. Runs every minute.
 *
 * For each active workflow with a `schedule` trigger, if its most recent cron
 * slot has just passed (within a 90s window — absorbs Vercel cron jitter) and
 * we haven't already fired for that slot, CAS-claim it by stamping
 * `last_fired_at` and enqueue a run into the same `workflow_run_steps` queue
 * the process-workflow-runs cron drains. That cron then executes the graph
 * (with backoff / retry / dead-letter) as usual.
 *
 * Idempotency: the CAS UPDATE re-checks `last_fired_at < prev`, so two racing
 * ticks (or a duplicate invocation) both compute the same `prev`; only the
 * first claim wins, the second sees last_fired_at already set and claims 0
 * rows. A workflow therefore fires at most once per scheduled slot.
 *
 * Auth: Vercel cron header OR `Authorization: Bearer ${CRON_SECRET}`.
 */
async function _GET(req: Request) {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  const now = new Date();

  // All active workflows whose trigger JSON is { kind: 'schedule', ... }.
  const scheduled = await db
    .select()
    .from(workflows)
    .where(
      and(
        eq(workflows.status, 'active'),
        sql`${workflows.trigger}->>'kind' = 'schedule'`,
      ),
    );

  let fired = 0;
  let skipped = 0;
  const errors: { workflowId: number; message: string }[] = [];

  for (const wf of scheduled) {
    const trigger = wf.trigger as WorkflowTriggerConfig;
    if (trigger.kind !== 'schedule' || !trigger.cron) {
      skipped += 1;
      continue;
    }

    const prev = previousFireTime(trigger.cron, now);
    if (!prev) {
      // Malformed cron — leave the workflow alone; it can never fire.
      skipped += 1;
      continue;
    }

    if (!shouldFireSchedule(trigger.cron, wf.lastFiredAt ?? null, now)) {
      skipped += 1;
      continue;
    }

    const priorLastFiredAt = wf.lastFiredAt;
    const priorUpdatedAt = wf.updatedAt;

    // CAS claim: only the first tick that stamps last_fired_at = prev wins.
    // Re-asserting `last_fired_at < prev` (not just the id) makes racing
    // ticks a no-op instead of a double fire.
    const claimed = await db
      .update(workflows)
      .set({ lastFiredAt: prev, updatedAt: now })
      .where(
        and(
          eq(workflows.id, wf.id),
          or(isNull(workflows.lastFiredAt), lt(workflows.lastFiredAt, prev)),
        ),
      )
      .returning({ id: workflows.id });

    if (claimed.length === 0) {
      skipped += 1;
      continue;
    }

    try {
      await enqueueWorkflowRunsForTrigger(
        wf.clientId,
        { kind: 'schedule', cron: trigger.cron },
        { triggeredAt: now.toISOString() },
        { triggeredBy: 'schedule', workflowIds: [wf.id] },
      );
      fired += 1;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push({ workflowId: wf.id, message });
      // Do not consume a schedule slot until its durable queue record exists.
      // The comparison prevents a failed tick from undoing a newer claim.
      await db.update(workflows).set({
        lastFiredAt: priorLastFiredAt,
        updatedAt: priorUpdatedAt,
      }).where(and(
        eq(workflows.id, wf.id),
        eq(workflows.lastFiredAt, prev),
      )).returning({ id: workflows.id });
    }
  }

  return NextResponse.json(
    {
      success: errors.length === 0,
      scanned: scheduled.length,
      fired,
      skipped,
      errors,
    },
    { status: errors.length === 0 ? 200 : 503 },
  );
}

export const GET = withCronHealth(
  { name: 'api-cron:process-workflow-schedules', area: 'api-cron' },
  _GET,
);
