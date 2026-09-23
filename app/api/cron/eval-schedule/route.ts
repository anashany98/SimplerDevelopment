import { NextResponse } from 'next/server';
import { withCronHealth } from '@/lib/cron-health';
import { db } from '@/lib/db';
import { promptRegistry } from '@/lib/db/schema';
import { isNotNull } from 'drizzle-orm';
import { CronExpressionParser } from 'cron-parser';
import { enqueueScheduledEvalRun } from '@/lib/ai/evals/job';
import { isAuthorizedCron } from '@/lib/cron-auth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Cron: enqueue eval runs for prompts on an opt-in schedule.
 *
 * For each prompt with a `scheduleCron`, we ask cron-parser for the most recent
 * fire time at or before now (`prev()`). The prompt is DUE if it has no prior
 * `trigger='schedule'` run, or its latest scheduled run predates that fire time
 * — i.e. a scheduled tick has elapsed since we last enqueued. We enqueue a run
 * for the ACTIVE version (trigger='schedule'); the eval-runs queue worker drains
 * it. `eval_runs` itself is the bookkeeping, so no extra "lastScheduledAt" column.
 *
 * Idempotent within a fire window: re-running this tick before the next cron
 * boundary finds the just-enqueued schedule run newer than `prev()` and skips.
 *
 * Auth: `Authorization: Bearer ${CRON_SECRET}`; caller-supplied Vercel headers are not trusted.
 * Suggested schedule: every few minutes.
 */
async function _GET(req: Request) {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  const now = new Date();

  const scheduled = await db
    .select()
    .from(promptRegistry)
    .where(isNotNull(promptRegistry.scheduleCron));

  let scanned = 0;
  let enqueued = 0;
  let skipped = 0;
  const errors: { promptId: number; message: string }[] = [];
  const fired: { promptId: number; runId: number }[] = [];

  for (const prompt of scheduled) {
    scanned += 1;
    if (!prompt.scheduleCron || !prompt.activeVersionId) {
      skipped += 1;
      continue;
    }

    let prevFire: Date;
    try {
      prevFire = CronExpressionParser.parse(prompt.scheduleCron, { currentDate: now, tz: 'UTC' })
        .prev()
        .toDate();
    } catch (err) {
      // Malformed cron — skip rather than fail the whole tick.
      errors.push({ promptId: prompt.id, message: err instanceof Error ? err.message : String(err) });
      continue;
    }

    try {
      const runId = await enqueueScheduledEvalRun({
        suiteId: prompt.key,
        promptId: prompt.id,
        promptVersionId: prompt.activeVersionId,
        scheduledFireAt: prevFire,
      });
      if (runId === null) {
        skipped += 1; // another tick already enqueued this fire window
        continue;
      }
      enqueued += 1;
      fired.push({ promptId: prompt.id, runId });
    } catch (err) {
      errors.push({ promptId: prompt.id, message: err instanceof Error ? err.message : String(err) });
    }
  }

  return NextResponse.json({ success: true, data: { scanned, enqueued, skipped, fired, errors } });
}

export const GET = withCronHealth({ name: 'api-cron:eval-schedule', area: 'api-cron' }, _GET);
