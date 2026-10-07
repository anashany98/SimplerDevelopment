import { randomBytes } from 'node:crypto';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { and, asc, desc, eq, gte, ilike, inArray, lte, or, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { automationRules, bookingAttendees, bookingPages, bookings, channelAiConfigs, channelConnections, channelIdentities, chatConversations, chatMessages, crmContacts, crmDeals, crmPipelines, crmPipelineStages } from '@/lib/db/schema';
import type { PortalMcpContext } from '@/lib/mcp-auth';
import { hasScope } from '@/lib/mcp-auth';
import { json, denied, requireScope, requireService, serviceDenied, type ToolEnvelope } from '../types';
import { getChannelAdapter } from '@/lib/channels/adapters';
import { adapterConnection } from '@/lib/channels/service';
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
} from '@/lib/channels/conversations';
import { CHANNELS, type Channel, type NormalizedAttachment } from '@/lib/channels/types';
import { validateAiBaseUrl } from '@/lib/channels/ai-url';
import { mergeCrmContacts } from '@/lib/crm/merge-contacts';
import { upsertContactByEmail } from '@/lib/crm/contacts';
import { normalizeEmail, normalizePhone, splitDisplayName } from '@/lib/channels/identity';
import { checkSlotCapacity } from '@/lib/booking/capacity';
import { isSlotWithinAvailability } from '@/lib/booking/availability';
import { pickAssignee } from '@/lib/booking/assign';
import { deriveRuleScopes } from '@/lib/ai/portal-tools/derive-rule-scopes';

type Shape = Record<string, z.ZodType>;
type Handler = (args: Record<string, unknown>) => Promise<ToolEnvelope>;

