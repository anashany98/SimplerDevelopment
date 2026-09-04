# ADR automation-vs-workflows-boundary

Date: 2026-09-04
Status: accepted

## Context

Two execution paths overlap: `lib/automation/engine.ts` (event-driven rules:
match trigger → evaluate conditions → execute portal-tool actions inline) and
`lib/workflows/` (visual canvas graphs with a durable run queue drained by
`app/api/cron/process-workflow-runs`). The automation engine forwards live
events into the workflow system. The sync DFS runner `runWorkflow()` in
`lib/workflows/runtime.ts` is explicitly not production-grade (no retries, no
durable queue, no parallelism).

## Decision

- **Automation rules** own simple reactive behavior (event → conditions →
  actions). They execute inline in the event path.
- **Workflows** own multi-step graphs. Live triggers (CRM events, schedules)
  MUST go through `enqueueWorkflowRunsForTrigger()` → durable
  `workflow_run_steps` queue → cron worker, which reuses `executeAction()` /
  `nextNodes()` from the runtime module.
- `runWorkflow()` (sync orchestrator) is reserved for the manual
  `/[id]/test-run` endpoint and tests. It MUST NOT be called from any live
  trigger, webhook, or cron path.
- `executeAction()` and `nextNodes()` are shared primitives (imported by the
  cron worker); only the synchronous DFS orchestration is test-run-only.

## Consequences

- New trigger sources enqueue; they never import `runWorkflow`.
- If the sync runner is ever needed outside test-run, this ADR must be
  revisited — the missing pieces are retries, idempotency keys per step, and
  a dead-letter path, not more call sites.

## Alternatives rejected

- Merging the two engines: automation conditions/AI-gating and the canvas
  graph model serve different authors (rule builders vs. flow designers);
  merging would complicate both.
- Hard runtime block on `runWorkflow()` in production: rejected — the
  test-run route legitimately runs it in production on explicit user action.
