import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { workflows } from '@/lib/db/schema';
import { authorizePortal, isAuthError } from '@/lib/portal-auth';
import { eq, and } from 'drizzle-orm';
import { runWorkflow } from '@/lib/workflows/runtime';

// POST /api/portal/workflows/[id]/test-run — fire the workflow with a
// synthetic context. Live triggers (CRM events via lib/automation/engine.ts,
// schedule via app/api/cron/process-workflow-schedules) go through the
// durable queue instead; this is the manual "fire it now" path.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await authorizePortal({ action: 'write', scope: 'automations:write' });
  if (isAuthError(authResult)) return authResult.response;
  const { client } = authResult;

  const { id } = await params;
  const workflowId = parseInt(id, 10);
  if (!Number.isFinite(workflowId)) {
    return NextResponse.json({ success: false, error: 'Invalid id' }, { status: 400 });
  }

  const [wf] = await db
    .select({ id: workflows.id })
    .from(workflows)
    .where(and(eq(workflows.id, workflowId), eq(workflows.clientId, client.id)))
    .limit(1);
  if (!wf) return NextResponse.json({ success: false, error: 'Workflow not found' }, { status: 404 });

  const body = (await req.json().catch(() => ({}))) as { context?: Record<string, unknown> };
  // Caller context is merged FIRST: clientId and triggeredAt must never be
  // overridable — a crafted body could otherwise point the run at another
  // tenant's projects / Resend key.
  const context = {
    ...(body.context ?? {}),
    clientId: client.id,
    triggeredAt: new Date().toISOString(),
  };

  const result = await runWorkflow(wf.id, context, { triggeredBy: 'test-run' });

  return NextResponse.json({ success: result.status === 'completed', data: result });
}
