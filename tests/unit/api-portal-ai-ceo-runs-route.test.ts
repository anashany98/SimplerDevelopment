// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const authorizePortalMock = vi.fn();
vi.mock('@/lib/portal-auth', () => ({
  authorizePortal: (...args: unknown[]) => authorizePortalMock(...args),
  isAuthError: (result: unknown) => Boolean(result && typeof result === 'object' && 'response' in result),
}));

const queuedJobs: unknown[] = [];
vi.mock('@/lib/jobs', () => ({
  enqueueJob: async (job: unknown) => { queuedJobs.push(job); },
}));

const inserts: Array<{ table: unknown; values: unknown }> = [];
const dbMock = {
  insert: (table: unknown) => ({
    values: (values: unknown) => {
      inserts.push({ table, values });
      return {
        returning: async () => [{ id: 73 }],
      };
    },
  }),
};
vi.mock('@/lib/db', () => ({ db: dbMock }));
vi.mock('@/lib/db/schema', () => ({
  aiConversations: { id: 'conversation-id' },
  aiMessages: { id: 'message-id' },
}));

const { POST } = await import('@/app/api/portal/ai/ceo/runs/route');

function request(body: unknown): Request {
  return new Request('http://crm.test/api/portal/ai/ceo/runs', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/portal/ai/ceo/runs', () => {
  beforeEach(() => {
    inserts.length = 0;
    queuedJobs.length = 0;
    authorizePortalMock.mockReset().mockResolvedValue({
      client: { id: 10 },
      userId: 7,
      role: 'owner',
    });
  });

  it('persists a tenant conversation and queues a durable CEO analysis', async () => {
    const res = await POST(request({ task: 'Prioriza los riesgos comerciales de esta semana' }));

    expect(res.status).toBe(202);
    const body = await res.json();
    expect(body).toMatchObject({ success: true, data: { conversationId: 73, status: 'queued' } });
    expect(body.data.taskId).toEqual(expect.any(String));
    expect(authorizePortalMock).toHaveBeenCalledWith({ action: 'write', requireService: 'ai' });
    expect(inserts).toHaveLength(2);
    expect(inserts[0]?.values).toEqual({
      clientId: 10,
      title: 'CEO · Prioriza los riesgos comerciales de esta semana',
    });
    expect(inserts[1]?.values).toEqual(expect.arrayContaining([
      expect.objectContaining({ conversationId: 73, role: 'user', content: 'Prioriza los riesgos comerciales de esta semana' }),
      expect.objectContaining({
        conversationId: 73,
        role: 'assistant',
        toolCalls: [expect.objectContaining({ agentId: 'ceo', name: 'ceo_background_analysis', result: { status: 'queued' } })],
      }),
    ]));
    expect(queuedJobs).toEqual([
      expect.objectContaining({
        clientId: 10,
        type: 'ceo.background_analysis',
        payload: expect.objectContaining({ clientId: 10, conversationId: 73, taskId: body.data.taskId }),
        dedupeKey: `ceo.background_analysis:${body.data.taskId}`,
      }),
    ]);
  });

  it('rejects empty and overlong tasks before a conversation is created', async () => {
    const empty = await POST(request({ task: '  ' }));
    expect(empty.status).toBe(400);

    const tooLong = await POST(request({ task: 'a'.repeat(4_001) }));
    expect(tooLong.status).toBe(400);
    expect(inserts).toHaveLength(0);
    expect(queuedJobs).toHaveLength(0);
  });
});
