/**
 * Workflow schedule helpers — decide when a visual workflow with a
 * `schedule`-kind trigger should fire, and drive the CAS claim that keeps
 * concurrent cron ticks from double-firing it.
 *
 * The process-workflow-schedules cron (app/api/cron/process-workflow-schedules)
 * runs every minute. For each active workflow whose trigger is `schedule` it
 * asks `shouldFireSchedule`: has the cron's most recent slot just passed, and
 * have we not already fired for it? If yes, it CAS-claims the workflow by
 * stamping `last_fired_at` and enqueues a run.
 *
 * Why `prev()` + a window instead of "is now an exact match"? Vercel cron
 * invocations arrive a few seconds late, so an exact `now === slot` test would
 * silently drop every scheduled run. The 90s window absorbs that jitter while
 * the `last_fired_at < prev` predicate (enforced in the CAS UPDATE, not just
 * in this helper) makes a duplicate tick a no-op.
 */

import { CronExpressionParser } from 'cron-parser';

/**
 * How far past a scheduled slot we'll still fire it. 90s absorbs cron jitter
 * (invocations land seconds late) without letting a stale slot fire twice —
 * a slot older than 90s is treated as missed rather than run late.
 */
export const FIRING_WINDOW_MS = 90_000;

/**
 * Returns the most recent cron fire time strictly before `now`, or null if
 * the expression is malformed.
 */
export function previousFireTime(
  cron: string,
  now: Date = new Date(),
): Date | null {
  try {
    const interval = CronExpressionParser.parse(cron, {
      currentDate: now,
      tz: 'UTC',
    });
    return interval.prev().toDate();
  } catch {
    return null;
  }
}

/**
 * True when the workflow's schedule slot has just passed (within the firing
 * window) and we haven't already fired for that slot.
 *
 * `lastFiredAt` is the workflow's `last_fired_at` column — the timestamp of
 * the slot we last claimed. Passing it here makes the decision idempotent
 * across ticks: once a slot is claimed, later ticks in the same window see
 * `prev <= lastFiredAt` and skip.
 *
 * Note: the cron route ALSO re-checks `last_fired_at < prev` inside its CAS
 * UPDATE, so two racing ticks can't both pass this check and double-fire.
 */
export function shouldFireSchedule(
  cron: string,
  lastFiredAt: Date | null,
  now: Date = new Date(),
): boolean {
  const prev = previousFireTime(cron, now);
  if (!prev) return false;

  const elapsedMs = now.getTime() - prev.getTime();
  if (elapsedMs < 0 || elapsedMs > FIRING_WINDOW_MS) return false;
  if (lastFiredAt && prev.getTime() <= lastFiredAt.getTime()) return false;
  return true;
}