export function registerOmnichannelTools(server: McpServer, ctx: PortalMcpContext): void {
  const clientId = ctx.client.id;
  function register(scope: string, name: string, title: string, description: string, inputSchema: Shape, handler: Handler) {
    if (!hasScope(ctx.scopes, scope)) return;
    server.registerTool(name, { title, description, inputSchema }, async (args) => {
      if (!requireScope(ctx, scope)) return denied(scope);
      return handler(args as Record<string, unknown>);
    });
  }

  register('chat:read', 'list_channels', 'List communication channels', 'List tenant channel connections without returning encrypted credentials.', {}, async () => {
    return json(await listInboxChannels({ clientId }));
  });

  register(
    'chat:read',
    'get_channel_status',
    'Get channel status',
    'Get health and capability metadata for one tenant-owned channel without credentials.',
    {
      connectionId: z.number().int(),
    },
    async ({ connectionId }) => {
      const [row] = await db
        .select({
          id: channelConnections.id,
          channel: channelConnections.channel,
          provider: channelConnections.provider,
          externalAccountId: channelConnections.externalAccountId,
          displayName: channelConnections.displayName,
          status: channelConnections.status,
          capabilities: channelConnections.capabilities,
          tokenExpiresAt: channelConnections.tokenExpiresAt,
          lastWebhookAt: channelConnections.lastWebhookAt,
          lastInboundAt: channelConnections.lastInboundAt,
          lastOutboundAt: channelConnections.lastOutboundAt,
          lastError: channelConnections.lastError,
        })
        .from(channelConnections)
        .where(and(eq(channelConnections.id, connectionId as number), eq(channelConnections.clientId, clientId)))
        .limit(1);
      return json(row ?? { error: 'Connection not found' });
    },
  );

  register(
    'chat:write',
    'connect_channel',
    'Connect communication channel',
    'Store a tenant-owned provider asset. Credentials are encrypted at rest and never returned.',
    {
      channel: z.enum(CHANNELS),
      externalAccountId: z.string().min(1),
      displayName: z.string().optional(),
      credentials: z.record(z.string(), z.string()),
    },
    async (args) => {
      const channel = args.channel as Channel;
      const assets = await getChannelAdapter(channel).connect({
        clientId,
        credentials: {
          ...(args.credentials as Record<string, string>),
          externalAccountId: args.externalAccountId as string,
          ...(args.displayName ? { displayName: args.displayName as string } : {}),
        },
      });
      const rows = [];
      for (const asset of assets) {
        const [row] = await db
          .insert(channelConnections)
          .values({
            clientId,
            channel: asset.channel,
            provider: asset.provider,
            externalAccountId: asset.externalAccountId,
            displayName: asset.displayName,
            status: asset.metadata?.selectionRequired ? 'incomplete' : 'connected',
            credentials: JSON.stringify(asset.credentials),
            metadata: asset.metadata ?? {},
            capabilities: Object.entries(getChannelAdapter(asset.channel).getCapabilities())
              .filter(([, value]) => value === true)
              .map(([key]) => key),
            createdByUserId: ctx.userId,
          })
          .onConflictDoUpdate({
            target: [channelConnections.clientId, channelConnections.provider, channelConnections.channel, channelConnections.externalAccountId],
            set: {
              credentials: JSON.stringify(asset.credentials),
              displayName: asset.displayName,
              status: 'connected',
              updatedAt: new Date(),
              lastError: null,
            },
          })
          .returning({
            id: channelConnections.id,
            channel: channelConnections.channel,
            status: channelConnections.status,
          });
        rows.push(row);
      }
      return json(rows);
    },
  );

  register(
    'chat:write',
    'disconnect_channel',
    'Disconnect communication channel',
    'Revoke provider permissions and remove locally stored credentials.',
    {
      connectionId: z.number().int(),
      forceLocal: z.boolean().optional(),
    },
    async ({ connectionId, forceLocal }) => {
      const [row] = await db
        .select()
        .from(channelConnections)
        .where(and(eq(channelConnections.id, connectionId as number), eq(channelConnections.clientId, clientId)))
        .limit(1);
      if (!row) return json({ error: 'Connection not found' });
      if (!forceLocal) await getChannelAdapter(row.channel as Channel).disconnect(adapterConnection(row));
      await db
        .update(channelConnections)
        .set({
          status: 'disconnected',
          credentials: null,
          updatedAt: new Date(),
        })
        .where(and(eq(channelConnections.id, row.id), eq(channelConnections.clientId, clientId)));
      return json({
        id: row.id,
        status: 'disconnected',
        forced: Boolean(forceLocal),
      });
    },
  );

  const conversationFilters: Shape = {
    status: z.enum(['open', 'assigned', 'closed']).optional(),
    channel: z.enum(CHANNELS).optional(),
    assignedUserId: z.number().int().optional(),
    aiMode: z.enum(['ai', 'human', 'paused', 'hybrid', 'closed']).optional(),
    limit: z.number().int().min(1).max(200).default(50).optional(),
  };
  register('chat:read', 'list_conversations', 'List inbox conversations', 'List normalized conversations across all connected channels.', conversationFilters, async (args) => {
    return json(
      await listInboxConversations({
        clientId,
        status: args.status as 'open' | 'assigned' | 'closed' | undefined,
        channel: args.channel as Channel | undefined,
        assignedUserId: args.assignedUserId as number | undefined,
        aiMode: args.aiMode as 'ai' | 'human' | 'paused' | 'hybrid' | 'closed' | undefined,
        limit: args.limit as number | undefined,
      }),
    );
  });

  register(
    'chat:read',
    'get_conversation',
    'Get inbox conversation',
    'Get one tenant-owned conversation with normalized messages.',
    {
      conversationId: z.number().int(),
      limit: z.number().int().min(1).max(500).default(200).optional(),
    },
    async ({ conversationId, limit }) => {
      return json(
        await getInboxConversation({
          clientId,
          conversationId: conversationId as number,
          limit: limit as number | undefined,
        }),
      );
    },
  );

  register(
    'chat:read',
    'list_messages',
    'List conversation messages',
    'Page through normalized messages for one tenant-owned conversation.',
    {
      conversationId: z.number().int(),
      limit: z.number().int().min(1).max(500).default(100).optional(),
    },
    async ({ conversationId, limit }) => {
      const [conversation] = await db
        .select({ id: chatConversations.id })
        .from(chatConversations)
        .where(and(eq(chatConversations.id, conversationId as number), eq(chatConversations.clientId, clientId)))
        .limit(1);
      if (!conversation) return json({ error: 'Conversation not found' });
      const messages = await db
        .select()
        .from(chatMessages)
        .where(and(eq(chatMessages.conversationId, conversation.id), eq(chatMessages.clientId, clientId)))
        .orderBy(asc(chatMessages.occurredAt))
        .limit((limit as number | undefined) ?? 100);
      return json(messages);
    },
  );

  register(
    'chat:read',
    'search_conversations',
    'Search inbox conversations',
    'Search tenant conversations by participant or message text.',
    {
      query: z.string().min(1).max(200),
      channel: z.enum(CHANNELS).optional(),
      limit: z.number().int().min(1).max(100).default(25).optional(),
    },
    async ({ query, channel, limit }) => {
      const pattern = `%${String(query).replace(/[%_\\]/g, (value) => `\\${value}`)}%`;
      const filters = [eq(chatConversations.clientId, clientId), or(ilike(chatConversations.visitorName, pattern), ilike(chatConversations.visitorEmail, pattern), ilike(chatMessages.body, pattern))!];
      if (channel) filters.push(eq(chatConversations.channel, channel as string));
      const rows = await db
        .select({
          id: chatConversations.id,
          channel: chatConversations.channel,
          visitorName: chatConversations.visitorName,
          status: chatConversations.status,
          lastMessageAt: chatConversations.lastMessageAt,
        })
        .from(chatConversations)
        .leftJoin(chatMessages, and(eq(chatMessages.conversationId, chatConversations.id), eq(chatMessages.clientId, clientId)))
        .where(and(...filters))
        .groupBy(chatConversations.id)
        .orderBy(desc(chatConversations.lastMessageAt))
        .limit((limit as number | undefined) ?? 25);
      return json(rows);
    },
  );

  async function send(args: Record<string, unknown>, template?: { name: string; language: string; components?: unknown[] }, media?: NormalizedAttachment[]) {
    return json(
      await sendInboxMessage({
        clientId,
        conversationId: args.conversationId as number,
        actorUserId: ctx.userId,
        text: String(args.text ?? ''),
        template,
        media,
        purpose: args.purpose as 'support' | 'transactional' | 'marketing' | undefined,
        idempotencyKey: args.idempotencyKey as string | undefined,
      }),
    );
  }
  register(
    'chat:write',
    'send_message',
    'Send conversation message',
    'Queue a policy-checked outbound message through the conversation channel.',
    {
      conversationId: z.number().int(),
      text: z.string().min(1).max(8_000),
      purpose: z.enum(['support', 'transactional', 'marketing']).optional(),
      idempotencyKey: z.string().max(255).optional(),
    },
    send,
  );
  register(
    'chat:write',
    'send_template_message',
    'Send WhatsApp template',
    'Queue an approved WhatsApp template, including outside the service window.',
    {
      conversationId: z.number().int(),
      text: z.string().max(8_000).default('').optional(),
      templateName: z.string().min(1),
      language: z.string().min(2).default('en').optional(),
      components: z.array(z.unknown()).optional(),
      idempotencyKey: z.string().max(255).optional(),
    },
    async (args) =>
      send(args, {
        name: args.templateName as string,
        language: (args.language as string | undefined) ?? 'en',
        components: args.components as unknown[] | undefined,
      }),
  );
  register(
    'chat:write',
    'send_media',
    'Send conversation media',
    'Queue one policy-checked media attachment from a public HTTPS URL.',
    {
      conversationId: z.number().int(),
      type: z.enum(['image', 'video', 'audio', 'file']),
      url: z
        .string()
        .url()
        .refine((value) => new URL(value).protocol === 'https:', 'Media URL must use HTTPS'),
      name: z.string().max(255).optional(),
      mimeType: z.string().max(255).optional(),
      caption: z.string().max(8_000).optional(),
      purpose: z.enum(['support', 'transactional', 'marketing']).optional(),
      idempotencyKey: z.string().max(255).optional(),
    },
    async (args) =>
      send({ ...args, text: args.caption ?? '' }, undefined, [
        {
          type: args.type as 'image' | 'video' | 'audio' | 'file',
          url: args.url as string,
          name: args.name as string | undefined,
          mimeType: args.mimeType as string | undefined,
        },
      ]),
  );

  register(
    'chat:write',
    'mark_read',
    'Mark conversation read',
    'Mark received messages through a timestamp as read in the unified inbox.',
    {
      conversationId: z.number().int(),
      through: z.string().datetime().optional(),
    },
    async ({ conversationId, through }) => {
      const [conversation] = await db
        .select({ id: chatConversations.id })
        .from(chatConversations)
        .where(and(eq(chatConversations.id, conversationId as number), eq(chatConversations.clientId, clientId)))
        .limit(1);
      if (!conversation) return json({ error: 'Conversation not found' });
      const filters = [eq(chatMessages.clientId, clientId), eq(chatMessages.conversationId, conversation.id), eq(chatMessages.direction, 'inbound')];
      if (through) filters.push(lte(chatMessages.occurredAt, new Date(through as string)));
      const rows = await db
        .update(chatMessages)
        .set({ status: 'read', readAt: new Date() })
        .where(and(...filters))
        .returning({ id: chatMessages.id });
      return json({ updated: rows.length });
    },
  );

  async function patchConversation(id: number, patch: Partial<typeof chatConversations.$inferInsert>) {
    const [row] = await db
      .update(chatConversations)
      .set({ ...patch, updatedAt: new Date() })
      .where(and(eq(chatConversations.id, id), eq(chatConversations.clientId, clientId)))
      .returning();
    return json(row ?? { error: 'Conversation not found' });
  }
  register(
    'chat:write',
    'assign_conversation',
    'Assign conversation',
    'Assign a conversation to a tenant user or unassign it.',
    {
      conversationId: z.number().int(),
      userId: z.number().int().nullable(),
    },
    async ({ conversationId, userId }) =>
      json(
        await assignInboxConversation({
          clientId,
          conversationId: conversationId as number,
          actorUserId: ctx.userId,
          assignedUserId: userId as number | null,
        }),
      ),
  );
  register(
    'chat:write',
    'close_conversation',
    'Close conversation',
    'Close a tenant conversation and stop AI handling.',
    {
      conversationId: z.number().int(),
    },
    async ({ conversationId }) =>
      json(
        await closeInboxConversation({
          clientId,
          conversationId: conversationId as number,
          actorUserId: ctx.userId,
        }),
      ),
  );
  register(
    'chat:write',
    'reopen_conversation',
    'Reopen conversation',
    'Reopen a tenant conversation in hybrid mode.',
    {
      conversationId: z.number().int(),
    },
    async ({ conversationId }) =>
      patchConversation(conversationId as number, {
        status: 'open',
        aiMode: 'hybrid',
        closedAt: null,
      }),
  );
  register(
    'chat:write',
    'set_ai_mode',
    'Set conversation AI mode',
    'Set AI, HUMAN, PAUSED, HYBRID or CLOSED mode.',
    {
      conversationId: z.number().int(),
      mode: z.enum(['ai', 'human', 'paused', 'hybrid', 'closed']),
    },
    async ({ conversationId, mode }) =>
      patchConversation(conversationId as number, {
        aiMode: mode as string,
        ...(mode === 'closed' ? { status: 'closed', closedAt: new Date() } : {}),
      }),
  );
  register(
    'chat:write',
    'take_over_conversation',
    'Take over conversation',
    'Assign the conversation to the calling user and put AI in HUMAN mode.',
    {
      conversationId: z.number().int(),
    },
    async ({ conversationId }) =>
      json(
        await takeOverInboxConversation({
          clientId,
          conversationId: conversationId as number,
          actorUserId: ctx.userId,
        }),
      ),
  );
  register(
    'chat:write',
    'return_conversation_to_ai',
    'Return conversation to AI',
    'Remove the human assignment and resume automatic AI handling.',
    {
      conversationId: z.number().int(),
    },
    async ({ conversationId }) =>
      json(
        await returnInboxConversationToAi({
          clientId,
          conversationId: conversationId as number,
          actorUserId: ctx.userId,
        }),
      ),
  );
  register(
    'chat:write',
    'pause_ai',
    'Pause conversation AI',
    'Pause automatic AI handling without closing the conversation.',
    {
      conversationId: z.number().int(),
    },
    async ({ conversationId }) =>
      json(
        await pauseInboxAi({
          clientId,
          conversationId: conversationId as number,
          actorUserId: ctx.userId,
        }),
      ),
  );

  register('chat:read', 'get_ai_config', 'Get inbox AI configuration', 'Get redacted tenant AI configuration.', {}, async () => {
    const [row] = await db.select().from(channelAiConfigs).where(eq(channelAiConfigs.clientId, clientId)).limit(1);
    if (!row) return json(null);
    const { apiKey: _secret, ...safe } = row;
    return json({ ...safe, hasApiKey: Boolean(row.apiKey) });
  });
  register(
    'chat:write',
    'update_ai_config',
    'Update inbox AI configuration',
    'Configure platform or allowlisted OpenAI-compatible inference. API keys are encrypted.',
    {
      enabled: z.boolean(),
      provider: z.enum(['platform', 'openai-compatible']),
      model: z.string().max(255).optional(),
      baseUrl: z.string().url().optional(),
      apiKey: z.string().min(1).optional(),
      autoSendMinConfidence: z.number().min(50).max(100).optional(),
      systemPrompt: z.string().max(8_000).optional(),
    },
    async (args) => {
      const provider = args.provider as string;
      const [existing] = await db.select().from(channelAiConfigs).where(eq(channelAiConfigs.clientId, clientId)).limit(1);
      if (provider === 'openai-compatible') {
        if (!args.baseUrl || !args.model || (!args.apiKey && !existing?.apiKey))
          return json({
            error: 'Custom provider requires baseUrl, model and apiKey',
          });
        validateAiBaseUrl(args.baseUrl as string);
      }
      const values = {
        clientId,
        enabled: args.enabled as boolean,
        provider,
        model: provider === 'platform' ? null : (args.model as string),
        baseUrl: provider === 'platform' ? null : (args.baseUrl as string),
        apiKey: provider === 'platform' ? null : ((args.apiKey as string | undefined) ?? existing?.apiKey ?? null),
        autoSendMinConfidence: Math.round((args.autoSendMinConfidence as number | undefined) ?? 92),
        systemPrompt: args.systemPrompt as string | undefined,
        updatedAt: new Date(),
      };
      await db.insert(channelAiConfigs).values(values).onConflictDoUpdate({ target: channelAiConfigs.clientId, set: values });
      return json({
        enabled: values.enabled,
        provider,
        model: values.model,
        baseUrl: values.baseUrl,
        hasApiKey: Boolean(values.apiKey),
      });
    },
  );

  register(
    'crm:write',
    'upsert_contact',
    'Upsert CRM contact',
    'Conservatively upsert by exact normalized email or phone; never fuzzy-merge.',
    {
      email: z.string().email().optional(),
      phone: z.string().optional(),
      displayName: z.string().optional(),
      source: z.string().optional(),
    },
    async (args) => {
      if (!(await requireService(clientId, 'crm'))) return serviceDenied('crm');
      if (args.email)
        return json(
          await upsertContactByEmail({
            clientId,
            email: args.email as string,
            displayName: args.displayName as string | undefined,
            source: args.source as string | undefined,
          }),
        );
      const phone = normalizePhone(args.phone as string | undefined);
      if (!phone) return json({ error: 'A valid email or phone is required' });
      const matches = await db
        .select({ id: crmContacts.id })
        .from(crmContacts)
        .where(and(eq(crmContacts.clientId, clientId), eq(crmContacts.phone, phone)))
        .limit(2);
      if (matches.length === 1) return json({ contactId: matches[0].id, created: false });
      if (matches.length > 1) return json({ error: 'Phone is ambiguous; manual merge required' });
      const name = splitDisplayName(args.displayName as string | undefined, phone);
      const [created] = await db
        .insert(crmContacts)
        .values({
          clientId,
          firstName: name.firstName,
          lastName: name.lastName,
          phone,
          source: (args.source as string | undefined) ?? 'omnichannel',
        })
        .returning({ id: crmContacts.id });
      return json({ contactId: created.id, created: true });
    },
  );
  register(
    'crm:write',
    'merge_contacts',
    'Merge CRM contacts',
    'Explicitly merge a secondary contact into a primary, preserving channel identities and conversation history.',
    {
      primaryId: z.number().int(),
      secondaryId: z.number().int(),
    },
    async ({ primaryId, secondaryId }) => {
      if (!(await requireService(clientId, 'crm'))) return serviceDenied('crm');
      return json(
        await mergeCrmContacts({
          clientId,
          primaryId: primaryId as number,
          secondaryId: secondaryId as number,
          actorUserId: ctx.userId,
        }),
      );
    },
  );

  register(
    'crm:read',
    'search_contacts',
    'Search contacts',
    'Search tenant CRM contacts by name, email or phone.',
    {
      query: z.string().max(200).optional(),
      limit: z.number().int().min(1).max(200).default(50).optional(),
    },
    async ({ query, limit }) => {
      if (!(await requireService(clientId, 'crm'))) return serviceDenied('crm');
      const filters = [eq(crmContacts.clientId, clientId)];
      if (query) {
        const pattern = `%${String(query).replace(/[%_\\]/g, (value) => `\\${value}`)}%`;
        filters.push(or(ilike(crmContacts.firstName, pattern), ilike(crmContacts.lastName, pattern), ilike(crmContacts.email, pattern), ilike(crmContacts.phone, pattern))!);
      }
      return json(
        await db
          .select()
          .from(crmContacts)
          .where(and(...filters))
          .orderBy(desc(crmContacts.updatedAt))
          .limit((limit as number | undefined) ?? 50),
      );
    },
  );
  register(
    'crm:read',
    'get_contact',
    'Get contact',
    'Get one tenant CRM contact and its provider identities.',
    {
      contactId: z.number().int(),
    },
    async ({ contactId }) => {
      if (!(await requireService(clientId, 'crm'))) return serviceDenied('crm');
      const [contact] = await db
        .select()
        .from(crmContacts)
        .where(and(eq(crmContacts.id, contactId as number), eq(crmContacts.clientId, clientId)))
        .limit(1);
      if (!contact) return json({ error: 'Contact not found' });
      const identities = await db
        .select({
          id: channelIdentities.id,
          channel: channelIdentities.channel,
          provider: channelIdentities.provider,
          externalUserId: channelIdentities.externalUserId,
          displayName: channelIdentities.displayName,
          email: channelIdentities.emailNormalized,
          phone: channelIdentities.phoneNormalized,
          updatedAt: channelIdentities.updatedAt,
        })
        .from(channelIdentities)
        .where(and(eq(channelIdentities.contactId, contact.id), eq(channelIdentities.clientId, clientId)));
      return json({ contact, identities });
    },
  );
  register(
    'crm:write',
    'create_contact',
    'Create contact',
    'Create a tenant CRM contact using the existing normalized contact model.',
    {
      firstName: z.string().min(1).max(100),
      lastName: z.string().max(100).optional(),
      email: z.string().email().optional(),
      phone: z.string().optional(),
      source: z.string().max(100).optional(),
      notes: z.string().max(10_000).optional(),
      status: z.enum(['active', 'inactive', 'lead', 'customer']).optional(),
    },
    async (args) => {
      if (!(await requireService(clientId, 'crm'))) return serviceDenied('crm');
      const email = normalizeEmail(args.email as string | undefined);
      const phone = normalizePhone(args.phone as string | undefined);
      if (args.phone && !phone) return json({ error: 'Phone is invalid' });
      const [row] = await db
        .insert(crmContacts)
        .values({
          clientId,
          firstName: args.firstName as string,
          lastName: args.lastName as string | undefined,
          email,
          phone,
          source: (args.source as string | undefined) ?? 'mcp',
          notes: args.notes as string | undefined,
          status: (args.status as string | undefined) ?? 'active',
        })
        .returning();
      return json(row);
    },
  );
  register(
    'crm:write',
    'update_contact',
    'Update contact',
    'Update allowed fields on one tenant-owned CRM contact.',
    {
      contactId: z.number().int(),
      firstName: z.string().min(1).max(100).optional(),
      lastName: z.string().max(100).nullable().optional(),
      email: z.string().email().nullable().optional(),
      phone: z.string().nullable().optional(),
      source: z.string().max(100).nullable().optional(),
      notes: z.string().max(10_000).nullable().optional(),
      status: z.enum(['active', 'inactive', 'lead', 'customer']).optional(),
      ownerId: z.number().int().nullable().optional(),
    },
    async ({ contactId, ...args }) => {
      if (!(await requireService(clientId, 'crm'))) return serviceDenied('crm');
      const patch: Partial<typeof crmContacts.$inferInsert> = {
        updatedAt: new Date(),
      };
      if (args.firstName !== undefined) patch.firstName = args.firstName as string;
      if (args.lastName !== undefined) patch.lastName = args.lastName as string | null;
      if (args.email !== undefined) patch.email = args.email === null ? null : normalizeEmail(args.email as string);
      if (args.phone !== undefined) {
        const phone = args.phone === null ? null : normalizePhone(args.phone as string);
        if (args.phone !== null && !phone) return json({ error: 'Phone is invalid' });
        patch.phone = phone;
      }
      if (args.source !== undefined) patch.source = args.source as string | null;
      if (args.notes !== undefined) patch.notes = args.notes as string | null;
      if (args.status !== undefined) patch.status = args.status as string;
      if (args.ownerId !== undefined) patch.ownerId = args.ownerId as number | null;
      const [row] = await db
        .update(crmContacts)
        .set(patch)
        .where(and(eq(crmContacts.id, contactId as number), eq(crmContacts.clientId, clientId)))
        .returning();
      return json(row ?? { error: 'Contact not found' });
    },
  );

  register(
    'crm:read',
    'get_pipeline',
    'Get CRM pipeline',
    'Get tenant CRM pipelines and their ordered stages.',
    {
      pipelineId: z.number().int().optional(),
    },
    async ({ pipelineId }) => {
      if (!(await requireService(clientId, 'crm'))) return serviceDenied('crm');
      const filters = [eq(crmPipelines.clientId, clientId)];
      if (pipelineId) filters.push(eq(crmPipelines.id, pipelineId as number));
      const pipelines = await db
        .select()
        .from(crmPipelines)
        .where(and(...filters))
        .orderBy(crmPipelines.name);
      if (pipelineId && pipelines.length === 0) return json({ error: 'Pipeline not found' });
      const stages =
        pipelines.length === 0
          ? []
          : await db
              .select()
              .from(crmPipelineStages)
              .where(
                inArray(
                  crmPipelineStages.pipelineId,
                  pipelines.map((pipeline) => pipeline.id),
                ),
              )
              .orderBy(crmPipelineStages.pipelineId, crmPipelineStages.sortOrder);
      return json({ pipelines, stages });
    },
  );
  register(
    'crm:write',
    'move_deal',
    'Move CRM deal',
    'Move a tenant deal to an owned pipeline stage and optionally set won/lost state.',
    {
      dealId: z.number().int(),
      stageId: z.number().int(),
      status: z.enum(['open', 'won', 'lost']).optional(),
    },
    async ({ dealId, stageId, status }) => {
      if (!(await requireService(clientId, 'crm'))) return serviceDenied('crm');
      const [deal] = await db
        .select({ id: crmDeals.id })
        .from(crmDeals)
        .where(and(eq(crmDeals.id, dealId as number), eq(crmDeals.clientId, clientId)))
        .limit(1);
      if (!deal) return json({ error: 'Deal not found' });
      const [stage] = await db
        .select({
          id: crmPipelineStages.id,
          pipelineId: crmPipelineStages.pipelineId,
        })
        .from(crmPipelineStages)
        .innerJoin(crmPipelines, eq(crmPipelines.id, crmPipelineStages.pipelineId))
        .where(and(eq(crmPipelineStages.id, stageId as number), eq(crmPipelines.clientId, clientId)))
        .limit(1);
      if (!stage) return json({ error: 'Pipeline stage not found' });
      const nextStatus = status as 'open' | 'won' | 'lost' | undefined;
      const [row] = await db
        .update(crmDeals)
        .set({
          stageId: stage.id,
          pipelineId: stage.pipelineId,
          ...(nextStatus ? { status: nextStatus } : {}),
          ...(nextStatus === 'won' || nextStatus === 'lost' ? { closedAt: new Date() } : nextStatus === 'open' ? { closedAt: null } : {}),
          updatedAt: new Date(),
        })
        .where(and(eq(crmDeals.id, deal.id), eq(crmDeals.clientId, clientId)))
        .returning();
      return json(row);
    },
  );

  registerBookingTools(register, clientId);
  registerAutomationAliases(register, clientId, ctx.userId);
  registerMetricTools(register, clientId);
}

