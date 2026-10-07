-- WF-002: track last scheduled-fire time on workflows.
--
-- The new process-workflow-schedules cron (which maps the visual workflow
-- `schedule` trigger onto the real workflow_run_steps queue) needs a way to
-- claim a workflow for a given minute WITHOUT double-firing under concurrent
-- cron ticks. The automation_rules scheduler solves this by advancing a
-- precomputed next_run_at with a CAS update; workflows have no such column,
-- so this adds last_fired_at and lets the cron claim with
-- `... WHERE last_fired_at < now() OR last_fired_at IS NULL`, then stamp it.
--
-- Additive only (CREATE/ALTER IF NOT EXISTS). Apply to metro BY HAND at
-- merge, same as the other 9xxx manual migrations:
--   psql "$METRO" -v ON_ERROR_STOP=1 -f drizzle/9026_workflows_last_fired_at_manual.sql
-- Re-runnable via IF NOT EXISTS; local dev applies it automatically through
-- scripts/apply-local-manual-migrations.ts.

ALTER TABLE workflows ADD COLUMN IF NOT EXISTS last_fired_at timestamp;