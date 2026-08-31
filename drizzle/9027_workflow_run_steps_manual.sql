-- lib/db/schema/workflows.ts defines `workflowRunSteps` — the mutable step
-- queue drained by app/api/cron/process-workflow-runs — but no generated
-- migration ever created the table, so fresh databases 500 with
-- "relation workflow_run_steps does not exist" on that cron.
-- Idempotent per the manual-migration convention (CLAUDE.md release rules).

CREATE TABLE IF NOT EXISTS "workflow_run_steps" (
	"id" serial PRIMARY KEY NOT NULL,
	"run_id" integer NOT NULL,
	"client_id" integer NOT NULL,
	"node_id" text NOT NULL,
	"action" text NOT NULL,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"next_retry_at" timestamp,
	"idempotency_key" text,
	"input" json,
	"result" json,
	"error" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "workflow_run_steps_pending_idx" ON "workflow_run_steps" ("client_id","status","next_retry_at");
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'workflow_run_steps_run_id_workflow_runs_id_fk') THEN
    ALTER TABLE "workflow_run_steps" ADD CONSTRAINT "workflow_run_steps_run_id_workflow_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."workflow_runs"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'workflow_run_steps_client_id_clients_id_fk') THEN
    ALTER TABLE "workflow_run_steps" ADD CONSTRAINT "workflow_run_steps_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