type Register = (scope: string, name: string, title: string, description: string, inputSchema: Shape, handler: Handler) => void;

function registerBookingTools(register: Register, clientId: number) {
  register('bookings:read', 'list_booking_services', 'List booking services', 'List active booking pages used as bookable services.', {}, async () => {
    if (!(await requireService(clientId, 'booking'))) return serviceDenied('booking');
    return json(
      await db
        .select({
          id: bookingPages.id,
          title: bookingPages.title,
          description: bookingPages.description,
          duration: bookingPages.duration,
          timezone: bookingPages.timezone,
          price: bookingPages.price,
        })
        .from(bookingPages)
        .where(and(eq(bookingPages.clientId, clientId), eq(bookingPages.active, true)))
        .orderBy(bookingPages.title),
    );
  });
  register(
    'bookings:read',
    'get_availability',
    'Get booking availability',
    'Return available slots from the existing Booking Engine for an ISO interval (maximum 14 days).',
    {
      bookingPageId: z.number().int(),
      start: z.string().datetime(),
      end: z.string().datetime(),
    },
    async ({ bookingPageId, start, end }) => {
      if (!(await requireService(clientId, 'booking'))) return serviceDenied('booking');
      const [page] = await db
        .select()
        .from(bookingPages)
        .where(and(eq(bookingPages.id, bookingPageId as number), eq(bookingPages.clientId, clientId), eq(bookingPages.active, true)))
        .limit(1);
      if (!page) return json({ error: 'Booking service not found' });
      const from = new Date(start as string);
      const until = new Date(end as string);
      if (until <= from || until.getTime() - from.getTime() > 14 * 24 * 60 * 60 * 1_000) return json({ error: 'Range must be positive and at most 14 days' });
      const slots = [];
      for (let cursor = new Date(from); cursor < until && slots.length < 500; cursor = new Date(cursor.getTime() + page.duration * 60_000)) {
        if ((await isSlotWithinAvailability(page, cursor)) && (await checkSlotCapacity(page.id, cursor, 1)).available) slots.push(cursor.toISOString());
      }
      return json({
        bookingPageId: page.id,
        timezone: page.timezone,
        duration: page.duration,
        slots,
      });
    },
  );
  register(
    'bookings:write',
    'create_booking',
    'Create booking',
    'Create a free booking after deterministic availability and capacity checks. Paid bookings require checkout.',
    {
      bookingPageId: z.number().int(),
      startTime: z.string().datetime(),
      guestName: z.string().min(1),
      guestEmail: z.string().email(),
      guestPhone: z.string().optional(),
      attendees: z
        .array(
          z.object({
            name: z.string().min(1),
            email: z.string().email(),
            phone: z.string().optional(),
          }),
        )
        .optional(),
      notes: z.string().optional(),
    },
    async (args) => {
      if (!(await requireService(clientId, 'booking'))) return serviceDenied('booking');
      const [page] = await db
        .select()
        .from(bookingPages)
        .where(and(eq(bookingPages.id, args.bookingPageId as number), eq(bookingPages.clientId, clientId), eq(bookingPages.active, true)))
        .limit(1);
      if (!page) return json({ error: 'Booking service not found' });
      if (page.price > 0)
        return json({
          error: 'Paid bookings must use the public checkout so payment cannot be bypassed',
        });
      const startTime = new Date(args.startTime as string);
      const now = Date.now();
      if (startTime.getTime() < now + page.minNoticeMins * 60_000 || startTime.getTime() > now + page.maxAdvanceDays * 86_400_000) return json({ error: 'Slot violates notice or advance limits' });
      const attendees = (args.attendees as Array<{ name: string; email: string; phone?: string }> | undefined) ?? [];
      const seats = page.bookingType === 'group' ? Math.max(1, attendees.length) : 1;
      if (!(await isSlotWithinAvailability(page, startTime)) || !(await checkSlotCapacity(page.id, startTime, seats)).available) return json({ error: 'Slot is unavailable' });
      const endTime = new Date(startTime.getTime() + page.duration * 60_000);
      const assignedTo = await pickAssignee(page.id, startTime);
      try {
        const created = await db.transaction(async (tx) => {
          const [booking] = await tx
            .insert(bookings)
            .values({
              clientId,
              bookingPageId: page.id,
              guestName: args.guestName as string,
              guestEmail: String(args.guestEmail).toLowerCase(),
              guestPhone: args.guestPhone as string | undefined,
              startTime,
              endTime,
              timezone: page.timezone,
              notes: args.notes as string | undefined,
              cancelToken: randomBytes(32).toString('hex'),
              rescheduleToken: randomBytes(32).toString('hex'),
              assignedTo,
              assignedUserId: assignedTo,
              groupSize: seats,
              slotExclusive: page.bookingType !== 'group',
              status: 'confirmed',
              paymentStatus: 'free',
            })
            .returning();
          if (page.bookingType === 'group') {
            const people = attendees.length
              ? attendees
              : [
                  {
                    name: args.guestName as string,
                    email: args.guestEmail as string,
                    phone: args.guestPhone as string | undefined,
                  },
                ];
            await tx.insert(bookingAttendees).values(
              people.map((person) => ({
                bookingId: booking.id,
                name: person.name,
                email: person.email.toLowerCase(),
                phone: person.phone,
              })),
            );
          }
          return booking;
        });
        return json(created);
      } catch (error) {
        return json({
          error: String(error).includes('23505') ? 'Slot was booked concurrently' : 'Booking creation failed',
        });
      }
    },
  );
  register(
    'bookings:write',
    'cancel_booking',
    'Cancel booking',
    'Cancel a tenant booking without deleting its audit history.',
    {
      bookingId: z.number().int(),
      reason: z.string().optional(),
    },
    async ({ bookingId, reason }) => {
      if (!(await requireService(clientId, 'booking'))) return serviceDenied('booking');
      const [existing] = await db
        .select()
        .from(bookings)
        .where(and(eq(bookings.id, bookingId as number), eq(bookings.clientId, clientId)))
        .limit(1);
      if (!existing) return json({ error: 'Booking not found' });
      const notes = reason ? `${existing.notes ? `${existing.notes}\n` : ''}[cancelled] ${reason}` : existing.notes;
      const [row] = await db
        .update(bookings)
        .set({
          status: 'cancelled',
          cancelledAt: new Date(),
          notes,
          updatedAt: new Date(),
        })
        .where(and(eq(bookings.id, existing.id), eq(bookings.clientId, clientId)))
        .returning();
      return json(row);
    },
  );
  register(
    'bookings:write',
    'reschedule_booking',
    'Reschedule booking',
    'Reschedule after checking service availability and capacity.',
    {
      bookingId: z.number().int(),
      startTime: z.string().datetime(),
    },
    async ({ bookingId, startTime }) => {
      if (!(await requireService(clientId, 'booking'))) return serviceDenied('booking');
      const [booking] = await db
        .select()
        .from(bookings)
        .where(and(eq(bookings.id, bookingId as number), eq(bookings.clientId, clientId)))
        .limit(1);
      if (!booking || booking.status === 'cancelled') return json({ error: 'Active booking not found' });
      const [page] = await db
        .select()
        .from(bookingPages)
        .where(and(eq(bookingPages.id, booking.bookingPageId), eq(bookingPages.clientId, clientId)))
        .limit(1);
      if (!page?.rescheduleEnabled) return json({ error: 'Rescheduling is disabled' });
      const next = new Date(startTime as string);
      if (!(await isSlotWithinAvailability(page, next, booking.assignedTo)) || !(await checkSlotCapacity(page.id, next, booking.groupSize)).available) return json({ error: 'Slot is unavailable' });
      const [row] = await db
        .update(bookings)
        .set({
          previousStartTime: booking.startTime,
          previousEndTime: booking.endTime,
          startTime: next,
          endTime: new Date(next.getTime() + page.duration * 60_000),
          rescheduleCount: booking.rescheduleCount + 1,
          updatedAt: new Date(),
        })
        .where(and(eq(bookings.id, booking.id), eq(bookings.clientId, clientId)))
        .returning();
      return json(row);
    },
  );
}

