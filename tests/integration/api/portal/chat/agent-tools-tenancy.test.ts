import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/chat/realtime', () => ({
  publishConversationUpdate: vi.fn().mockResolvedValue(undefined),
}));

import {
  closeInboxConversation,
  getInboxConversation,
  listInboxConversations,
} from '@/lib/channels/conversations';
import { sessionForNewClientUser, type TenantCtx } from '../../../../helpers/session';
import { getTestSql, TEST_SCHEMA } from '../../../../helpers/test-db';

async function seedConversation(ctx: TenantCtx, visitorName: string) {
  const sql = getTestSql();
  const [row] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.chat_conversations (
      client_id, visitor_id, visitor_name, channel, provider,
      status, ai_mode, last_message_at
    ) VALUES (
      ${ctx.client.id}, ${`agent-${crypto.randomUUID()}`}, ${visitorName},
      'whatsapp', 'meta', 'open', 'ai', NOW()
    )
    RETURNING id
  `;
  return row.id;
}

describe('portal Inbox agent services @chat @agent @tenancy', () => {
  it('scopes lists, detail reads and state writes to the active client', async () => {
    const tenantA = await sessionForNewClientUser('agent-inbox-a');
    const tenantB = await sessionForNewClientUser('agent-inbox-b');
    const conversationA = await seedConversation(tenantA, 'Tenant A contact');
    const conversationB = await seedConversation(tenantB, 'Tenant B contact');

    const listedForA = await listInboxConversations({ clientId: tenantA.client.id });
    expect(listedForA.map((row) => row.id)).toContain(conversationA);
    expect(listedForA.map((row) => row.id)).not.toContain(conversationB);

    await expect(
      getInboxConversation({
        clientId: tenantA.client.id,
        conversationId: conversationB,
      }),
    ).resolves.toEqual({ error: 'Conversation not found' });

    await expect(
      closeInboxConversation({
        clientId: tenantA.client.id,
        conversationId: conversationB,
        actorUserId: tenantA.user.id,
      }),
    ).resolves.toEqual({ error: 'Conversation not found' });

    const sql = getTestSql();
    const [foreignRow] = await sql<{ status: string; ai_mode: string }[]>`
      SELECT status, ai_mode
      FROM ${sql(TEST_SCHEMA)}.chat_conversations
      WHERE id = ${conversationB}
    `;
    expect(foreignRow).toEqual({ status: 'open', ai_mode: 'ai' });
  });
});
