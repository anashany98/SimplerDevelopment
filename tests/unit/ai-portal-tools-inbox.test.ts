import { beforeEach, describe, expect, it, vi } from 'vitest';

const calls = vi.hoisted(() => ({
  listChannels: vi.fn(),
  list: vi.fn(),
  get: vi.fn(),
  send: vi.fn(),
  assign: vi.fn(),
  takeover: vi.fn(),
  pause: vi.fn(),
  resume: vi.fn(),
  close: vi.fn(),
}));

vi.mock('@/lib/channels/conversations', () => ({
  listInboxChannels: calls.listChannels,
  listInboxConversations: calls.list,
  getInboxConversation: calls.get,
  sendInboxMessage: calls.send,
  assignInboxConversation: calls.assign,
  takeOverInboxConversation: calls.takeover,
  pauseInboxAi: calls.pause,
  returnInboxConversationToAi: calls.resume,
  closeInboxConversation: calls.close,
}));

import { inboxHandlers, inboxTools } from '@/lib/ai/portal-tools/inbox';

describe('portal inbox tools', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const fn of Object.values(calls)) fn.mockResolvedValue({ ok: true });
  });

  it('exposes the complete bounded inbox surface', () => {
    expect(inboxTools.map((tool) => tool.name)).toEqual([
      'get_inbox_channels',
      'get_inbox_conversations',
      'get_inbox_conversation',
      'send_inbox_message',
      'assign_inbox_conversation',
      'take_over_inbox_conversation',
      'pause_inbox_ai',
      'return_inbox_conversation_to_ai',
      'close_inbox_conversation',
    ]);
  });

  it('marks outbound replies and autonomous resume for approval', () => {
    const gated = inboxTools.filter((tool) => tool.requiresApproval).map((tool) => tool.name);
    expect(gated).toEqual(['send_inbox_message', 'return_inbox_conversation_to_ai']);
  });

  it('keeps outbound text schema compatible with local tool-grammar providers', () => {
    const send = inboxTools.find((tool) => tool.name === 'send_inbox_message')!;
    const schema = send.input_schema as {
      properties: { text: Record<string, unknown> };
    };
    expect(schema.properties.text).toEqual({ type: 'string' });
  });

  it('passes tenant-scoped filters to the shared conversation service', async () => {
    await inboxHandlers.get_inbox_conversations(
      {
        status: 'open',
        channel: 'whatsapp',
        assignedUserId: 8,
        aiMode: 'human',
        limit: 20,
      },
      44,
      9,
    );

    expect(calls.list).toHaveBeenCalledWith({
      clientId: 44,
      status: 'open',
      channel: 'whatsapp',
      assignedUserId: 8,
      aiMode: 'human',
      limit: 20,
    });
  });

  it('queues an outbound reply with a stable bounded idempotency key', async () => {
    await inboxHandlers.send_inbox_message(
      {
        conversationId: 17,
        text: '  We can help tomorrow at 10:00.  ',
        purpose: 'support',
      },
      44,
      9,
    );

    expect(calls.send).toHaveBeenCalledWith(
      expect.objectContaining({
        clientId: 44,
        conversationId: 17,
        actorUserId: 9,
        text: 'We can help tomorrow at 10:00.',
        purpose: 'support',
        idempotencyKey: expect.stringMatching(/^portal-ai-[a-f0-9]{32}$/),
      }),
    );
  });

  it('preserves null when unassigning and never substitutes another tenant', async () => {
    await inboxHandlers.assign_inbox_conversation({ conversationId: 17, assignedUserId: null }, 44, 9);
    expect(calls.assign).toHaveBeenCalledWith({
      clientId: 44,
      conversationId: 17,
      actorUserId: 9,
      assignedUserId: null,
    });
  });

  it('rejects malformed IDs before calling the domain service', async () => {
    await expect(inboxHandlers.get_inbox_conversation({ conversationId: 'other-tenant' }, 44, 9)).rejects.toThrow('conversationId must be a positive integer');
    expect(calls.get).not.toHaveBeenCalled();
  });
});
