/**
 * MCP tools — crm custom fields, saved views & scoring
 *
 * Split out of lib/mcp/tools/crm.ts to keep the per-domain registrar under
 * the god-file ratchet (scripts/check-file-budget.ts) and the function-size
 * budget. Behavior is unchanged from before the split.
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


export function registerCrmCustomFieldsTools(server: McpServer, ctx: PortalMcpContext): void {
  const clientId = ctx.client.id;

  // ── CRM CUSTOM FIELDS / SAVED VIEWS / SCORING ──────────────────────────
  hasScope(ctx.scopes, 'crm:read') && server.registerTool(
    'crm_custom_fields_list',
    {
      title: 'List CRM custom fields',
      description: 'List custom field definitions attached to contact/company/deal entities.',
      inputSchema: {
        entityType: z.enum(['contact', 'company', 'deal']).optional(),
      },
    },
    async ({ entityType }) => {
      if (!requireScope(ctx, 'crm:read')) return denied('crm:read');
      const conds = [eq(crmCustomFields.clientId, clientId)];
      if (entityType) conds.push(eq(crmCustomFields.entityType, entityType));
      const rows = await db.select().from(crmCustomFields)
        .where(and(...conds))
        .orderBy(crmCustomFields.sortOrder);
      return json(rows);
    }
  );

  hasScope(ctx.scopes, 'crm:write') && server.registerTool(
    'crm_custom_fields_create',
    {
      title: 'Create CRM custom field',
      description: 'Define a custom field on contact/company/deal. For select/multiselect types, provide options[].',
      inputSchema: {
        entityType: z.enum(['contact', 'company', 'deal']),
        fieldName: z.string().min(1),
        fieldType: z.enum(['text', 'number', 'date', 'select', 'multiselect', 'url', 'email', 'phone', 'boolean']),
        options: z.array(z.string()).optional(),
        required: z.boolean().optional(),
        filterable: z.boolean().optional(),
        sortOrder: z.number().optional(),
      },
    },
    async ({ entityType, fieldName, fieldType, options, required, filterable, sortOrder }) => {
      if (!requireScope(ctx, 'crm:write')) return denied('crm:write');
      if (!(await requireService(clientId, 'crm'))) return serviceDenied('crm');
      const [row] = await db.insert(crmCustomFields).values({
        clientId,
        entityType,
        fieldName: fieldName.trim(),
        fieldType,
        options: options ?? null,
        required: required ?? false,
        filterable: filterable ?? false,
        sortOrder: sortOrder ?? 0,
      }).returning();
      revalidateForWrite('portal');
      return json(row);
    }
  );

  hasScope(ctx.scopes, 'crm:write') && server.registerTool(
    'crm_custom_fields_update',
    {
      title: 'Update CRM custom field',
      description: 'Rename, toggle required, reorder, or update options on an existing custom field definition.',
      inputSchema: {
        id: z.number().int().positive(),
        fieldName: z.string().min(1).optional(),
        options: z.array(z.string()).nullable().optional(),
        required: z.boolean().optional(),
        filterable: z.boolean().optional(),
        sortOrder: z.number().optional(),
      },
    },
    async ({ id, fieldName, options, required, filterable, sortOrder }) => {
      if (!requireScope(ctx, 'crm:write')) return denied('crm:write');
      if (!(await requireService(clientId, 'crm'))) return serviceDenied('crm');
      const [existing] = await db.select({ id: crmCustomFields.id }).from(crmCustomFields)
        .where(and(eq(crmCustomFields.id, id), eq(crmCustomFields.clientId, clientId))).limit(1);
      if (!existing) return json({ error: 'Custom field not found' });
      const patch: Record<string, unknown> = {};
      if (fieldName !== undefined) patch.fieldName = fieldName.trim();
      if (options !== undefined) patch.options = options;
      if (required !== undefined) patch.required = required;
      if (filterable !== undefined) patch.filterable = filterable;
      if (sortOrder !== undefined) patch.sortOrder = sortOrder;
      if (Object.keys(patch).length === 0) return json({ error: 'No fields to update' });
      const [row] = await db.update(crmCustomFields).set(patch)
        .where(eq(crmCustomFields.id, id)).returning();
      revalidateForWrite('portal');
      return json(row);
    }
  );

  hasScope(ctx.scopes, 'crm:delete') && server.registerTool(
    'crm_custom_fields_delete',
    {
      title: 'Delete CRM custom field',
      description: 'Remove a custom field definition. All stored values for this field are cascaded.',
      inputSchema: {
        id: z.number().int().positive(),
      },
    },
    async ({ id }) => {
      if (!requireScope(ctx, 'crm:delete')) return denied('crm:delete');
      if (!(await requireService(clientId, 'crm'))) return serviceDenied('crm');
      const [row] = await db.delete(crmCustomFields)
        .where(and(eq(crmCustomFields.id, id), eq(crmCustomFields.clientId, clientId)))
        .returning();
      if (!row) return json({ error: 'Custom field not found' });
      revalidateForWrite('portal');
      return json(row);
    }
  );

  hasScope(ctx.scopes, 'crm:read') && server.registerTool(
    'crm_custom_field_values_get',
    {
      title: 'Read CRM custom field values',
      description: 'Fetch custom field values (joined with their definitions) for a given contact, company, or deal.',
      inputSchema: {
        entityType: z.enum(['contact', 'company', 'deal']),
        entityId: z.number().int().positive(),
      },
    },
    async ({ entityType, entityId }) => {
      if (!requireScope(ctx, 'crm:read')) return denied('crm:read');
      let entityOk = false;
      if (entityType === 'contact') {
        const [row] = await db.select({ id: crmContacts.id }).from(crmContacts)
          .where(and(eq(crmContacts.id, entityId), eq(crmContacts.clientId, clientId))).limit(1);
        entityOk = !!row;
      } else if (entityType === 'company') {
        const [row] = await db.select({ id: crmCompanies.id }).from(crmCompanies)
          .where(and(eq(crmCompanies.id, entityId), eq(crmCompanies.clientId, clientId))).limit(1);
        entityOk = !!row;
      } else {
        const [row] = await db.select({ id: crmDeals.id }).from(crmDeals)
          .where(and(eq(crmDeals.id, entityId), eq(crmDeals.clientId, clientId))).limit(1);
        entityOk = !!row;
      }
      if (!entityOk) return json({ error: 'Entity not found' });
      const rows = await db.select({
        id: crmCustomFieldValues.id,
        customFieldId: crmCustomFieldValues.customFieldId,
        entityId: crmCustomFieldValues.entityId,
        entityType: crmCustomFieldValues.entityType,
        value: crmCustomFieldValues.value,
        fieldName: crmCustomFields.fieldName,
        fieldType: crmCustomFields.fieldType,
        options: crmCustomFields.options,
        required: crmCustomFields.required,
      })
        .from(crmCustomFieldValues)
        .innerJoin(crmCustomFields, eq(crmCustomFieldValues.customFieldId, crmCustomFields.id))
        .where(and(
          eq(crmCustomFieldValues.entityType, entityType),
          eq(crmCustomFieldValues.entityId, entityId),
          eq(crmCustomFields.clientId, clientId),
        ));
      return json(rows);
    }
  );

  hasScope(ctx.scopes, 'crm:write') && server.registerTool(
    'crm_custom_field_values_set',
    {
      title: 'Upsert CRM custom field values',
      description: 'Set (insert or update) custom field values on a contact/company/deal. Pass values as { [fieldId]: stringValue }. Pass empty string or null to clear.',
      inputSchema: {
        entityType: z.enum(['contact', 'company', 'deal']),
        entityId: z.number().int().positive(),
        values: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])),
      },
    },
    async ({ entityType, entityId, values }) => {
      if (!requireScope(ctx, 'crm:write')) return denied('crm:write');
      if (!(await requireService(clientId, 'crm'))) return serviceDenied('crm');
      let entityOk = false;
      if (entityType === 'contact') {
        const [row] = await db.select({ id: crmContacts.id }).from(crmContacts)
          .where(and(eq(crmContacts.id, entityId), eq(crmContacts.clientId, clientId))).limit(1);
        entityOk = !!row;
      } else if (entityType === 'company') {
        const [row] = await db.select({ id: crmCompanies.id }).from(crmCompanies)
          .where(and(eq(crmCompanies.id, entityId), eq(crmCompanies.clientId, clientId))).limit(1);
        entityOk = !!row;
      } else {
        const [row] = await db.select({ id: crmDeals.id }).from(crmDeals)
          .where(and(eq(crmDeals.id, entityId), eq(crmDeals.clientId, clientId))).limit(1);
        entityOk = !!row;
      }
      if (!entityOk) return json({ error: 'Entity not found' });

      const fieldIds = Object.keys(values).map(k => parseInt(k, 10)).filter(n => !isNaN(n));
      if (fieldIds.length === 0) return json([]);

      const validFields = await db.select({ id: crmCustomFields.id }).from(crmCustomFields)
        .where(and(eq(crmCustomFields.clientId, clientId), inArray(crmCustomFields.id, fieldIds)));
      const validFieldIds = new Set(validFields.map(f => f.id));

      const results = [];
      for (const [fieldIdStr, raw] of Object.entries(values)) {
        const fieldId = parseInt(fieldIdStr, 10);
        if (!validFieldIds.has(fieldId)) continue;
        const stringValue = raw === null || raw === undefined ? null : String(raw);
        const [row] = await db.insert(crmCustomFieldValues).values({
          customFieldId: fieldId,
          entityId,
          entityType,
          value: stringValue,
          updatedAt: new Date(),
        }).onConflictDoUpdate({
          target: [crmCustomFieldValues.customFieldId, crmCustomFieldValues.entityId, crmCustomFieldValues.entityType],
          set: { value: stringValue, updatedAt: new Date() },
        }).returning();
        results.push(row);
      }
      revalidateForWrite('portal');
      return json(results);
    }
  );

  hasScope(ctx.scopes, 'crm:read') && server.registerTool(
    'crm_saved_views_list',
    {
      title: 'List CRM saved views',
      description: 'List saved filter/view configurations for contacts, companies, or deals.',
      inputSchema: {
        entityType: z.enum(['contact', 'company', 'deal']).optional(),
      },
    },
    async ({ entityType }) => {
      if (!requireScope(ctx, 'crm:read')) return denied('crm:read');
      const conds = [eq(crmSavedViews.clientId, clientId)];
      if (entityType) conds.push(eq(crmSavedViews.entityType, entityType));
      const rows = await db.select().from(crmSavedViews)
        .where(and(...conds))
        .orderBy(crmSavedViews.sortOrder);
      return json(rows);
    }
  );

  hasScope(ctx.scopes, 'crm:read') && server.registerTool(
    'crm_scoring_rules_list',
    {
      title: 'List CRM scoring rules',
      description: 'List lead-scoring rules (events that award points to contacts/deals).',
      inputSchema: {},
    },
    async () => {
      if (!requireScope(ctx, 'crm:read')) return denied('crm:read');
      const rows = await db.select().from(crmScoringRules)
        .where(eq(crmScoringRules.clientId, clientId))
        .orderBy(desc(crmScoringRules.points));
      return json(rows);
    }
  );
}
