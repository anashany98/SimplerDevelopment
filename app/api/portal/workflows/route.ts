import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { workflows } from '@/lib/db/schema';
import { authorizePortal, isAuthError } from '@/lib/portal-auth';
import { eq, desc } from 'drizzle-orm';
import { findTemplate } from '@/lib/workflows/templates';
import type { WorkflowGraph, WorkflowTriggerConfig } from '@/lib/workflows/types';

// GET /api/portal/workflows — list workflows for the active client.
export async function GET() {
  const authResult = await authorizePortal({ action: 'read', scope: 'automations:read' });
  if (isAuthError(authResult)) return authResult.response;
  const { client } = authResult;

  const rows = await db
    .select()
    .from(workflows)
    .where(eq(workflows.clientId, client.id))
    .orderBy(desc(workflows.updatedAt));

  return NextResponse.json({ success: true, data: rows });
}

// POST /api/portal/workflows — create from template or blank.
// Body: { templateId?: string; name?: string; description?: string }
export async function POST(req: Request) {
  const authResult = await authorizePortal({ action: 'write', scope: 'automations:write' });
  if (isAuthError(authResult)) return authResult.response;
  const { client, userId } = authResult;

  const body = (await req.json().catch(() => ({}))) as {
    templateId?: string;
    name?: string;
    description?: string;
  };

  let name = body.name?.trim() || 'Flujo sin título';
  let description: string | null = body.description?.trim() || null;
  let trigger: WorkflowTriggerConfig = { kind: 'contact.created' };
  let graph: WorkflowGraph = {
    nodes: [
      { id: 'trigger', type: 'trigger', position: { x: 50, y: 50 }, data: { kind: 'contact.created' } },
    ],
    edges: [],
  };

  if (body.templateId) {
    const template = findTemplate(body.templateId);
    if (!template) {
      return NextResponse.json({ success: false, error: 'Template not found' }, { status: 404 });
    }
    name = body.name?.trim() || template.name;
    description = body.description?.trim() || template.description;
    trigger = template.trigger;
    // Deep clone so editing a workflow doesn't mutate the in-memory template.
    graph = JSON.parse(JSON.stringify(template.graph)) as WorkflowGraph;
  }

  const [row] = await db
    .insert(workflows)
    .values({
      clientId: client.id,
      name,
      description,
      status: 'draft',
      trigger,
      graph,
      createdBy: userId,
    })
    .returning();

  return NextResponse.json({ success: true, data: row });
}
