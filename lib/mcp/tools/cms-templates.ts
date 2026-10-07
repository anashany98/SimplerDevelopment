/**
 * MCP tools — cms templates
 *
 * Split out of lib/mcp/tools/cms.ts to keep the per-domain registrar under
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
import { uploadToS3, presignPut, generateMediaKey } from '@/lib/s3/upload';
import { getS3Client, getBucketName } from '@/lib/s3/client';
import { HeadObjectCommand } from '@aws-sdk/client-s3';
import { cleanEmbedHtml } from '@/lib/html-embed-clean';
import { importHtmlAssets } from '@/lib/html-asset-import';
import {
  unpackAndUploadZip,
  isHttpError as isZipHttpError,
  MAX_ZIP_TOTAL_BYTES,
} from '@/lib/html-zip-upload';
import { assertSafeUrl } from '@/lib/ssrf-guard';
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
import { generateUniqueSubdomain, validateSubdomain, isSubdomainAvailable } from '@/lib/subdomain';
import { stageOrApply } from '../pending-changes';
import { buildPostUpdatePatch } from '../post-update-patch';
import { mintLinkForResult, approvalEnvelope, createApprovalLink } from '../approval-links';
import { publishBlocksUpdate } from '@/lib/realtime/internal-publisher';
import { assertBlocksAllowedForUserId, BlockGateError } from '@/lib/security/block-allowlist';
import { BLOCKS_SCHEMA_REFERENCE, BLOCKS_SCHEMA_TLDR } from '../blocks-schema';
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
  SLIM_POST_COLUMNS,
} from '../projections';
import { slugify } from '@/lib/publishing/slug';


export function registerCmsTemplatesTools(server: McpServer, ctx: PortalMcpContext): void {
  const clientId = ctx.client.id;

  // ── POST REVISIONS ─────────────────────────────────────────────────────
  hasScope(ctx.scopes, 'sites:read') && server.registerTool(
    'posts_list_revisions',
    {
      title: 'List post revisions',
      description: 'Revision history for a post (autosaves, manual saves, publishes).',
      inputSchema: {
        postId: z.number(),
        limit: z.number().min(1).max(100).default(25).optional(),
      },
    },
    async ({ postId, limit = 25 }) => {
      if (!requireScope(ctx, 'sites:read')) return denied('sites:read');
      const [post] = await db.select({ websiteId: posts.websiteId }).from(posts)
        .where(eq(posts.id, postId)).limit(1);
      if (!post) return json({ error: 'Post not found' });
      if (post.websiteId) {
        const [site] = await db.select({ id: clientWebsites.id }).from(clientWebsites)
          .where(and(eq(clientWebsites.id, post.websiteId), eq(clientWebsites.clientId, clientId))).limit(1);
        if (!site) return json({ error: 'Permission denied' });
      } else {
        return json({ error: 'Permission denied — agency post' });
      }
      const rows = await db.select().from(postRevisions)
        .where(eq(postRevisions.postId, postId))
        .orderBy(desc(postRevisions.createdAt)).limit(limit);
      return json(rows);
    }
  );


  // ── BLOCK TEMPLATES ────────────────────────────────────────────────────
  hasScope(ctx.scopes, 'sites:read') && server.registerTool(
    'block_templates_list',
    {
      title: 'List block templates',
      description: 'List reusable CMS block templates. Global templates are shared across clients.',
      inputSchema: {
        category: z.enum(['custom', 'section', 'global']).optional(),
        scope: z.enum(['block', 'section', 'global']).optional(),
      },
    },
    async ({ category, scope }) => {
      if (!requireScope(ctx, 'sites:read')) return denied('sites:read');
      // Tenant scope: own client rows + platform-global (NULL client_id).
      const tenantScope = or(eq(blockTemplates.clientId, clientId), isNull(blockTemplates.clientId))!;
      const conds: Parameters<typeof and> = [tenantScope];
      if (category) conds.push(eq(blockTemplates.category, category));
      if (scope) conds.push(eq(blockTemplates.scope, scope));
      const rows = await db.select({
        id: blockTemplates.id,
        name: blockTemplates.name,
        slug: blockTemplates.slug,
        description: blockTemplates.description,
        category: blockTemplates.category,
        scope: blockTemplates.scope,
        thumbnail: blockTemplates.thumbnail,
        tags: blockTemplates.tags,
        version: blockTemplates.version,
        updatedAt: blockTemplates.updatedAt,
      }).from(blockTemplates)
        .where(and(...conds))
        .orderBy(desc(blockTemplates.updatedAt));
      return json(rows);
    }
  );

  hasScope(ctx.scopes, 'sites:read') && server.registerTool(
    'block_templates_get',
    {
      title: 'Get block template with blocks',
      description: 'Fetch full template including its blocks JSON.',
      inputSchema: { id: z.number() },
    },
    async ({ id }) => {
      if (!requireScope(ctx, 'sites:read')) return denied('sites:read');
      const [row] = await db.select().from(blockTemplates).where(eq(blockTemplates.id, id)).limit(1);
      if (!row) return json({ error: 'Template not found' });
      // Tenant gate: hide other clients' templates; globals (NULL) are fine.
      if (row.clientId != null && row.clientId !== clientId) {
        return json({ error: 'Template not found' });
      }
      return json(row);
    }
  );

  hasScope(ctx.scopes, 'sites:write') && server.registerTool(
    'block_templates_create',
    {
      title: 'Create block template (draft)',
      description: 'Create a reusable CMS block template. Writes a base row with everything staged in the `draft` jsonb (pendingCreate=true). The template picker and "use this template" flow ignore draft-only templates until `block_templates_publish` is called. `slug` must be unique across the agency. `scope: "global"` syncs the template back to every post that embeds it; `block` and `section` are copy-on-insert.',
      inputSchema: {
        name: z.string().min(1),
        slug: z.string().min(1).regex(/^[a-z0-9-]+$/, 'Slug must be lowercase alphanumeric with hyphens'),
        description: z.string().optional(),
        category: z.string().default('custom').optional(),
        scope: z.enum(['block', 'section', 'global']).default('block').optional(),
        blocks: z.array(z.any()).min(1),
        thumbnail: z.string().url().nullable().optional(),
        tags: z.array(z.string()).optional(),
        lockedFields: z.array(z.string()).optional().describe('Field paths that can\'t be edited when the template is reused (e.g. "0.type", "0.style.backgroundColor").'),
      },
    },
    async (args) => {
      if (!requireScope(ctx, 'sites:write')) return denied('sites:write');
      if (!(await requireService(clientId, 'websites'))) return serviceDenied('websites');
      try {
        await assertBlocksAllowedForUserId(args.blocks, ctx.userId);
      } catch (e) {
        if (e instanceof BlockGateError) return json({ error: e.message });
        throw e;
      }
      const [collision] = await db.select({ id: blockTemplates.id }).from(blockTemplates)
        .where(eq(blockTemplates.slug, args.slug)).limit(1);
      if (collision) return json({ error: 'A template with this slug already exists' });
      const result = await stageOrApply({
        ctx,
        entityType: 'block_template',
        operation: 'create',
        entityId: null,
        summary: `Create block template "${args.name}" (draft)`,
        payload: args,
        apply: async () => {
          const draft: import('@/lib/db/schema').BlockTemplateDraft = {
            pendingCreate: true,
            name: args.name,
            description: args.description ?? null,
            category: args.category ?? 'custom',
            scope: args.scope ?? 'block',
            blocks: args.blocks,
            thumbnail: args.thumbnail ?? null,
            tags: args.tags ?? [],
            lockedFields: args.lockedFields ?? [],
            updatedAt: new Date().toISOString(),
            updatedBy: ctx.userId,
          } as import('@/lib/db/schema').BlockTemplateDraft & { pendingCreate: boolean };
          // Live columns get the same values so a later `_publish` can be a
          // simple `draft = null` write, but the renderer/picker filter on
          // draft.pendingCreate to hide unpublished templates.
          const [row] = await db.insert(blockTemplates).values({
            name: args.name,
            slug: args.slug,
            description: args.description ?? null,
            category: args.category ?? 'custom',
            scope: args.scope ?? 'block',
            blocks: args.blocks,
            thumbnail: args.thumbnail ?? null,
            tags: args.tags ?? [],
            lockedFields: args.lockedFields ?? [],
            // Scope to caller's tenant. Admins promoting to platform-global use
            // the admin /api/block-templates path (no clientId stamp).
            clientId,
            createdBy: ctx.userId,
            draft,
          }).returning();
          return row;
        },
      });
      const approval = approvalEnvelope(
        await mintLinkForResult({ ctx, entityType: 'block_template', summary: `Template "${args.name}"`, result }),
      );
      if (result.pending) return json({ pending: true, pendingId: result.pendingId, summary: result.summary, status: 'pending', approval });
      revalidateForWrite('portal');
      return json({ ...result.data, approval });
    }
  );

  hasScope(ctx.scopes, 'sites:write') && server.registerTool(
    'block_templates_update',
    {
      title: 'Update block template (draft)',
      description: 'Stage changes to a block template into its draft jsonb overlay. The live columns and version are untouched — the picker and global-sync paths keep using the published copy until `block_templates_publish` is called.',
      inputSchema: {
        id: z.number().int().positive(),
        name: z.string().min(1).optional(),
        description: z.string().nullable().optional(),
        category: z.string().optional(),
        scope: z.enum(['block', 'section', 'global']).optional(),
        blocks: z.array(z.any()).min(1).optional(),
        thumbnail: z.string().url().nullable().optional(),
        tags: z.array(z.string()).optional(),
        lockedFields: z.array(z.string()).optional(),
      },
    },
    async ({ id, ...rest }) => {
      if (!requireScope(ctx, 'sites:write')) return denied('sites:write');
      if (!(await requireService(clientId, 'websites'))) return serviceDenied('websites');
      const [existing] = await db.select().from(blockTemplates).where(eq(blockTemplates.id, id)).limit(1);
      if (!existing) return json({ error: 'Template not found' });
      // Tenant gate — own client only. Refuse mutation on globals (NULL
      // client_id) so portal keys can't edit platform-curated templates.
      if (existing.clientId !== clientId) return json({ error: 'Template not found' });
      if (rest.blocks !== undefined) {
        try {
          await assertBlocksAllowedForUserId(rest.blocks, ctx.userId);
        } catch (e) {
          if (e instanceof BlockGateError) return json({ error: e.message });
          throw e;
        }
      }
      const result = await stageOrApply({
        ctx,
        entityType: 'block_template',
        operation: 'update',
        entityId: id,
        summary: `Update block template "${existing.name}" (draft)`,
        payload: { id, ...rest },
        originalSnapshot: {
          name: existing.name,
          description: existing.description,
          category: existing.category,
          scope: existing.scope,
          version: existing.version,
          draft: existing.draft,
        },
        apply: async () => {
          const prev: import('@/lib/db/schema').BlockTemplateDraft = existing.draft ?? {};
          const next: import('@/lib/db/schema').BlockTemplateDraft = {
            ...prev,
            updatedAt: new Date().toISOString(),
            updatedBy: ctx.userId,
          };
          for (const [k, v] of Object.entries(rest)) {
            if (v !== undefined) (next as Record<string, unknown>)[k] = v;
          }
          const [row] = await db.update(blockTemplates)
            .set({ draft: next, updatedAt: new Date() })
            .where(eq(blockTemplates.id, id)).returning();
          return row;
        },
      });
      const approval = approvalEnvelope(
        await mintLinkForResult({
          ctx,
          entityType: 'block_template',
          summary: `Template "${existing.name}" update`,
          result,
        }),
      );
      if (result.pending) return json({ pending: true, pendingId: result.pendingId, summary: result.summary, status: 'pending', approval });
      revalidateForWrite('portal');
      return json({ ...result.data, approval });
    }
  );

  hasScope(ctx.scopes, 'sites:delete') && server.registerTool(
    'block_templates_delete',
    {
      title: 'Delete block template (draft)',
      description: 'Stages a tombstone on the template (draft.pendingDelete). The row is not actually deleted, and embedded usages keep resolving, until `block_templates_publish` runs. Refuses to stage a delete if any posts still embed it as a global template — remove or convert those usages first.',
      inputSchema: { id: z.number().int().positive() },
    },
    async ({ id }) => {
      if (!requireScope(ctx, 'sites:delete')) return denied('sites:delete');
      if (!(await requireService(clientId, 'websites'))) return serviceDenied('websites');
      const [existing] = await db.select().from(blockTemplates).where(eq(blockTemplates.id, id)).limit(1);
      if (!existing) return json({ error: 'Template not found' });
      if (existing.clientId !== clientId) return json({ error: 'Template not found' });
      const usages = await db.select({ id: blockTemplateUsages.id }).from(blockTemplateUsages)
        .where(eq(blockTemplateUsages.templateId, id));
      if (usages.length > 0) {
        return json({ error: `Cannot delete: template is used in ${usages.length} post(s). Remove usages first or convert to non-global.` });
      }
      const result = await stageOrApply({
        ctx,
        entityType: 'block_template',
        operation: 'delete',
        entityId: id,
        summary: `Delete block template "${existing.name}" (draft tombstone)`,
        payload: { id },
        originalSnapshot: { name: existing.name, slug: existing.slug, draft: existing.draft },
        apply: async () => {
          const prev: import('@/lib/db/schema').BlockTemplateDraft = existing.draft ?? {};
          const next: import('@/lib/db/schema').BlockTemplateDraft = {
            ...prev,
            pendingDelete: true,
            updatedAt: new Date().toISOString(),
            updatedBy: ctx.userId,
          };
          await db.update(blockTemplates)
            .set({ draft: next, updatedAt: new Date() })
            .where(eq(blockTemplates.id, id));
          return { success: true, id, pendingDelete: true };
        },
      });
      if (result.pending) return json({ pending: true, pendingId: result.pendingId, summary: result.summary, status: 'pending' });
      revalidateForWrite('portal');
      return json(result.data);
    }
  );

  hasScope(ctx.scopes, 'sites:write') && server.registerTool(
    'block_templates_publish',
    {
      title: 'Publish block template draft',
      description: 'Promote a single block template draft to live. If draft.pendingDelete: the row is removed. If draft.pendingCreate: the draft flag is cleared (template becomes visible in the picker). Otherwise: draft fields are applied onto the live columns (bumping `version` when `blocks` changed) and draft is cleared. Subject to the same approval gate as other CMS writes.',
      inputSchema: { id: z.number().int().positive() },
    },
    async ({ id }) => {
      if (!requireScope(ctx, 'sites:write')) return denied('sites:write');
      if (!(await requireService(clientId, 'websites'))) return serviceDenied('websites');
      const [existing] = await db.select().from(blockTemplates).where(eq(blockTemplates.id, id)).limit(1);
      if (!existing) return json({ error: 'Template not found' });
      if (existing.clientId !== clientId) return json({ error: 'Template not found' });
      const result = await stageOrApply({
        ctx,
        entityType: 'block_template',
        operation: 'publish',
        entityId: id,
        summary: `Publish block template "${existing.name}"`,
        payload: { id },
        originalSnapshot: {
          name: existing.name,
          version: existing.version,
          draft: existing.draft,
        },
        apply: async () => {
          const draft: import('@/lib/db/schema').BlockTemplateDraft | null = existing.draft;
          if (!draft) return { success: true, id, noop: true };
          if (draft.pendingDelete) {
            await db.delete(blockTemplates).where(eq(blockTemplates.id, id));
            return { success: true, id, deleted: true };
          }
          const patch: Record<string, unknown> = { draft: null, updatedAt: new Date() };
          if (draft.name !== undefined) patch.name = draft.name;
          if (draft.description !== undefined) patch.description = draft.description;
          if (draft.category !== undefined) patch.category = draft.category;
          if (draft.scope !== undefined) patch.scope = draft.scope;
          if (draft.thumbnail !== undefined) patch.thumbnail = draft.thumbnail;
          if (draft.tags !== undefined) patch.tags = draft.tags;
          if (draft.lockedFields !== undefined) patch.lockedFields = draft.lockedFields;
          if (draft.blocks !== undefined) {
            patch.blocks = draft.blocks;
            // Bump version on block-tree changes — global usages key off this
            // to detect drift between the embedded copy and the source.
            patch.version = existing.version + 1;
          }
          const [row] = await db.update(blockTemplates).set(patch)
            .where(eq(blockTemplates.id, id)).returning();
          return row;
        },
      });
      if (result.pending) return json({ pending: true, pendingId: result.pendingId, summary: result.summary, status: 'pending' });
      revalidateForWrite('portal');
      return json(result.data);
    }
  );

  // ── block_templates_fork ───────────────────────────────────────────
  // Lightweight clone — duplicates the source template into a new row tied
  // back via `parent_template_id`. The new row starts as a fresh draft
  // (pendingCreate=true on the draft overlay) so it's hidden from the
  // picker until the approval-link reviewer approves it.
  hasScope(ctx.scopes, 'sites:write') && server.registerTool(
    'block_templates_fork',
    {
      title: 'Fork a block template into a new draft',
      description:
        'Duplicate a published block template into a new draft template tied to the original via parent_template_id. Use when you need to riff on a template without touching the original (e.g. building a variant of a hero block for a specific landing page). Returns the new template id + an approval URL.',
      inputSchema: {
        id: z.number().int().positive().describe('Source template id to fork.'),
        nameSuffix: z.string().default(' (fork)').optional(),
        slugSuffix: z.string().default('').optional().describe('Optional suffix appended before the unique fork tag in the new slug.'),
      },
    },
    async ({ id, nameSuffix = ' (fork)', slugSuffix = '' }) => {
      if (!requireScope(ctx, 'sites:write')) return denied('sites:write');
      if (!(await requireService(clientId, 'websites'))) return serviceDenied('websites');
      const [source] = await db.select().from(blockTemplates).where(eq(blockTemplates.id, id)).limit(1);
      if (!source) return json({ error: 'Source template not found' });
      // Source must be either this tenant's own template or a platform-global
      // (NULL client_id). Forks always land in the calling tenant's scope.
      if (source.clientId != null && source.clientId !== clientId) {
        return json({ error: 'Source template not found' });
      }
      const forkSlug = `${source.slug}${slugSuffix ? `-${slugSuffix}` : ''}-fork-${Date.now().toString(36)}`;
      const draft: import('@/lib/db/schema').BlockTemplateDraft = {
        pendingCreate: true,
        name: `${source.name}${nameSuffix}`,
        description: source.description ?? null,
        category: source.category,
        scope: source.scope,
        blocks: source.blocks,
        thumbnail: source.thumbnail ?? null,
        tags: (source.tags as string[] | null) ?? [],
        lockedFields: (source.lockedFields as string[] | null) ?? [],
        updatedAt: new Date().toISOString(),
        updatedBy: ctx.userId,
      };
      const [forkRow] = await db.insert(blockTemplates).values({
        name: `${source.name}${nameSuffix}`,
        slug: forkSlug,
        description: source.description,
        category: source.category,
        scope: source.scope,
        blocks: source.blocks as never,
        thumbnail: source.thumbnail,
        tags: source.tags ?? [],
        lockedFields: source.lockedFields ?? [],
        clientId,
        createdBy: ctx.userId,
        parentTemplateId: source.id,
        draft,
      }).returning();
      const link = await createApprovalLink({
        ctx,
        entityType: 'block_template',
        entityId: forkRow.id,
        summary: `Fork of template "${source.name}"`,
      });
      revalidateForWrite('portal');
      return json({ ...forkRow, approval: approvalEnvelope(link) });
    }
  );
}
