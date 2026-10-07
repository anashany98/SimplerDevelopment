/**
 * MCP tools — cms.
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

export function registerCmsTools(server: McpServer, ctx: PortalMcpContext): void {
  const clientId = ctx.client.id;

  // ── WEBSITES / POSTS ───────────────────────────────────────────────────
  hasScope(ctx.scopes, 'sites:read') && server.registerTool(
    'sites_list',
    {
      title: 'List websites',
      description: 'List all websites owned by the client.',
      inputSchema: {},
    },
    async () => {
      if (!requireScope(ctx, 'sites:read')) return denied('sites:read');
      const rows = await db.select().from(clientWebsites)
        .where(eq(clientWebsites.clientId, clientId))
        .orderBy(desc(clientWebsites.createdAt));
      return json(rows);
    }
  );

  hasScope(ctx.scopes, 'sites:write') && server.registerTool(
    'sites_create',
    {
      title: 'Create website',
      description: 'Create a new website for the client. Generates a unique subdomain automatically unless one is provided.',
      inputSchema: {
        name: z.string().min(1),
        domain: z.string().nullable().optional(),
        description: z.string().nullable().optional(),
        subdomain: z.string().optional(),
      },
    },
    async (args) => {
      if (!requireScope(ctx, 'sites:write')) return denied('sites:write');
      if (!(await requireService(clientId, 'websites'))) return serviceDenied('websites');

      let sub: string;
      if (args.subdomain) {
        const err = validateSubdomain(args.subdomain);
        if (err) return json({ error: err });
        if (!(await isSubdomainAvailable(args.subdomain))) return json({ error: 'subdomain taken' });
        sub = args.subdomain;
      } else {
        sub = await generateUniqueSubdomain(ctx.client.company || 'site', args.name);
      }

      const result = await stageOrApply({
        ctx,
        entityType: 'site',
        operation: 'create',
        entityId: null,
        summary: `Create website "${args.name}"`,
        payload: {
          name: args.name,
          domain: args.domain ?? null,
          description: args.description ?? null,
          subdomain: sub,
        },
        apply: async () => {
          const [row] = await db.insert(clientWebsites).values({
            clientId,
            name: args.name,
            domain: args.domain ?? null,
            description: args.description ?? null,
            subdomain: sub,
            vercelDomain: `${sub}.simplerdevelopment.com`,
            deploymentStatus: 'pending',
            active: true,
          }).returning();
          return row;
        },
      });
      if (result.pending) return json({ pending: true, pendingId: result.pendingId, summary: result.summary, status: 'pending' });
      revalidateForWrite('sites');
      const { id, name, subdomain: siteSub, vercelDomain } = result.data;
      return json({ id, name, subdomain: siteSub, vercelDomain });
    }
  );

  hasScope(ctx.scopes, 'sites:read') && server.registerTool(
    'posts_list',
    {
      title: 'List posts',
      description:
        'List content posts for a website (or agency site if websiteId omitted). Returns a SLIM projection by default (no content blob). Pass `includeContent: true` only when you genuinely need the full body — for block-rich pages each post can be multi-MB. To inspect a single post in full, prefer `posts_get`.',
      inputSchema: {
        websiteId: z.number().optional(),
        postType: z.string().optional().describe('blog, page, etc.'),
        publishedOnly: z.boolean().optional(),
        limit: z.number().default(50).optional(),
        includeContent: z.boolean().default(false).optional().describe('Include the full content/customCss/customJs/SEO long-text fields. Default false — large pages can run multiple MB per row.'),
      },
    },
    async ({ websiteId, postType, publishedOnly, limit = 50, includeContent }) => {
      if (!requireScope(ctx, 'sites:read')) return denied('sites:read');
      if (websiteId) {
        const [site] = await db.select({ id: clientWebsites.id }).from(clientWebsites)
          .where(and(eq(clientWebsites.id, websiteId), eq(clientWebsites.clientId, clientId))).limit(1);
        if (!site) return json({ error: 'Site not found' });
      }
      const conds = [] as ReturnType<typeof eq>[];
      if (websiteId) {
        conds.push(eq(posts.websiteId, websiteId));
      } else {
        // Tenancy: posts carry only a (nullable) website_id — there is no
        // client_id column — so the ONLY way to scope to this tenant is via
        // the client's websites. Without this, omitting websiteId returned
        // every post across every client (cross-tenant leak). Constrain to
        // this client's website ids; if it owns none, return nothing.
        const owned = await db.select({ id: clientWebsites.id }).from(clientWebsites)
          .where(eq(clientWebsites.clientId, clientId));
        const ownedIds = owned.map((w) => w.id);
        if (ownedIds.length === 0) return json([]);
        conds.push(inArray(posts.websiteId, ownedIds));
      }
      if (postType) conds.push(eq(posts.postType, postType));
      if (publishedOnly) conds.push(eq(posts.published, true));
      const rows = await db.select(postProjection(includeContent)).from(posts)
        .where(conds.length ? and(...conds) : undefined)
        .orderBy(desc(posts.createdAt)).limit(limit);
      return json(rows);
    }
  );

  hasScope(ctx.scopes, 'sites:read') && server.registerTool(
    'posts_get',
    {
      title: 'Get post',
      description:
        'Fetch a single post by id. Defaults to the slim projection (no content blob); pass `includeContent: true` to retrieve the full block payload. Use this — not posts_list — when you need a single page in full.',
      inputSchema: {
        id: z.number(),
        includeContent: z.boolean().default(false).optional().describe('Include the full content/customCss/customJs/SEO long-text fields. Default false.'),
      },
    },
    async ({ id, includeContent }) => {
      if (!requireScope(ctx, 'sites:read')) return denied('sites:read');
      const [row] = await db.select(postProjection(includeContent)).from(posts)
        .where(eq(posts.id, id)).limit(1);
      if (!row) return json({ error: 'Post not found' });
      if (row.websiteId) {
        const [site] = await db.select({ id: clientWebsites.id }).from(clientWebsites)
          .where(and(eq(clientWebsites.id, row.websiteId), eq(clientWebsites.clientId, clientId))).limit(1);
        if (!site) return json({ error: 'Permission denied' });
      } else {
        return json({ error: 'Permission denied — agency post' });
      }
      return json(row);
    }
  );

  hasScope(ctx.scopes, 'sites:write') && server.registerTool(
    'posts_create',
    {
      title: 'Create post',
      description:
        `Create a content post (blog entry or page) on a website. Returns the slim post projection by default (no content echo); pass \`includeContent: true\` only if you need the body in the response. ${BLOCKS_SCHEMA_TLDR}`,
      inputSchema: {
        websiteId: z.number(),
        title: z.string().min(1),
        slug: z.string().min(1),
        content: z.string().optional().describe('Plain text/HTML — wrapped in a single text block. Prefer `blocks` for structured pages.'),
        blocks: z.array(z.any()).optional().describe('Array of Block objects matching the visual editor schema (e.g. {id, type:"hero", order, title, ...}).'),
        excerpt: z.string().optional(),
        postType: z.string().default('blog').optional(),
        published: z.boolean().optional(),
        customCss: z.string().optional().describe('Per-post custom CSS injected at render time, scoped to the page.'),
        customJs: z.string().optional().describe('Per-post custom JS injected at render time, scoped to the page.'),
        includeContent: z.boolean().default(false).optional().describe('Echo back the full content/customCss/customJs/SEO long-text in the response. Default false — saves several MB per call for block-rich pages.'),
      },
    },
    async (args) => {
      if (!requireScope(ctx, 'sites:write')) return denied('sites:write');
      if (!(await requireService(clientId, 'websites'))) return serviceDenied('websites');
      const [site] = await db.select({ id: clientWebsites.id }).from(clientWebsites)
        .where(and(eq(clientWebsites.id, args.websiteId), eq(clientWebsites.clientId, clientId))).limit(1);
      if (!site) return json({ error: 'Site not found' });
      try {
        await assertBlocksAllowedForUserId(args.blocks, ctx.userId);
      } catch (e) {
        if (e instanceof BlockGateError) return json({ error: e.message });
        throw e;
      }
      const { includeContent, ...createArgs } = args;
      const result = await stageOrApply({
        ctx,
        entityType: 'post',
        operation: 'create',
        entityId: null,
        summary: `Create post "${createArgs.title}" on website ${createArgs.websiteId}`,
        payload: createArgs,
        apply: async () => {
          const [row] = await db.insert(posts).values({
            websiteId: createArgs.websiteId,
            title: createArgs.title,
            slug: createArgs.slug,
            content: serializePostContent({ blocks: createArgs.blocks, content: createArgs.content }),
            excerpt: createArgs.excerpt ?? null,
            postType: createArgs.postType ?? 'blog',
            published: createArgs.published ?? false,
            publishedAt: createArgs.published ? new Date() : null,
            customCss: createArgs.customCss ?? null,
            customJs: createArgs.customJs ?? null,
          }).returning(postProjection(includeContent));
          return row;
        },
      });
      const approval = approvalEnvelope(
        await mintLinkForResult({ ctx, entityType: 'post', summary: `Page "${createArgs.title}"`, result }),
      );
      if (result.pending) return json({ pending: true, pendingId: result.pendingId, summary: result.summary, status: 'pending', approval });
      revalidateForWrite('posts');
      return json({ ...result.data, approval });
    }
  );

  hasScope(ctx.scopes, 'sites:write') && server.registerTool(
    'posts_update',
    {
      title: 'Update post',
      description:
        `Update a content post. Returns the slim post projection by default (no content echo); pass \`includeContent: true\` only if you need the body in the response. ${BLOCKS_SCHEMA_TLDR}`,
      inputSchema: {
        id: z.number(),
        title: z.string().optional(),
        content: z.string().optional().describe('Plain text/HTML — wrapped in a single text block. Prefer `blocks`.'),
        blocks: z.array(z.any()).optional().describe('Array of Block objects matching the visual editor schema.'),
        excerpt: z.string().optional(),
        published: z.boolean().optional(),
        customCss: z.string().nullable().optional().describe('Per-post custom CSS. Pass null to clear.'),
        customJs: z.string().nullable().optional().describe('Per-post custom JS. Pass null to clear.'),
        seoTitle: z.string().nullable().optional().describe('SEO <title> tag. Pass null to clear.'),
        seoDescription: z.string().nullable().optional().describe('SEO <meta name="description"> content. Pass null to clear.'),
        ogImage: z.string().nullable().optional().describe('Open Graph image URL. Pass null to clear.'),
        canonicalUrl: z.string().nullable().optional().describe('Canonical URL override. Pass null to clear.'),
        noIndex: z.boolean().optional().describe('Set true to emit <meta name="robots" content="noindex">.'),
        includeContent: z.boolean().default(false).optional().describe('Echo back the full content/customCss/customJs/SEO long-text in the response. Default false — saves several MB per call for block-rich pages.'),
      },
    },
    async ({ id, includeContent, ...rest }) => {
      if (!requireScope(ctx, 'sites:write')) return denied('sites:write');
      if (!(await requireService(clientId, 'websites'))) return serviceDenied('websites');
      const [post] = await db.select().from(posts).where(eq(posts.id, id)).limit(1);
      if (!post) return json({ error: 'Post not found' });
      if (post.websiteId) {
        const [site] = await db.select({ id: clientWebsites.id }).from(clientWebsites)
          .where(and(eq(clientWebsites.id, post.websiteId), eq(clientWebsites.clientId, clientId))).limit(1);
        if (!site) return json({ error: 'Permission denied' });
      } else {
        return json({ error: 'Permission denied — agency post' });
      }
      try {
        await assertBlocksAllowedForUserId(rest.blocks, ctx.userId);
      } catch (e) {
        if (e instanceof BlockGateError) return json({ error: e.message });
        throw e;
      }
      // A `posts_fork` draft already carries its OWN entity approval link (the
      // reviewer approves the fork to publish it live). Under a
      // require_cms_approval key, a follow-up posts_update on that fork would
      // otherwise be staged into a SEPARATE pending_change — orphaning the edit
      // from the fork link the caller was handed, so the fork's preview shows
      // the unmodified clone ("nothing changed"). Apply edits to an unpublished
      // fork directly; its publish is the gate. (Setting `published: true` IS
      // that publish, so it still stages. Plain non-fork drafts also still
      // stage — AI edits on a require-approval key stay reviewable.)
      const isUnpublishedForkEdit =
        post.parentPostId != null && !post.published && rest.published !== true;
      const result = await stageOrApply({
        ctx,
        entityType: 'post',
        operation: 'update',
        entityId: id,
        skipApproval: isUnpublishedForkEdit,
        summary: `Update post #${id}${rest.title ? ` → "${rest.title}"` : ''}${rest.published === true ? ' + publish' : ''}`,
        payload: { id, ...rest },
        originalSnapshot: { title: post.title, published: post.published, excerpt: post.excerpt, content: post.content, customCss: post.customCss, customJs: post.customJs, seoTitle: post.seoTitle, seoDescription: post.seoDescription, ogImage: post.ogImage, canonicalUrl: post.canonicalUrl, noIndex: post.noIndex },
        apply: async () => {
          const patch = buildPostUpdatePatch(rest as Record<string, unknown>);
          const [row] = await db.update(posts).set(patch).where(eq(posts.id, id)).returning(postProjection(includeContent));
          return row;
        },
      });
      const approval = approvalEnvelope(
        await mintLinkForResult({
          ctx,
          entityType: 'post',
          summary: `Page #${id}${rest.title ? ` → "${rest.title}"` : ''}`,
          result,
        }),
      );
      if (result.pending) return json({ pending: true, pendingId: result.pendingId, summary: result.summary, status: 'pending', approval });
      revalidateForWrite('posts');
      return json({ ...result.data, approval });
    }
  );
}