function registerAutomationAliases(register: Register, clientId: number, userId: number) {
  register('automations:read', 'list_automations', 'List automations', 'List tenant automation rules.', {}, async () =>
    json(await db.select().from(automationRules).where(eq(automationRules.clientId, clientId)).orderBy(desc(automationRules.updatedAt))),
  );
  register(
    'automations:write',
    'create_automation',
    'Create automation',
    'Create a rule using the existing Automation Engine.',
    {
      name: z.string().min(1),
      trigger: z.record(z.string(), z.unknown()),
      conditions: z.array(z.unknown()).optional(),
      actions: z.array(z.unknown()),
      enabled: z.boolean().optional(),
    },
    async (args) => {
      const actions = args.actions as import('@/lib/db/schema').AutomationAction[];
      const [row] = await db
        .insert(automationRules)
        .values({
          clientId,
          name: args.name as string,
          trigger: args.trigger as never,
          conditions: (args.conditions ?? []) as never,
          actions: actions as never,
          scopes: deriveRuleScopes(actions),
          enabled: (args.enabled as boolean | undefined) ?? true,
          source: 'manual',
          createdBy: userId,
        })
        .returning();
      return json(row);
    },
  );
  register(
    'automations:write',
    'update_automation',
    'Update automation',
    'Update tenant automation trigger, conditions, actions or enabled state.',
    {
      id: z.number().int(),
      name: z.string().min(1).optional(),
      trigger: z.record(z.string(), z.unknown()).optional(),
      conditions: z.array(z.unknown()).optional(),
      actions: z.array(z.unknown()).optional(),
      enabled: z.boolean().optional(),
    },
    async ({ id, ...rest }) => {
      const [existing] = await db
        .select({ id: automationRules.id })
        .from(automationRules)
        .where(and(eq(automationRules.id, id as number), eq(automationRules.clientId, clientId)))
        .limit(1);
      if (!existing) return json({ error: 'Automation not found' });
      const patch: Record<string, unknown> = { ...rest, updatedAt: new Date() };
      if (rest.actions) patch.scopes = deriveRuleScopes(rest.actions as import('@/lib/db/schema').AutomationAction[]);
      const [row] = await db
        .update(automationRules)
        .set(patch)
        .where(and(eq(automationRules.id, existing.id), eq(automationRules.clientId, clientId)))
        .returning();
      return json(row);
    },
  );
  register('automations:delete', 'delete_automation', 'Delete automation', 'Delete one tenant automation rule.', { id: z.number().int() }, async ({ id }) => {
    const rows = await db
      .delete(automationRules)
      .where(and(eq(automationRules.id, id as number), eq(automationRules.clientId, clientId)))
      .returning({ id: automationRules.id });
    return json(rows[0] ?? { error: 'Automation not found' });
  });
}

