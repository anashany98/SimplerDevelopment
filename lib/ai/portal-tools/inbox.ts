import { createHash } from 'node:crypto';
import type { PortalTool } from './types';
import {
  assignInboxConversation,
  closeInboxConversation,
  getInboxConversation,
  listInboxChannels,
  listInboxConversations,
  pauseInboxAi,
  returnInboxConversationToAi,
  sendInboxMessage,
  takeOverInboxConversation,
  type InboxAiMode,
  type InboxConversationStatus,
} from '@/lib/channels/conversations';
import { CHANNELS, type Channel } from '@/lib/channels/types';
import type { OutboundPurpose } from '@/lib/channels/policy';

const emptySchema = { type: 'object' as const, properties: {} };
const conversationIdSchema = {
  type: 'object' as const,
  properties: {
    conversationId: {
      type: 'number',
      description: 'Tenant-owned conversation ID.',
    },
  },
  required: ['conversationId'],
};

export const inboxTools: PortalTool[] = [
  {
    name: 'get_inbox_channels',
    description: 'List connected WhatsApp, Instagram, Messenger, web chat and email channel assets with safe health metadata. Credentials are never returned.',
    input_schema: emptySchema,
  },
  {
    name: 'get_inbox_conversations',
    description: 'List recent omnichannel inbox conversations using optional status, channel, assignment and AI-mode filters.',
    input_schema: {
      type: 'object' as const,
      properties: {
        status: { type: 'string', enum: ['open', 'assigned', 'closed'] },
        channel: { type: 'string', enum: [...CHANNELS] },
        assignedUserId: { type: 'number' },
        aiMode: {
          type: 'string',
          enum: ['ai', 'human', 'paused', 'hybrid', 'closed'],
        },
        limit: { type: 'number', minimum: 1, maximum: 100 },
      },
    },
  },
  {
    name: 'get_inbox_conversation',
    description: 'Get one tenant-owned inbox conversation and its most recent messages in chronological order.',
    input_schema: {
      type: 'object' as const,
      properties: {
        conversationId: { type: 'number' },
        limit: { type: 'number', minimum: 1, maximum: 100 },
      },
      required: ['conversationId'],
    },
  },
  {
    name: 'send_inbox_message',
    description: 'Queue a policy-checked outbound reply through the conversation channel. Requires confirmation and human approval before dispatch.',
    requiresApproval: true,
    input_schema: {
      type: 'object' as const,
      properties: {
        conversationId: { type: 'number' },
        // Length is enforced again by the handler. Keep the wire schema to the
        // common provider subset: LM Studio's grammar compiler rejects
        // minLength/maxLength on tool arguments.
        text: { type: 'string' },
        purpose: {
          type: 'string',
          enum: ['transactional', 'support', 'marketing'],
        },
      },
      required: ['conversationId', 'text'],
    },
  },
  {
    name: 'assign_inbox_conversation',
    description: 'Assign a conversation to a member of this workspace, or unassign it with null.',
    input_schema: {
      type: 'object' as const,
      properties: {
        conversationId: { type: 'number' },
        assignedUserId: { type: ['number', 'null'] },
      },
      required: ['conversationId', 'assignedUserId'],
    },
  },
  {
    name: 'take_over_inbox_conversation',
    description: 'Assign the conversation to the current user and switch it to human mode.',
    input_schema: conversationIdSchema,
  },
  {
    name: 'pause_inbox_ai',
    description: 'Pause automatic AI handling for a conversation without closing it.',
    input_schema: conversationIdSchema,
  },
  {
    name: 'return_inbox_conversation_to_ai',
    description: 'Remove human assignment and resume autonomous AI handling. Requires human approval.',
    requiresApproval: true,
    input_schema: conversationIdSchema,
  },
  {
    name: 'close_inbox_conversation',
    description: 'Close a conversation and stop automatic AI handling. The action is reversible from the inbox.',
    input_schema: conversationIdSchema,
  },
];

function numberInput(input: Record<string, unknown>, key: string): number {
  const value = Number(input[key]);
  if (!Number.isInteger(value) || value <= 0) throw new Error(`${key} must be a positive integer`);
  return value;
}

function stableReplyKey(clientId: number, userId: number, conversationId: number, text: string): string {
  // Bound accidental duplicate calls from one agent turn while still allowing
  // a legitimate identical reply later. The DB/outbox remains the final guard.
  const minute = new Date().toISOString().slice(0, 16);
  const digest = createHash('sha256').update(`${clientId}:${userId}:${conversationId}:${minute}:${text}`).digest('hex').slice(0, 32);
  return `portal-ai-${digest}`;
}

export const inboxHandlers: Record<string, (input: Record<string, unknown>, clientId: number, userId: number) => Promise<unknown>> = {
  get_inbox_channels: async (_input, clientId, userId) => {
    void userId; // Preserve the registry's uniform three-argument handler ABI.
    return listInboxChannels({ clientId });
  },
  get_inbox_conversations: async (input, clientId, userId) => {
    void userId;
    return listInboxConversations({
      clientId,
      status: input.status as InboxConversationStatus | undefined,
      channel: input.channel as Channel | undefined,
      assignedUserId: input.assignedUserId === undefined ? undefined : numberInput(input, 'assignedUserId'),
      aiMode: input.aiMode as InboxAiMode | undefined,
      limit: input.limit === undefined ? undefined : numberInput(input, 'limit'),
    });
  },
  get_inbox_conversation: async (input, clientId, userId) => {
    void userId;
    return getInboxConversation({
      clientId,
      conversationId: numberInput(input, 'conversationId'),
      limit: input.limit === undefined ? 50 : Math.min(numberInput(input, 'limit'), 100),
    });
  },
  send_inbox_message: async (input, clientId, userId) => {
    const conversationId = numberInput(input, 'conversationId');
    const text = String(input.text ?? '').trim();
    if (!text || text.length > 8000) throw new Error('text must contain between 1 and 8000 characters');
    return sendInboxMessage({
      clientId,
      conversationId,
      actorUserId: userId,
      text,
      purpose: input.purpose as OutboundPurpose | undefined,
      idempotencyKey: stableReplyKey(clientId, userId, conversationId, text),
    });
  },
  assign_inbox_conversation: async (input, clientId, userId) =>
    assignInboxConversation({
      clientId,
      conversationId: numberInput(input, 'conversationId'),
      actorUserId: userId,
      assignedUserId: input.assignedUserId === null ? null : numberInput(input, 'assignedUserId'),
    }),
  take_over_inbox_conversation: async (input, clientId, userId) =>
    takeOverInboxConversation({
      clientId,
      conversationId: numberInput(input, 'conversationId'),
      actorUserId: userId,
    }),
  pause_inbox_ai: async (input, clientId, userId) =>
    pauseInboxAi({
      clientId,
      conversationId: numberInput(input, 'conversationId'),
      actorUserId: userId,
    }),
  return_inbox_conversation_to_ai: async (input, clientId, userId) =>
    returnInboxConversationToAi({
      clientId,
      conversationId: numberInput(input, 'conversationId'),
      actorUserId: userId,
    }),
  close_inbox_conversation: async (input, clientId, userId) =>
    closeInboxConversation({
      clientId,
      conversationId: numberInput(input, 'conversationId'),
      actorUserId: userId,
    }),
};
