import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { aiConversations, aiMessages } from '@/lib/db/schema';
import { enqueueJob } from '@/lib/jobs';
import { authorizePortal, isAuthError } from '@/lib/portal-auth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const MAX_TASK_CHARS = 4_000;

/** Queue a durable, read-only executive analysis and return immediately. */
export async function POST(req: Request) {
  const access = await authorizePortal({ action: 'write', requireService: 'ai' });
  if (isAuthError(access)) return access.response;

  let body: { task?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, message: 'Invalid JSON body' }, { status: 400 });
  }

  const task = typeof body.task === 'string' ? body.task.trim() : '';
  if (!task) return NextResponse.json({ success: false, message: 'task is required' }, { status: 400 });
  if (task.length > MAX_TASK_CHARS) {
    return NextResponse.json({ success: false, message: `task must be at most ${MAX_TASK_CHARS} characters` }, { status: 400 });
  }

  const taskId = randomUUID();
  const [conversation] = await db
    .insert(aiConversations)
    .values({ clientId: access.client.id, title: `CEO · ${task.slice(0, 70)}` })
    .returning({ id: aiConversations.id });

  await db.insert(aiMessages).values([
    {
      conversationId: conversation.id,
      role: 'user',
      content: task,
      inputTokens: 0,
      outputTokens: 0,
    },
    {
      conversationId: conversation.id,
      role: 'assistant',
      content: 'El Agente CEO está realizando el análisis en segundo plano. Puedes seguir trabajando: publicaré aquí el diagnóstico cuando termine.',
      toolCalls: [{
        agentId: 'ceo',
        name: 'ceo_background_analysis',
        input: { taskId },
        result: { status: 'queued' },
      }],
      inputTokens: 0,
      outputTokens: 0,
    },
  ]);

  await enqueueJob({
    clientId: access.client.id,
    type: 'ceo.background_analysis',
    payload: { clientId: access.client.id, conversationId: conversation.id, taskId, task },
    dedupeKey: `ceo.background_analysis:${taskId}`,
  });

  return NextResponse.json({ success: true, data: { conversationId: conversation.id, taskId, status: 'queued' } }, { status: 202 });
}
