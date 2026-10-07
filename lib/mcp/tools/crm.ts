/**
 * MCP tools — crm.
 *
 * Extracted from lib/mcp/server.ts during the per-domain refactor. The
 * registrar function below is invoked by buildMcpServer() and registers each
 * tool with its scope guard. Behavior is unchanged from the monolithic file.
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { and, desc, eq, ilike, inArray, isNull, or, sql, gte, lte } from 'drizzle-orm';
import crypto from 'crypto';
import { hash as hashPassword } from 'bcryptjs';
import { db } from '@/lib/db';
import {
  projects,
  kanbanCards,
  kanbanColumns,
  kanbanLabels,
  kanbanCardLabels,
  kanbanCardChecklistItems,
  kanbanCardAssignees,
  kanbanCardWatchers,
  kanbanCardDependencies,
  supportTickets,
  ticketMessages,
  crmContacts,
  crmCompanies,
  crmDeals,
  crmDealComments,
  crmPipelines,
  crmPipelineStages,
  posts,
  media,
  clientWebsites,
  emailLists,
  emailCampaigns,
  pitchDecks,
  brandingProfiles,
  emailSubscribers,
  emailCampaignSends,
  surveys,
  surveyResponses,
  bookingPages,
  bookings,
  sprints,
  crmActivities,
  categories,
  tags,
  postCategories,
  postTags,
  automationRules,
  clientMembers,
  users,
  crmProposals,
  crmContracts,
  crmContractSigners,
  invoices,
  invoiceItems,
  serviceRequests,
  suggestedProjectRequests,
  suggestedProjects,
  services,
  aiConversations,
  aiMessages,
  kanbanCardComments,
  kanbanCardTimeLogs,
  kanbanCardFiles,
  kanbanCardArtifacts,
  crmDealArtifacts,
  siteNavigation,
  postRevisions,
  blockTemplates,
  blockTemplateUsages,
  emailTemplates,
  emailSegments,
  giftCertificates,
  crmCustomFields,
  crmCustomFieldValues,
  crmSavedViews,
  crmScoringRules,
  websiteDomains,
  websiteEnvironments,
  websiteEnvVars,
  clients,
  aiCreditBalances,
  aiCreditLedger,
  hostedSites,
  googleWorkspaceUserConnections,
} from '@/lib/db/schema';
import type { SurveyFieldDef, ProposalSection, ProposalLineItem, ProposalFee, ContractClause, PitchDeckSlideV2 } from '@/lib/db/schema';
import type { PortalMcpContext } from '@/lib/mcp-auth';
import { hasScope } from '@/lib/mcp-auth';
import { logCardActivity } from '@/lib/pm-activity';
import { uploadToS3 } from '@/lib/s3/upload';
import { cleanEmbedHtml } from '@/lib/html-embed-clean';
import { importHtmlAssets } from '@/lib/html-asset-import';
import {
  renderBlocksToEmailHtml,
  resend,
  buildCampaignHtml,
  buildUnsubscribeUrl,
  generateUnsubscribeToken,
} from '@/lib/email';
import { executeCampaignSend } from '@/lib/email/campaign-send';
import { revoke as revokeGoogleToken } from '@/lib/google/oauth';
import { getTenantWorkspaceCredentialsByClientId } from '@/lib/google/tenant-credentials';
import { stageOrApply } from '../pending-changes';
import { BLOCKS_SCHEMA_REFERENCE } from '../blocks-schema';
import { extractMentions } from '@/lib/crm/extract-mentions';
import { createCrmNotification } from '@/lib/crm/notifications';
import {
  assertPipelineInClient,
  assertStageInClient,
  assertContactInClient,
  assertCompanyInClient,
  assertUserVisibleToClient,
  OwnershipError,
} from '@/lib/security/assert-owned';
import {
  json,
  serializePostContent,
  denied,
  extractRows,
  dbErrorEnvelope,
  requireScope,
  serviceDenied,
  requireService,
  assignBlockIds,
  revalidateForWrite,
} from '../types';
import {
  postProjection,
  deckProjection,
  campaignProjection,
} from '../projections';

export function registerCrmTools(server: McpServer, ctx: PortalMcpContext): void {
  const clientId = ctx.client.id;

  // ── CRM ────────────────────────────────────────────────────────────────
  hasScope(ctx.scopes, 'crm:read') && server.registerTool(
    'crm_contacts_search',
    {
      title: 'Search CRM contacts',
      description: 'Search CRM contacts by name or email.',
      inputSchema: {
        query: z.string().optional(),
        status: z.enum(['active', 'inactive', 'lead', 'customer']).optional(),
        limit: z.number().min(1).max(200).default(50).optional(),
      },
    },
    async ({ query, status, limit = 50 }) => {
      if (!requireScope(ctx, 'crm:read')) return denied('crm:read');
      // Raw `SELECT *` so Postgres returns whatever columns actually exist on
      // the live table — avoids Drizzle expanding the SELECT list to every
      // column declared in the TS schema, which has previously drifted ahead
      // of the DB and broken this handler (pg 42703). Filters compose safely
      // via Drizzle's sql`` template (parameterized).
      const q = query ? `%${query}%` : null;
      const statusFilter = status ? sql`AND status = ${status}` : sql``;
      const searchFilter = q
        ? sql`AND (first_name ILIKE ${q} OR last_name ILIKE ${q} OR email ILIKE ${q})`
        : sql``;
      try {
        const result = await db.execute<Record<string, unknown>>(sql`
          SELECT *
          FROM crm_contacts
          WHERE client_id = ${clientId}
            ${statusFilter}
            ${searchFilter}
          ORDER BY created_at DESC
          LIMIT ${limit}
        `);
        const rows = extractRows(result);
        return json(rows);
      } catch (err) {
        return dbErrorEnvelope(err, 'crm_contacts_search');
      }
    }
  );

  hasScope(ctx.scopes, 'crm:write') && server.registerTool(
    'crm_contacts_create',
    {
      title: 'Create CRM contact',
      description: 'Create a new CRM contact.',
      inputSchema: {
        firstName: z.string().min(1),
        lastName: z.string().optional(),
        email: z.string().email().optional(),
        phone: z.string().optional(),
        linkedinUrl: z.string().url().optional(),
        title: z.string().optional(),
        companyId: z.number().optional(),
        status: z.enum(['active', 'inactive', 'lead', 'customer']).optional(),
        notes: z.string().optional(),
      },
    },
    async (args) => {
      if (!requireScope(ctx, 'crm:write')) return denied('crm:write');
      if (!(await requireService(clientId, 'crm'))) return serviceDenied('crm');
      const [row] = await db.insert(crmContacts).values({
        clientId,
        firstName: args.firstName,
        lastName: args.lastName ?? null,
        email: args.email ?? null,
        phone: args.phone ?? null,
        linkedinUrl: args.linkedinUrl ?? null,
        title: args.title ?? null,
        companyId: args.companyId ?? null,
        status: args.status ?? 'active',
        notes: args.notes ?? null,
        ownerId: ctx.userId,
      }).returning();
      revalidateForWrite('portal');
      return json(row);
    }
  );

  hasScope(ctx.scopes, 'crm:write') && server.registerTool(
    'crm_contacts_update',
    {
      title: 'Update CRM contact',
      description: 'Update any mutable field on a CRM contact. Pass null to clear nullable fields.',
      inputSchema: {
        id: z.number(),
        firstName: z.string().min(1).optional(),
        lastName: z.string().nullable().optional(),
        email: z.string().email().nullable().optional(),
        phone: z.string().nullable().optional(),
        linkedinUrl: z.string().url().nullable().optional(),
        title: z.string().nullable().optional(),
        companyId: z.number().nullable().optional(),
        status: z.enum(['active', 'inactive', 'lead', 'customer']).optional(),
        source: z.string().nullable().optional(),
        notes: z.string().nullable().optional(),
        score: z.number().optional(),
        ownerId: z.number().nullable().optional(),
      },
    },
    async ({ id, ...rest }) => {
      if (!requireScope(ctx, 'crm:write')) return denied('crm:write');
      if (!(await requireService(clientId, 'crm'))) return serviceDenied('crm');
      const [existing] = await db.select({ id: crmContacts.id }).from(crmContacts)
        .where(and(eq(crmContacts.id, id), eq(crmContacts.clientId, clientId))).limit(1);
      if (!existing) return json({ error: 'Contact not found' });
      const patch: Record<string, unknown> = { updatedAt: new Date() };
      for (const [k, v] of Object.entries(rest)) if (v !== undefined) patch[k] = v;
      const [row] = await db.update(crmContacts).set(patch)
        .where(eq(crmContacts.id, id)).returning();
      revalidateForWrite('portal');
      return json(row);
    }
  );

  hasScope(ctx.scopes, 'crm:read') && server.registerTool(
    'crm_companies_search',
    {
      title: 'Search CRM companies',
      description: 'Search CRM companies by name or domain.',
      inputSchema: { query: z.string().optional(), limit: z.number().default(50).optional() },
    },
    async ({ query, limit = 50 }) => {
      if (!requireScope(ctx, 'crm:read')) return denied('crm:read');
      // See crm_contacts_search for rationale: raw SELECT * insulates this
      // handler from TS/DB column drift and lets pg return exactly what exists.
      const q = query ? `%${query}%` : null;
      const searchFilter = q
        ? sql`AND (name ILIKE ${q} OR domain ILIKE ${q})`
        : sql``;
      try {
        const result = await db.execute<Record<string, unknown>>(sql`
          SELECT *
          FROM crm_companies
          WHERE client_id = ${clientId}
            ${searchFilter}
          ORDER BY created_at DESC
          LIMIT ${limit}
        `);
        const rows = extractRows(result);
        return json(rows);
      } catch (err) {
        return dbErrorEnvelope(err, 'crm_companies_search');
      }
    }
  );

  hasScope(ctx.scopes, 'crm:write') && server.registerTool(
    'crm_companies_create',
    {
      title: 'Create CRM company',
      description: 'Create a new CRM company.',
      inputSchema: {
        name: z.string().min(1),
        domain: z.string().optional(),
        industry: z.string().optional(),
        website: z.string().optional(),
        phone: z.string().optional(),
        notes: z.string().optional(),
      },
    },
    async (args) => {
      if (!requireScope(ctx, 'crm:write')) return denied('crm:write');
      if (!(await requireService(clientId, 'crm'))) return serviceDenied('crm');
      const [row] = await db.insert(crmCompanies).values({
        clientId,
        name: args.name,
        domain: args.domain ?? null,
        industry: args.industry ?? null,
        website: args.website ?? null,
        phone: args.phone ?? null,
        notes: args.notes ?? null,
      }).returning();
      revalidateForWrite('portal');
      return json(row);
    }
  );

  hasScope(ctx.scopes, 'crm:write') && server.registerTool(
    'crm_companies_update',
    {
      title: 'Update CRM company',
      description: 'Update any mutable field on a CRM company.',
      inputSchema: {
        id: z.number(),
        name: z.string().min(1).optional(),
        domain: z.string().nullable().optional(),
        industry: z.string().nullable().optional(),
        size: z.string().nullable().optional(),
        phone: z.string().nullable().optional(),
        address: z.string().nullable().optional(),
        website: z.string().nullable().optional(),
        notes: z.string().nullable().optional(),
      },
    },
    async ({ id, ...rest }) => {
      if (!requireScope(ctx, 'crm:write')) return denied('crm:write');
      if (!(await requireService(clientId, 'crm'))) return serviceDenied('crm');
      const [existing] = await db.select({ id: crmCompanies.id }).from(crmCompanies)
        .where(and(eq(crmCompanies.id, id), eq(crmCompanies.clientId, clientId))).limit(1);
      if (!existing) return json({ error: 'Company not found' });
      const patch: Record<string, unknown> = { updatedAt: new Date() };
      for (const [k, v] of Object.entries(rest)) if (v !== undefined) patch[k] = v;
      const [row] = await db.update(crmCompanies).set(patch)
        .where(eq(crmCompanies.id, id)).returning();
      revalidateForWrite('portal');
      return json(row);
    }
  );

  hasScope(ctx.scopes, 'crm:read') && server.registerTool(
    'crm_deals_list',
    {
      title: 'List CRM deals',
      description: 'List deals in a pipeline, or across all pipelines for the client.',
      inputSchema: {
        pipelineId: z.number().optional(),
        status: z.enum(['open', 'won', 'lost']).optional(),
      },
    },
    async ({ pipelineId, status }) => {
      if (!requireScope(ctx, 'crm:read')) return denied('crm:read');
      const conds = [eq(crmDeals.clientId, clientId)];
      if (pipelineId) conds.push(eq(crmDeals.pipelineId, pipelineId));
      if (status) conds.push(eq(crmDeals.status, status));
      const rows = await db.select().from(crmDeals).where(and(...conds))
        .orderBy(desc(crmDeals.createdAt));
      return json(rows);
    }
  );

  hasScope(ctx.scopes, 'crm:write') && server.registerTool(
    'crm_deals_create',
    {
      title: 'Create CRM deal',
      description: 'Create a new deal in a pipeline stage.',
      inputSchema: {
        title: z.string().min(1),
        pipelineId: z.number(),
        stageId: z.number(),
        value: z.number().optional().describe('Amount in cents'),
        contactId: z.number().optional(),
        companyId: z.number().optional(),
        expectedCloseDate: z.string().optional(),
        notes: z.string().optional(),
      },
    },
    async (args) => {
      if (!requireScope(ctx, 'crm:write')) return denied('crm:write');
      if (!(await requireService(clientId, 'crm'))) return serviceDenied('crm');
      try {
        await assertPipelineInClient(args.pipelineId, clientId);
        await assertStageInClient(args.stageId, clientId);
        if (args.contactId != null) await assertContactInClient(args.contactId, clientId);
        if (args.companyId != null) await assertCompanyInClient(args.companyId, clientId);
      } catch (e) {
        if (e instanceof OwnershipError) return json({ error: e.message });
        throw e;
      }
      const [row] = await db.insert(crmDeals).values({
        clientId,
        title: args.title,
        pipelineId: args.pipelineId,
        stageId: args.stageId,
        value: args.value ?? null,
        contactId: args.contactId ?? null,
        companyId: args.companyId ?? null,
        expectedCloseDate: args.expectedCloseDate ? new Date(args.expectedCloseDate) : null,
        notes: args.notes ?? null,
        ownerId: ctx.userId,
      }).returning();
      revalidateForWrite('portal');
      return json(row);
    }
  );

  hasScope(ctx.scopes, 'crm:write') && server.registerTool(
    'crm_deals_move_stage',
    {
      title: 'Move deal to stage',
      description: 'Move a deal to a different pipeline stage (or close it as won/lost).',
      inputSchema: {
        id: z.number(),
        stageId: z.number().optional(),
        status: z.enum(['open', 'won', 'lost']).optional(),
      },
    },
    async ({ id, stageId, status }) => {
      if (!requireScope(ctx, 'crm:write')) return denied('crm:write');
      if (!(await requireService(clientId, 'crm'))) return serviceDenied('crm');
      try {
        if (stageId != null) await assertStageInClient(stageId, clientId);
      } catch (e) {
        if (e instanceof OwnershipError) return json({ error: e.message });
        throw e;
      }
      const patch: Record<string, unknown> = { updatedAt: new Date() };
      if (stageId !== undefined) patch.stageId = stageId;
      if (status !== undefined) {
        patch.status = status;
        if (status === 'won' || status === 'lost') patch.closedAt = new Date();
      }
      const [row] = await db.update(crmDeals).set(patch)
        .where(and(eq(crmDeals.id, id), eq(crmDeals.clientId, clientId)))
        .returning();
      if (row) revalidateForWrite('portal');
      return json(row ?? { error: 'Not found' });
    }
  );

  hasScope(ctx.scopes, 'crm:write') && server.registerTool(
    'crm_deals_update',
    {
      title: 'Update CRM deal',
      description: 'Update any mutable field on a CRM deal (title, value, dates, contact/company links, priority, notes). Use crm_deals_move_stage to change stageId/status.',
      inputSchema: {
        id: z.number(),
        title: z.string().min(1).optional(),
        value: z.number().nullable().optional().describe('Amount in cents.'),
        currency: z.string().optional(),
        priority: z.enum(['low', 'medium', 'high']).optional(),
        contactId: z.number().nullable().optional(),
        companyId: z.number().nullable().optional(),
        expectedCloseDate: z.string().nullable().optional().describe('ISO date string, or null to clear.'),
        notes: z.string().nullable().optional(),
        recurringValue: z.number().nullable().optional(),
        billingCycle: z.enum(['monthly', 'quarterly', 'annual', 'one-time']).nullable().optional(),
        ownerId: z.number().nullable().optional(),
      },
    },
    async ({ id, expectedCloseDate, ...rest }) => {
      if (!requireScope(ctx, 'crm:write')) return denied('crm:write');
      if (!(await requireService(clientId, 'crm'))) return serviceDenied('crm');
      const [existing] = await db.select({ id: crmDeals.id }).from(crmDeals)
        .where(and(eq(crmDeals.id, id), eq(crmDeals.clientId, clientId))).limit(1);
      if (!existing) return json({ error: 'Deal not found' });
      try {
        if (rest.contactId != null) await assertContactInClient(rest.contactId, clientId);
        if (rest.companyId != null) await assertCompanyInClient(rest.companyId, clientId);
        if (rest.ownerId != null) await assertUserVisibleToClient(rest.ownerId, clientId);
      } catch (e) {
        if (e instanceof OwnershipError) return json({ error: e.message });
        throw e;
      }
      const patch: Record<string, unknown> = { updatedAt: new Date() };
      for (const [k, v] of Object.entries(rest)) if (v !== undefined) patch[k] = v;
      if (expectedCloseDate !== undefined) {
        patch.expectedCloseDate = expectedCloseDate ? new Date(expectedCloseDate) : null;
      }
      const [row] = await db.update(crmDeals).set(patch)
        .where(and(eq(crmDeals.id, id), eq(crmDeals.clientId, clientId))).returning();
      revalidateForWrite('portal');
      return json(row);
    }
  );

  hasScope(ctx.scopes, 'crm:read') && server.registerTool(
    'crm_deals_get',
    {
      title: 'Get CRM deal',
      description: 'Fetch a single deal with joined contact/company/stage display fields. Pass includeCustomFields=true to also receive the deal\'s custom-field map ({ [fieldId]: { name, type, value } }).',
      inputSchema: {
        dealId: z.number().int().positive(),
        includeCustomFields: z.boolean().optional(),
      },
    },
    async ({ dealId, includeCustomFields }) => {
      if (!requireScope(ctx, 'crm:read')) return denied('crm:read');
      const [deal] = await db
        .select({
          id: crmDeals.id,
          clientId: crmDeals.clientId,
          pipelineId: crmDeals.pipelineId,
          stageId: crmDeals.stageId,
          contactId: crmDeals.contactId,
          companyId: crmDeals.companyId,
          title: crmDeals.title,
          value: crmDeals.value,
          currency: crmDeals.currency,
          status: crmDeals.status,
          priority: crmDeals.priority,
          expectedCloseDate: crmDeals.expectedCloseDate,
          closedAt: crmDeals.closedAt,
          notes: crmDeals.notes,
          sortOrder: crmDeals.sortOrder,
          recurringValue: crmDeals.recurringValue,
          billingCycle: crmDeals.billingCycle,
          ownerId: crmDeals.ownerId,
          createdAt: crmDeals.createdAt,
          updatedAt: crmDeals.updatedAt,
          contactFirstName: crmContacts.firstName,
          contactLastName: crmContacts.lastName,
          contactEmail: crmContacts.email,
          companyName: crmCompanies.name,
          stageName: crmPipelineStages.name,
          stageColor: crmPipelineStages.color,
        })
        .from(crmDeals)
        .leftJoin(crmContacts, eq(crmDeals.contactId, crmContacts.id))
        .leftJoin(crmCompanies, eq(crmDeals.companyId, crmCompanies.id))
        .leftJoin(crmPipelineStages, eq(crmDeals.stageId, crmPipelineStages.id))
        .where(and(eq(crmDeals.id, dealId), eq(crmDeals.clientId, clientId)));
      if (!deal) return json({ error: 'Deal not found' });

      if (!includeCustomFields) return json(deal);

      const customFieldRows = await db
        .select({
          fieldId: crmCustomFields.id,
          fieldName: crmCustomFields.fieldName,
          fieldType: crmCustomFields.fieldType,
          value: crmCustomFieldValues.value,
        })
        .from(crmCustomFields)
        .leftJoin(
          crmCustomFieldValues,
          and(
            eq(crmCustomFieldValues.customFieldId, crmCustomFields.id),
            eq(crmCustomFieldValues.entityId, dealId),
            eq(crmCustomFieldValues.entityType, 'deal'),
          ),
        )
        .where(and(
          eq(crmCustomFields.clientId, clientId),
          eq(crmCustomFields.entityType, 'deal'),
        ));
      const customFields: Record<number, { name: string; type: string; value: string | null }> = {};
      for (const row of customFieldRows) {
        customFields[row.fieldId] = { name: row.fieldName, type: row.fieldType, value: row.value };
      }
      return json({ ...deal, customFields });
    }
  );

  hasScope(ctx.scopes, 'crm:delete') && server.registerTool(
    'crm_deals_delete',
    {
      title: 'Delete CRM deal',
      description: 'Permanently delete a CRM deal. Cascades to deal artifacts and comments via FK ON DELETE CASCADE.',
      inputSchema: {
        dealId: z.number().int().positive(),
      },
    },
    async ({ dealId }) => {
      if (!requireScope(ctx, 'crm:delete')) return denied('crm:delete');
      if (!(await requireService(clientId, 'crm'))) return serviceDenied('crm');
      // Existence + tenancy check before staging — never queue a delete for a
      // missing / other-tenant deal.
      const [existing] = await db.select({ id: crmDeals.id }).from(crmDeals)
        .where(and(eq(crmDeals.id, dealId), eq(crmDeals.clientId, clientId))).limit(1);
      if (!existing) return json({ error: 'Deal not found' });
      // GATE (write-approval matrix: hard deletes) — stage for approval when the
      // credential requires it, otherwise delete now. Cascades to artifacts/comments.
      const result = await stageOrApply({
        ctx,
        entityType: 'crm_deal',
        operation: 'delete',
        entityId: dealId,
        summary: `Delete CRM deal #${dealId}`,
        payload: { dealId },
        apply: async () => {
          const [deleted] = await db.delete(crmDeals)
            .where(and(eq(crmDeals.id, dealId), eq(crmDeals.clientId, clientId)))
            .returning({ id: crmDeals.id });
          return { id: deleted?.id ?? dealId, deleted: true };
        },
      });
      if (result.pending) return json({ pending: true, pendingId: result.pendingId, summary: result.summary, status: 'pending' });
      revalidateForWrite('portal');
      return json(result.data);
    }
  );
}
