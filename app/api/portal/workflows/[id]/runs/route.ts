import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { workflowRuns, workflows } from '@/lib/db/schema';
import { authorizePortal, isAuthError } from '@/lib/portal-auth';
import { eq, and, desc } from 'drizzle-orm';

// GET /api/portal/workflows/[id]/runs — list runs for a workflow.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await authorizePortal({ action: 'read', scope: 'automations:read' });
  if (isAuthError(authResult)) return authResult.response;
  const { client } = authResult;

  const { id } = await params;
  const workflowId = parseInt(id, 10);
  if (!Number.isFinite(workflowId)) {
    return NextResponse.json({ success: false, error: 'Invalid id' }, { status: 400 });
  }

  // Verify ownership before exposing the runs.
  const [wf] = await db
    .select({ id: workflows.id })
    .from(workflows)
    .where(and(eq(workflows.id, workflowId), eq(workflows.clientId, client.id)))
    .limit(1);
  if (!wf) return NextResponse.json({ success: false, error: 'Workflow not found' }, { status: 404 });

  const url = new URL(req.url);
  const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '50', 10) || 50, 200);

  const rows = await db
    .select()
    .from(workflowRuns)
    .where(eq(workflowRuns.workflowId, wf.id))
    .orderBy(desc(workflowRuns.startedAt))
    .limit(limit);

  return NextResponse.json({ success: true, data: rows });
}
