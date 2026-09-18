/**
 * MCP tools — crm deal extras (comments, artifacts, activities)
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


export function registerCrmDealExtrasTools(server: McpServer, ctx: PortalMcpContext): void {
  const clientId = ctx.client.id;

  // ── CRM DEAL COMMENTS ──────────────────────────────────────────────────
  hasScope(ctx.scopes, 'crm:read') && server.registerTool(
    'crm_deal_comments_list',
    {
      title: 'List comments on a CRM deal',
      description: 'List comments (with author name and attachments) on a deal. Bodies may contain @[name](userId) mention tokens.',
      inputSchema: {
        dealId: z.number().int().positive(),
        limit: z.number().int().min(1).max(200).optional(),
      },
    },
    async ({ dealId, limit = 50 }) => {
      if (!requireScope(ctx, 'crm:read')) return denied('crm:read');
      const [deal] = await db.select({ id: crmDeals.id }).from(crmDeals)
        .where(and(eq(crmDeals.id, dealId), eq(crmDeals.clientId, clientId))).limit(1);
      if (!deal) return json({ error: 'Deal not found' });
      const rows = await db
        .select({
          id: crmDealComments.id,
          dealId: crmDealComments.dealId,
          authorId: crmDealComments.authorId,
          authorName: users.name,
          body: crmDealComments.body,
          attachments: crmDealComments.attachments,
          parentCommentId: crmDealComments.parentCommentId,
          createdAt: crmDealComments.createdAt,
        })
        .from(crmDealComments)
        .leftJoin(users, eq(crmDealComments.authorId, users.id))
        .where(eq(crmDealComments.dealId, dealId))
        .orderBy(desc(crmDealComments.createdAt))
        .limit(limit);
      return json(rows);
    }
  );

  hasScope(ctx.scopes, 'crm:write') && server.registerTool(
    'crm_deal_comments_create',
    {
      title: 'Comment on a CRM deal',
      description: 'Add a comment to a deal. Use @[name](userId) tokens for mentions — mentioned users get an in-app notification, scoped to members of the same client. The portal route\'s notification call was previously fire-and-forget; this handler awaits it so MCP-driven comments don\'t silently miss notifications.',
      inputSchema: {
        dealId: z.number().int().positive(),
        body: z.string().min(1),
        parentCommentId: z.number().int().positive().nullable().optional().describe('Optional id of the root comment being replied to. Must belong to the same deal. One level of threading only.'),
        mentionedUserIds: z.array(z.number().int().positive()).optional().describe('Optional explicit list of user IDs to notify. Merged with any @[name](userId) tokens parsed from the body. Filtered to client members.'),
      },
    },
    async ({ dealId, body, parentCommentId, mentionedUserIds }) => {
      if (!requireScope(ctx, 'crm:write')) return denied('crm:write');
      if (!(await requireService(clientId, 'crm'))) return serviceDenied('crm');
      const [deal] = await db.select({ id: crmDeals.id, title: crmDeals.title }).from(crmDeals)
        .where(and(eq(crmDeals.id, dealId), eq(crmDeals.clientId, clientId))).limit(1);
      if (!deal) return json({ error: 'Deal not found' });

      const trimmed = body.trim();
      if (!trimmed) return json({ error: 'body is required' });

      if (parentCommentId != null) {
        const [parent] = await db.select({ id: crmDealComments.id, dealId: crmDealComments.dealId })
          .from(crmDealComments)
          .where(eq(crmDealComments.id, parentCommentId)).limit(1);
        if (!parent || parent.dealId !== dealId) {
          return json({ error: 'Parent comment not found for this deal' });
        }
      }

      const [comment] = await db.insert(crmDealComments).values({
        dealId,
        authorId: ctx.userId,
        body: trimmed,
        attachments: [],
        parentCommentId: parentCommentId ?? null,
      }).returning({
        id: crmDealComments.id,
        dealId: crmDealComments.dealId,
        authorId: crmDealComments.authorId,
        parentCommentId: crmDealComments.parentCommentId,
        createdAt: crmDealComments.createdAt,
      });

      const mentionedFromBody = extractMentions(trimmed);
      const allMentioned = Array.from(new Set([
        ...mentionedFromBody,
        ...(mentionedUserIds ?? []),
      ])).filter((id) => id !== ctx.userId);

      if (allMentioned.length > 0) {
        const validMembers = await db
          .select({ userId: clientMembers.userId })
          .from(clientMembers)
          .where(and(
            eq(clientMembers.clientId, clientId),
            inArray(clientMembers.userId, allMentioned),
          ));
        const [actor] = await db.select({ name: users.name, email: users.email })
          .from(users).where(eq(users.id, ctx.userId)).limit(1);
        const authorName = actor?.name?.trim() || actor?.email || 'Someone';
        const snippet = trimmed.slice(0, 120);
        // Sequential awaits keep the floating-promise tidy (no fire-and-forget).
        // Volume is bounded by the mention count, which is small in practice.
        for (const recipient of validMembers) {
          try {
            await createCrmNotification({
              clientId,
              userId: recipient.userId,
              type: 'mention',
              title: `${authorName} mentioned you on deal: ${deal.title}`,
              body: snippet || undefined,
              entityType: 'deal',
              entityId: deal.id,
            });
          } catch (notifyErr) {
            console.warn('[mcp.crm_deal_comments_create] notify failed', { recipient: recipient.userId, err: notifyErr });
          }
        }
      }

      revalidateForWrite('portal');
      return json(comment);
    }
  );

  hasScope(ctx.scopes, 'crm:delete') && server.registerTool(
    'crm_deal_comments_delete',
    {
      title: 'Delete a CRM deal comment',
      description: 'Delete one of the caller\'s own comments on a deal. Matches the portal route — cannot delete other users\' comments.',
      inputSchema: {
        dealId: z.number().int().positive(),
        commentId: z.number().int().positive(),
      },
    },
    async ({ dealId, commentId }) => {
      if (!requireScope(ctx, 'crm:delete')) return denied('crm:delete');
      if (!(await requireService(clientId, 'crm'))) return serviceDenied('crm');
      const [deal] = await db.select({ id: crmDeals.id }).from(crmDeals)
        .where(and(eq(crmDeals.id, dealId), eq(crmDeals.clientId, clientId))).limit(1);
      if (!deal) return json({ error: 'Deal not found' });
      const [deleted] = await db.delete(crmDealComments)
        .where(and(
          eq(crmDealComments.id, commentId),
          eq(crmDealComments.dealId, dealId),
          eq(crmDealComments.authorId, ctx.userId),
        ))
        .returning({ id: crmDealComments.id });
      if (!deleted) return json({ error: 'Comment not found or not yours' });
      revalidateForWrite('portal');
      return json({ id: deleted.id, deleted: true });
    }
  );


  // ── CRM DEAL ARTIFACTS ─────────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- heterogeneous drizzle tables accessed dynamically by titleField
  const DEAL_ARTIFACT_TABLES: Record<string, { table: any; titleField: string }> = {
    website: { table: clientWebsites, titleField: 'name' },
    email_campaign: { table: emailCampaigns, titleField: 'name' },
    pitch_deck: { table: pitchDecks, titleField: 'title' },
    proposal: { table: crmProposals, titleField: 'title' },
    booking: { table: bookingPages, titleField: 'title' },
    survey: { table: surveys, titleField: 'title' },
    project: { table: projects, titleField: 'name' },
  };

  const ARTIFACT_TYPE_ENUM = z.enum(['website', 'email_campaign', 'pitch_deck', 'proposal', 'booking', 'survey', 'project']);

  hasScope(ctx.scopes, 'crm:read') && server.registerTool(
    'crm_deal_artifacts_list',
    {
      title: 'List artifacts linked to a deal',
      description: 'List every artifact (website, email campaign, pitch deck, proposal, booking, survey, project) linked to a CRM deal.',
      inputSchema: { dealId: z.number() },
    },
    async ({ dealId }) => {
      if (!requireScope(ctx, 'crm:read')) return denied('crm:read');
      const [deal] = await db.select({ id: crmDeals.id }).from(crmDeals)
        .where(and(eq(crmDeals.id, dealId), eq(crmDeals.clientId, clientId))).limit(1);
      if (!deal) return json({ error: 'Deal not found' });
      const rows = await db.select().from(crmDealArtifacts)
        .where(eq(crmDealArtifacts.dealId, dealId))
        .orderBy(desc(crmDealArtifacts.pinned), desc(crmDealArtifacts.createdAt));
      return json(rows);
    }
  );

  hasScope(ctx.scopes, 'crm:write') && server.registerTool(
    'crm_deal_artifact_link',
    {
      title: 'Link an artifact to a deal',
      description: 'Attach a website, email campaign, pitch deck, proposal, booking, survey, or project to a CRM deal. The artifact must belong to this client.',
      inputSchema: {
        dealId: z.number(),
        artifactType: ARTIFACT_TYPE_ENUM,
        artifactId: z.number(),
        pinned: z.boolean().optional(),
      },
    },
    async ({ dealId, artifactType, artifactId, pinned }) => {
      if (!requireScope(ctx, 'crm:write')) return denied('crm:write');
      if (!(await requireService(clientId, 'crm'))) return serviceDenied('crm');
      const [deal] = await db.select({ id: crmDeals.id }).from(crmDeals)
        .where(and(eq(crmDeals.id, dealId), eq(crmDeals.clientId, clientId))).limit(1);
      if (!deal) return json({ error: 'Deal not found' });

      const config = DEAL_ARTIFACT_TABLES[artifactType];
      const [source] = await db.select({ title: config.table[config.titleField] })
        .from(config.table)
        .where(and(eq(config.table.id, artifactId), eq(config.table.clientId, clientId)));
      if (!source) return json({ error: 'Artifact not found or not owned by this client' });

      const [row] = await db.insert(crmDealArtifacts).values({
        dealId,
        artifactType,
        artifactId,
        displayTitle: source.title || 'Untitled',
        pinned: pinned ?? false,
        createdBy: ctx.userId,
      }).returning();
      revalidateForWrite('portal');
      return json(row);
    }
  );

  hasScope(ctx.scopes, 'crm:write') && server.registerTool(
    'crm_deal_artifact_toggle_pin',
    {
      title: 'Pin or unpin a deal artifact',
      description: 'Update the pinned flag on a linked deal artifact.',
      inputSchema: { dealId: z.number(), artifactDbId: z.number(), pinned: z.boolean() },
    },
    async ({ dealId, artifactDbId, pinned }) => {
      if (!requireScope(ctx, 'crm:write')) return denied('crm:write');
      if (!(await requireService(clientId, 'crm'))) return serviceDenied('crm');
      const [deal] = await db.select({ id: crmDeals.id }).from(crmDeals)
        .where(and(eq(crmDeals.id, dealId), eq(crmDeals.clientId, clientId))).limit(1);
      if (!deal) return json({ error: 'Deal not found' });
      const [row] = await db.update(crmDealArtifacts).set({ pinned })
        .where(and(eq(crmDealArtifacts.id, artifactDbId), eq(crmDealArtifacts.dealId, dealId)))
        .returning();
      if (!row) return json({ error: 'Artifact link not found' });
      revalidateForWrite('portal');
      return json(row);
    }
  );

  hasScope(ctx.scopes, 'crm:write') && server.registerTool(
    'crm_deal_artifact_unlink',
    {
      title: 'Unlink an artifact from a deal',
      description: 'Remove an artifact link from a deal. Deletes the link row; the underlying artifact is not touched.',
      inputSchema: { dealId: z.number(), artifactDbId: z.number() },
    },
    async ({ dealId, artifactDbId }) => {
      if (!requireScope(ctx, 'crm:write')) return denied('crm:write');
      if (!(await requireService(clientId, 'crm'))) return serviceDenied('crm');
      const [deal] = await db.select({ id: crmDeals.id }).from(crmDeals)
        .where(and(eq(crmDeals.id, dealId), eq(crmDeals.clientId, clientId))).limit(1);
      if (!deal) return json({ error: 'Deal not found' });
      const [row] = await db.delete(crmDealArtifacts)
        .where(and(eq(crmDealArtifacts.id, artifactDbId), eq(crmDealArtifacts.dealId, dealId)))
        .returning();
      if (!row) return json({ error: 'Artifact link not found' });
      revalidateForWrite('portal');
      return json(row);
    }
  );

  hasScope(ctx.scopes, 'crm:read') && server.registerTool(
    'crm_pipelines_list',
    {
      title: 'List pipelines',
      description: 'List CRM pipelines and stages.',
      inputSchema: {},
    },
    async () => {
      if (!requireScope(ctx, 'crm:read')) return denied('crm:read');
      const pipelines = await db.select().from(crmPipelines)
        .where(eq(crmPipelines.clientId, clientId));
      const stages = pipelines.length
        ? await db.select().from(crmPipelineStages)
            .where(sql`${crmPipelineStages.pipelineId} IN (${sql.join(pipelines.map(p => sql`${p.id}`), sql`, `)})`)
            .orderBy(crmPipelineStages.sortOrder)
        : [];
      return json({ pipelines, stages });
    }
  );

  hasScope(ctx.scopes, 'crm:write') && server.registerTool(
    'crm_pipelines_create',
    {
      title: 'Create CRM pipeline',
      description: 'Create a new pipeline. Optionally seed it with an ordered list of stages.',
      inputSchema: {
        name: z.string().min(1),
        isDefault: z.boolean().optional(),
        stages: z.array(z.object({
          name: z.string().min(1),
          color: z.string().optional(),
          probability: z.number().int().min(0).max(100).optional(),
        })).optional().describe('Optional initial stages in sort order.'),
      },
    },
    async ({ name, isDefault, stages }) => {
      if (!requireScope(ctx, 'crm:write')) return denied('crm:write');
      if (!(await requireService(clientId, 'crm'))) return serviceDenied('crm');
      if (isDefault) {
        await db.update(crmPipelines)
          .set({ isDefault: false, updatedAt: new Date() })
          .where(and(eq(crmPipelines.clientId, clientId), eq(crmPipelines.isDefault, true)));
      }
      const [pipeline] = await db.insert(crmPipelines).values({
        clientId,
        name: name.trim(),
        isDefault: isDefault ?? false,
      }).returning();
      const insertedStages = stages && stages.length > 0
        ? await db.insert(crmPipelineStages).values(stages.map((s, i) => ({
            pipelineId: pipeline.id,
            name: s.name.trim(),
            color: s.color ?? '#6366f1',
            sortOrder: i,
            probability: s.probability ?? 0,
          }))).returning()
        : [];
      revalidateForWrite('portal');
      return json({ pipeline, stages: insertedStages });
    }
  );

  hasScope(ctx.scopes, 'crm:write') && server.registerTool(
    'crm_pipelines_update',
    {
      title: 'Update CRM pipeline',
      description: 'Rename a pipeline or toggle its default flag. For stage edits use crm_pipelines_add_stage / crm_pipelines_update_stage / crm_pipelines_delete_stage.',
      inputSchema: {
        id: z.number(),
        name: z.string().min(1).optional(),
        isDefault: z.boolean().optional(),
      },
    },
    async ({ id, name, isDefault }) => {
      if (!requireScope(ctx, 'crm:write')) return denied('crm:write');
      if (!(await requireService(clientId, 'crm'))) return serviceDenied('crm');
      const [existing] = await db.select({ id: crmPipelines.id }).from(crmPipelines)
        .where(and(eq(crmPipelines.id, id), eq(crmPipelines.clientId, clientId))).limit(1);
      if (!existing) return json({ error: 'Pipeline not found' });
      if (isDefault) {
        await db.update(crmPipelines)
          .set({ isDefault: false, updatedAt: new Date() })
          .where(and(eq(crmPipelines.clientId, clientId), eq(crmPipelines.isDefault, true)));
      }
      const patch: Record<string, unknown> = { updatedAt: new Date() };
      if (name !== undefined) patch.name = name.trim();
      if (isDefault !== undefined) patch.isDefault = isDefault;
      const [row] = await db.update(crmPipelines).set(patch)
        .where(eq(crmPipelines.id, id)).returning();
      revalidateForWrite('portal');
      return json(row);
    }
  );

  hasScope(ctx.scopes, 'crm:write') && server.registerTool(
    'crm_pipelines_add_stage',
    {
      title: 'Add stage to CRM pipeline',
      description: 'Append a stage to a pipeline. Uses next sortOrder unless specified.',
      inputSchema: {
        pipelineId: z.number(),
        name: z.string().min(1),
        color: z.string().optional(),
        probability: z.number().int().min(0).max(100).optional(),
        sortOrder: z.number().optional(),
      },
    },
    async ({ pipelineId, name, color, probability, sortOrder }) => {
      if (!requireScope(ctx, 'crm:write')) return denied('crm:write');
      if (!(await requireService(clientId, 'crm'))) return serviceDenied('crm');
      const [pipeline] = await db.select({ id: crmPipelines.id }).from(crmPipelines)
        .where(and(eq(crmPipelines.id, pipelineId), eq(crmPipelines.clientId, clientId))).limit(1);
      if (!pipeline) return json({ error: 'Pipeline not found' });
      const existing = await db.select({ id: crmPipelineStages.id }).from(crmPipelineStages)
        .where(eq(crmPipelineStages.pipelineId, pipelineId));
      const [row] = await db.insert(crmPipelineStages).values({
        pipelineId,
        name: name.trim(),
        color: color ?? '#6366f1',
        sortOrder: sortOrder ?? existing.length,
        probability: probability ?? 0,
      }).returning();
      revalidateForWrite('portal');
      return json(row);
    }
  );

  hasScope(ctx.scopes, 'crm:write') && server.registerTool(
    'crm_pipelines_update_stage',
    {
      title: 'Update CRM pipeline stage',
      description: 'Rename, recolor, reorder, or update win-probability on a pipeline stage.',
      inputSchema: {
        id: z.number(),
        name: z.string().min(1).optional(),
        color: z.string().optional(),
        probability: z.number().int().min(0).max(100).optional(),
        sortOrder: z.number().optional(),
      },
    },
    async ({ id, ...rest }) => {
      if (!requireScope(ctx, 'crm:write')) return denied('crm:write');
      if (!(await requireService(clientId, 'crm'))) return serviceDenied('crm');
      const [stage] = await db
        .select({ id: crmPipelineStages.id, pipelineId: crmPipelineStages.pipelineId })
        .from(crmPipelineStages)
        .innerJoin(crmPipelines, eq(crmPipelines.id, crmPipelineStages.pipelineId))
        .where(and(eq(crmPipelineStages.id, id), eq(crmPipelines.clientId, clientId))).limit(1);
      if (!stage) return json({ error: 'Stage not found' });
      const patch: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(rest)) if (v !== undefined) patch[k] = v;
      const [row] = await db.update(crmPipelineStages).set(patch)
        .where(eq(crmPipelineStages.id, id)).returning();
      revalidateForWrite('portal');
      return json(row);
    }
  );


  // ── CRM ACTIVITIES ─────────────────────────────────────────────────────
  hasScope(ctx.scopes, 'crm:read') && server.registerTool(
    'crm_activities_list',
    {
      title: 'List CRM activities / notes',
      description:
        'List logged activities (calls, emails, meetings, notes, tasks) filtered by contact/deal/company.',
      inputSchema: {
        contactId: z.number().optional(),
        dealId: z.number().optional(),
        companyId: z.number().optional(),
        type: z.enum(['call', 'email', 'meeting', 'note', 'task']).optional(),
        limit: z.number().min(1).max(200).default(50).optional(),
      },
    },
    async ({ contactId, dealId, companyId, type, limit = 50 }) => {
      if (!requireScope(ctx, 'crm:read')) return denied('crm:read');
      const conds = [eq(crmActivities.clientId, clientId)];
      if (contactId) conds.push(eq(crmActivities.contactId, contactId));
      if (dealId) conds.push(eq(crmActivities.dealId, dealId));
      if (companyId) conds.push(eq(crmActivities.companyId, companyId));
      if (type) conds.push(eq(crmActivities.type, type));
      const rows = await db.select().from(crmActivities)
        .where(and(...conds))
        .orderBy(desc(crmActivities.createdAt)).limit(limit);
      return json(rows);
    }
  );

  hasScope(ctx.scopes, 'crm:write') && server.registerTool(
    'crm_activities_create',
    {
      title: 'Log CRM activity / note',
      description:
        'Log an activity against a contact, deal, or company. Type "note" captures a plain observation; "task" supports dueDate; "completedAt" marks it done.',
      inputSchema: {
        type: z.enum(['call', 'email', 'meeting', 'note', 'task']),
        title: z.string().min(1),
        description: z.string().optional(),
        contactId: z.number().optional(),
        dealId: z.number().optional(),
        companyId: z.number().optional(),
        dueDate: z.string().optional().describe('ISO datetime (for tasks).'),
        completedAt: z.string().optional().describe('ISO datetime — mark activity as complete.'),
      },
    },
    async ({ type, title, description, contactId, dealId, companyId, dueDate, completedAt }) => {
      if (!requireScope(ctx, 'crm:write')) return denied('crm:write');
      if (!(await requireService(clientId, 'crm'))) return serviceDenied('crm');
      if (!contactId && !dealId && !companyId) {
        return json({ error: 'Provide at least one of contactId, dealId, or companyId' });
      }
      const [row] = await db.insert(crmActivities).values({
        clientId,
        type,
        title: title.trim(),
        description: description ?? null,
        contactId: contactId ?? null,
        dealId: dealId ?? null,
        companyId: companyId ?? null,
        dueDate: dueDate ? new Date(dueDate) : null,
        completedAt: completedAt ? new Date(completedAt) : null,
        createdBy: ctx.userId,
      }).returning();
      revalidateForWrite('portal');
      return json(row);
    }
  );
}