function registerMetricTools(register: Register, clientId: number) {
  register(
    'chat:read',
    'get_inbox_metrics',
    'Get inbox metrics',
    'Aggregate conversation volume, open workload and response state for a bounded lookback.',
    {
      days: z.number().int().min(1).max(365).default(30).optional(),
    },
    async ({ days }) => {
      const since = new Date(Date.now() - ((days as number | undefined) ?? 30) * 86_400_000);
      const rows = await db
        .select({
          channel: chatConversations.channel,
          status: chatConversations.status,
          count: sql<number>`count(*)::int`,
        })
        .from(chatConversations)
        .where(and(eq(chatConversations.clientId, clientId), gte(chatConversations.createdAt, since)))
        .groupBy(chatConversations.channel, chatConversations.status);
      return json({ since, conversations: rows });
    },
  );
  register(
    'chat:read',
    'get_channel_metrics',
    'Get channel metrics',
    'Aggregate inbound/outbound messages and delivery state by channel.',
    {
      days: z.number().int().min(1).max(365).default(30).optional(),
      channel: z.enum(CHANNELS).optional(),
    },
    async ({ days, channel }) => {
      const since = new Date(Date.now() - ((days as number | undefined) ?? 30) * 86_400_000);
      const filters = [eq(chatMessages.clientId, clientId), gte(chatMessages.occurredAt, since)];
      if (channel) filters.push(eq(chatMessages.channel, channel as string));
      const rows = await db
        .select({
          channel: chatMessages.channel,
          direction: chatMessages.direction,
          status: chatMessages.status,
          count: sql<number>`count(*)::int`,
        })
        .from(chatMessages)
        .where(and(...filters))
        .groupBy(chatMessages.channel, chatMessages.direction, chatMessages.status);
      return json({ since, messages: rows });
    },
  );
}
