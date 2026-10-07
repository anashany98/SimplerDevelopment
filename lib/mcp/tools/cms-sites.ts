/**
 * MCP tools — cms sites
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


export function registerCmsSitesTools(server: McpServer, ctx: PortalMcpContext): void {
  const clientId = ctx.client.id;

  // ── SITES WRITE ────────────────────────────────────────────────────────
  hasScope(ctx.scopes, 'sites:write') && server.registerTool(
    'sites_update',
    {
      title: 'Update website settings',
      description:
        'Update metadata on a client website (name, domain, description, active flag, public access gating, preview code). DNS/Vercel provisioning is not triggered by this tool — changes are persisted to the portal only.',
      inputSchema: {
        id: z.number(),
        name: z.string().min(1).optional(),
        domain: z.string().nullable().optional(),
        description: z.string().nullable().optional(),
        active: z.boolean().optional(),
        publicAccess: z.boolean().optional(),
        // Use `.int().positive()` to force a non-empty JSON-schema export.
        // Plain `z.number().nullable().optional()` collapses to `{}` in the
        // current zod-to-json-schema serializer the MCP transport uses,
        // which lets clients send `"104"` (string) past the front door —
        // server-side zod then rejects with the schema-says-number error.
        // The `.int().positive()` chain emits proper number constraints
        // that the transport coerces correctly.
        brandingProfileId: z.number().int().positive().nullable().optional(),
        previewCode: z.string().nullable().optional(),
      },
    },
    async ({ id, previewCode, ...rest }) => {
      if (!requireScope(ctx, 'sites:write')) return denied('sites:write');
      if (!(await requireService(clientId, 'websites'))) return serviceDenied('websites');
      const [existing] = await db.select().from(clientWebsites)
        .where(and(eq(clientWebsites.id, id), eq(clientWebsites.clientId, clientId))).limit(1);
      if (!existing) return json({ error: 'Site not found' });

      // Validate + resolve previewCode before entering stageOrApply, mirroring
      // the PUT route — normalize → validate format → uniqueness check.
      let resolvedPreviewCode: string | null | undefined = undefined; // undefined = not provided
      if (previewCode !== undefined) {
        if (previewCode === null || previewCode === '') {
          resolvedPreviewCode = null;
        } else {
          const normalized = previewCode.trim().toUpperCase().replace(/\s+/g, '');
          if (!/^[A-Z0-9-]{4,64}$/.test(normalized)) {
            return json({ error: 'Preview code must be 4-64 chars (letters, numbers, hyphens).' });
          }
          const [clash] = await db
            .select({ id: clientWebsites.id })
            .from(clientWebsites)
            .where(eq(clientWebsites.previewCode, normalized))
            .limit(1);
          if (clash && clash.id !== id) {
            return json({ error: 'That preview code is already in use on another site.' });
          }
          resolvedPreviewCode = normalized;
        }
      }

      const result = await stageOrApply({
        ctx,
        entityType: 'site',
        operation: 'update',
        entityId: id,
        summary: `Update website "${existing.name}" settings`,
        payload: { id, ...(resolvedPreviewCode !== undefined ? { previewCode: resolvedPreviewCode } : {}), ...rest },
        originalSnapshot: {
          name: existing.name,
          domain: existing.domain,
          description: existing.description,
          active: existing.active,
          publicAccess: existing.publicAccess,
          brandingProfileId: existing.brandingProfileId,
          previewCode: existing.previewCode,
        },
        apply: async () => {
          const patch: Record<string, unknown> = { updatedAt: new Date() };
          for (const [k, v] of Object.entries(rest)) if (v !== undefined) patch[k] = v;
          // previewCode handled explicitly (not via generic loop) — already
          // normalized and validated above.
          if (resolvedPreviewCode !== undefined) patch.previewCode = resolvedPreviewCode;
          const [row] = await db.update(clientWebsites).set(patch)
            .where(eq(clientWebsites.id, id)).returning();
          return row;
        },
      });
      if (result.pending) return json({ pending: true, pendingId: result.pendingId, summary: result.summary, status: 'pending' });
      revalidateForWrite('sites');
      return json(result.data);
    }
  );


  // ── SITE CUSTOM CODE ──────────────────────────────────────────────────
  // Site-wide custom CSS/JS — applied to every page on the website.
  // Cascade order: site code → CPT code → per-post code, so a page can
  // override a CPT-level rule which can override a site rule.
  hasScope(ctx.scopes, 'sites:read') && server.registerTool(
    'sites_get_custom_code',
    {
      title: 'Get site custom CSS/JS',
      description: 'Get the site-wide custom CSS and JS that injects on every page render. Cascades before CPT and per-post code.',
      inputSchema: { id: z.number().int().positive() },
    },
    async ({ id }) => {
      if (!requireScope(ctx, 'sites:read')) return denied('sites:read');
      const [site] = await db.select({
        id: clientWebsites.id,
        customCss: clientWebsites.customCss,
        customJs: clientWebsites.customJs,
      }).from(clientWebsites)
        .where(and(eq(clientWebsites.id, id), eq(clientWebsites.clientId, clientId)))
        .limit(1);
      if (!site) return json({ error: 'Site not found' });
      return json({ customCss: site.customCss || '', customJs: site.customJs || '' });
    }
  );

  hasScope(ctx.scopes, 'sites:write') && server.registerTool(
    'sites_update_custom_code',
    {
      title: 'Update site custom CSS/JS (draft)',
      description: 'Writes to the DRAFT site-wide custom CSS/JS — the public renderer keeps serving the previously-published live values until `sites_publish_custom_code` is called. Pass an empty string to stage a clear; omit to leave unchanged. Use `sites_get_custom_code` to inspect the currently-live values; this tool never touches them directly.',
      inputSchema: {
        id: z.number().int().positive(),
        customCss: z.string().optional().describe('Stages into draft_custom_css. Empty string = stage a clear.'),
        customJs: z.string().optional().describe('Stages into draft_custom_js. Empty string = stage a clear.'),
      },
    },
    async ({ id, customCss, customJs }) => {
      if (!requireScope(ctx, 'sites:write')) return denied('sites:write');
      if (!(await requireService(clientId, 'websites'))) return serviceDenied('websites');
      const [existing] = await db.select().from(clientWebsites)
        .where(and(eq(clientWebsites.id, id), eq(clientWebsites.clientId, clientId)))
        .limit(1);
      if (!existing) return json({ error: 'Site not found' });
      const result = await stageOrApply({
        ctx,
        entityType: 'site',
        operation: 'update',
        entityId: id,
        summary: `Update site custom CSS/JS for "${existing.name}" (draft)`,
        payload: { id, customCss, customJs },
        originalSnapshot: {
          customCss: existing.customCss,
          customJs: existing.customJs,
          draftCustomCss: existing.draftCustomCss,
          draftCustomJs: existing.draftCustomJs,
        },
        apply: async () => {
          const patch: Record<string, unknown> = {
            updatedAt: new Date(),
            draftUpdatedAt: new Date(),
            draftUpdatedBy: ctx.userId,
          };
          if (customCss !== undefined) patch.draftCustomCss = customCss === '' ? null : customCss;
          if (customJs !== undefined) patch.draftCustomJs = customJs === '' ? null : customJs;
          const [row] = await db.update(clientWebsites).set(patch)
            .where(eq(clientWebsites.id, id)).returning();
          return row;
        },
      });
      if (result.pending) return json({ pending: true, pendingId: result.pendingId, summary: result.summary, status: 'pending' });
      revalidateForWrite('sites');
      return json({
        draftCustomCss: result.data.draftCustomCss || '',
        draftCustomJs: result.data.draftCustomJs || '',
        liveCustomCss: result.data.customCss || '',
        liveCustomJs: result.data.customJs || '',
        draftUpdatedAt: result.data.draftUpdatedAt,
        note: 'Wrote to draft fields. Call sites_publish_custom_code to make changes live.',
      });
    }
  );

  hasScope(ctx.scopes, 'sites:write') && server.registerTool(
    'sites_publish_custom_code',
    {
      title: 'Publish site custom CSS/JS draft',
      description: 'Promotes the draft site-wide custom CSS/JS to live: copies draft_custom_css → custom_css, draft_custom_js → custom_js, then clears the draft fields. Subject to the same approval gate as other CMS writes when the API key requires approval.',
      inputSchema: { id: z.number().int().positive() },
    },
    async ({ id }) => {
      if (!requireScope(ctx, 'sites:write')) return denied('sites:write');
      if (!(await requireService(clientId, 'websites'))) return serviceDenied('websites');
      const [existing] = await db.select().from(clientWebsites)
        .where(and(eq(clientWebsites.id, id), eq(clientWebsites.clientId, clientId)))
        .limit(1);
      if (!existing) return json({ error: 'Site not found' });
      const result = await stageOrApply({
        ctx,
        entityType: 'site',
        operation: 'publish',
        entityId: id,
        summary: `Publish custom CSS/JS draft for "${existing.name}"`,
        payload: { id },
        originalSnapshot: {
          customCss: existing.customCss,
          customJs: existing.customJs,
          draftCustomCss: existing.draftCustomCss,
          draftCustomJs: existing.draftCustomJs,
        },
        apply: async () => {
          const [row] = await db.update(clientWebsites).set({
            customCss: existing.draftCustomCss,
            customJs: existing.draftCustomJs,
            draftCustomCss: null,
            draftCustomJs: null,
            draftUpdatedAt: null,
            draftUpdatedBy: null,
            updatedAt: new Date(),
          }).where(eq(clientWebsites.id, id)).returning();
          return row;
        },
      });
      if (result.pending) return json({ pending: true, pendingId: result.pendingId, summary: result.summary, status: 'pending' });
      revalidateForWrite('sites');
      return json({
        customCss: result.data.customCss || '',
        customJs: result.data.customJs || '',
      });
    }
  );


  // ── SITE NAVIGATION ────────────────────────────────────────────────────
  hasScope(ctx.scopes, 'sites:read') && server.registerTool(
    'nav_list',
    {
      title: 'List website navigation items',
      description: 'List nav items for a website, sorted by sortOrder. Hierarchical via parentId.',
      inputSchema: { websiteId: z.number() },
    },
    async ({ websiteId }) => {
      if (!requireScope(ctx, 'sites:read')) return denied('sites:read');
      const [site] = await db.select({ id: clientWebsites.id }).from(clientWebsites)
        .where(and(eq(clientWebsites.id, websiteId), eq(clientWebsites.clientId, clientId))).limit(1);
      if (!site) return json({ error: 'Site not found' });
      const rows = await db.select().from(siteNavigation)
        .where(eq(siteNavigation.websiteId, websiteId))
        .orderBy(siteNavigation.sortOrder);
      return json(rows);
    }
  );

  hasScope(ctx.scopes, 'sites:write') && server.registerTool(
    'nav_create',
    {
      title: 'Create navigation item (draft)',
      description: 'Stages a new nav item as a draft (pendingCreate). The public renderer ignores draft-only nav rows — call `nav_publish` (or `nav_publish_all`) to make the item live. Use parentId for nested items.',
      inputSchema: {
        websiteId: z.number(),
        label: z.string().min(1),
        href: z.string().min(1),
        parentId: z.number().optional(),
        sortOrder: z.number().optional(),
        openInNewTab: z.boolean().optional(),
        isButton: z.boolean().optional(),
        description: z.string().optional(),
        icon: z.string().optional(),
      },
    },
    async (args) => {
      if (!requireScope(ctx, 'sites:write')) return denied('sites:write');
      if (!(await requireService(clientId, 'websites'))) return serviceDenied('websites');
      const [site] = await db.select({ id: clientWebsites.id, name: clientWebsites.name }).from(clientWebsites)
        .where(and(eq(clientWebsites.id, args.websiteId), eq(clientWebsites.clientId, clientId))).limit(1);
      if (!site) return json({ error: 'Site not found' });
      const result = await stageOrApply({
        ctx,
        entityType: 'site_nav',
        operation: 'create',
        entityId: null,
        summary: `Create nav item "${args.label}" on "${site.name}" (draft)`,
        payload: args,
        apply: async () => {
          const existing = await db.select({ id: siteNavigation.id }).from(siteNavigation)
            .where(eq(siteNavigation.websiteId, args.websiteId));
          const sortOrder = args.sortOrder ?? existing.length;
          // Persist a base row with neutral defaults; the renderer ignores
          // draft-only items via pendingCreate. nav_publish promotes the
          // draft fields into the live columns.
          const draft: import('@/lib/db/schema').SiteNavigationDraft = {
            pendingCreate: true,
            label: args.label,
            href: args.href,
            parentId: args.parentId ?? null,
            sortOrder,
            openInNewTab: args.openInNewTab ?? false,
            isButton: args.isButton ?? false,
            description: args.description ?? null,
            icon: args.icon ?? null,
            updatedAt: new Date().toISOString(),
            updatedBy: ctx.userId,
          };
          const [row] = await db.insert(siteNavigation).values({
            websiteId: args.websiteId,
            label: args.label,
            href: args.href,
            parentId: args.parentId ?? null,
            sortOrder,
            openInNewTab: args.openInNewTab ?? false,
            isButton: args.isButton ?? false,
            description: args.description ?? null,
            icon: args.icon ?? null,
            draft,
          }).returning();
          return row;
        },
      });
      if (result.pending) return json({ pending: true, pendingId: result.pendingId, summary: result.summary, status: 'pending' });
      revalidateForWrite('sites');
      return json(result.data);
    }
  );

  hasScope(ctx.scopes, 'sites:write') && server.registerTool(
    'nav_update',
    {
      title: 'Update navigation item (draft)',
      description: 'Stage changes to a nav item into its draft jsonb overlay. Live columns are left untouched until `nav_publish` (or `nav_publish_all`) is called.',
      inputSchema: {
        id: z.number(),
        label: z.string().min(1).optional(),
        href: z.string().min(1).optional(),
        parentId: z.number().nullable().optional(),
        sortOrder: z.number().optional(),
        openInNewTab: z.boolean().optional(),
        isButton: z.boolean().optional(),
        description: z.string().nullable().optional(),
        icon: z.string().nullable().optional(),
      },
    },
    async ({ id, ...rest }) => {
      if (!requireScope(ctx, 'sites:write')) return denied('sites:write');
      if (!(await requireService(clientId, 'websites'))) return serviceDenied('websites');
      const [nav] = await db
        .select({
          id: siteNavigation.id,
          websiteId: siteNavigation.websiteId,
          label: siteNavigation.label,
          href: siteNavigation.href,
          draft: siteNavigation.draft,
        })
        .from(siteNavigation)
        .innerJoin(clientWebsites, eq(clientWebsites.id, siteNavigation.websiteId))
        .where(and(eq(siteNavigation.id, id), eq(clientWebsites.clientId, clientId))).limit(1);
      if (!nav) return json({ error: 'Nav item not found' });
      const result = await stageOrApply({
        ctx,
        entityType: 'site_nav',
        operation: 'update',
        entityId: id,
        summary: `Update nav item "${nav.label}" → ${rest.label ?? nav.label} (draft)`,
        payload: { id, ...rest },
        originalSnapshot: { label: nav.label, href: nav.href, draft: nav.draft },
        apply: async () => {
          const prev: import('@/lib/db/schema').SiteNavigationDraft = nav.draft ?? {};
          const next: import('@/lib/db/schema').SiteNavigationDraft = {
            ...prev,
            updatedAt: new Date().toISOString(),
            updatedBy: ctx.userId,
          };
          for (const [k, v] of Object.entries(rest)) {
            if (v !== undefined) (next as Record<string, unknown>)[k] = v;
          }
          const [row] = await db.update(siteNavigation)
            .set({ draft: next, updatedAt: new Date() })
            .where(eq(siteNavigation.id, id)).returning();
          return row;
        },
      });
      if (result.pending) return json({ pending: true, pendingId: result.pendingId, summary: result.summary, status: 'pending' });
      revalidateForWrite('sites');
      return json(result.data);
    }
  );

  hasScope(ctx.scopes, 'sites:delete') && server.registerTool(
    'nav_delete',
    {
      title: 'Delete navigation item (draft)',
      description: 'Stages a tombstone on the nav item (draft.pendingDelete). The row is not actually deleted until `nav_publish` runs — the live nav still shows the item until then. Child items (parentId) are not auto-handled.',
      inputSchema: { id: z.number() },
    },
    async ({ id }) => {
      if (!requireScope(ctx, 'sites:delete')) return denied('sites:delete');
      if (!(await requireService(clientId, 'websites'))) return serviceDenied('websites');
      const [nav] = await db
        .select({
          id: siteNavigation.id,
          websiteId: siteNavigation.websiteId,
          label: siteNavigation.label,
          href: siteNavigation.href,
          draft: siteNavigation.draft,
        })
        .from(siteNavigation)
        .innerJoin(clientWebsites, eq(clientWebsites.id, siteNavigation.websiteId))
        .where(and(eq(siteNavigation.id, id), eq(clientWebsites.clientId, clientId))).limit(1);
      if (!nav) return json({ error: 'Nav item not found' });
      const result = await stageOrApply({
        ctx,
        entityType: 'site_nav',
        operation: 'delete',
        entityId: id,
        summary: `Delete nav item "${nav.label}" (draft tombstone)`,
        payload: { id },
        originalSnapshot: { label: nav.label, href: nav.href, draft: nav.draft },
        apply: async () => {
          const prev: import('@/lib/db/schema').SiteNavigationDraft = nav.draft ?? {};
          const next: import('@/lib/db/schema').SiteNavigationDraft = {
            ...prev,
            pendingDelete: true,
            updatedAt: new Date().toISOString(),
            updatedBy: ctx.userId,
          };
          await db.update(siteNavigation)
            .set({ draft: next, updatedAt: new Date() })
            .where(eq(siteNavigation.id, id));
          return { success: true, id, pendingDelete: true };
        },
      });
      if (result.pending) return json({ pending: true, pendingId: result.pendingId, summary: result.summary, status: 'pending' });
      revalidateForWrite('sites');
      return json(result.data);
    }
  );

  hasScope(ctx.scopes, 'sites:write') && server.registerTool(
    'nav_publish',
    {
      title: 'Publish navigation item draft',
      description: 'Promotes a single nav item\'s draft to live. If draft.pendingDelete: the row is removed. If draft.pendingCreate: the draft flag is cleared (item becomes visible). Otherwise: draft fields are applied onto the live columns and draft is cleared. Subject to the same approval gate as other CMS writes.',
      inputSchema: { id: z.number() },
    },
    async ({ id }) => {
      if (!requireScope(ctx, 'sites:write')) return denied('sites:write');
      if (!(await requireService(clientId, 'websites'))) return serviceDenied('websites');
      const [nav] = await db
        .select()
        .from(siteNavigation)
        .innerJoin(clientWebsites, eq(clientWebsites.id, siteNavigation.websiteId))
        .where(and(eq(siteNavigation.id, id), eq(clientWebsites.clientId, clientId))).limit(1);
      if (!nav) return json({ error: 'Nav item not found' });
      const navRow = nav.site_navigation;
      const result = await stageOrApply({
        ctx,
        entityType: 'site_nav',
        operation: 'publish',
        entityId: id,
        summary: `Publish nav item "${navRow.label}"`,
        payload: { id },
        originalSnapshot: { label: navRow.label, href: navRow.href, draft: navRow.draft },
        apply: async () => {
          const draft: import('@/lib/db/schema').SiteNavigationDraft | null = navRow.draft;
          if (!draft) return { success: true, id, noop: true };
          if (draft.pendingDelete) {
            await db.delete(siteNavigation).where(eq(siteNavigation.id, id));
            return { success: true, id, deleted: true };
          }
          // Either pendingCreate (clear draft to make visible) or an
          // ordinary update (apply draft fields → live, then clear draft).
          const patch: Record<string, unknown> = { draft: null, updatedAt: new Date() };
          if (draft.label !== undefined) patch.label = draft.label;
          if (draft.href !== undefined) patch.href = draft.href;
          if (draft.parentId !== undefined) patch.parentId = draft.parentId;
          if (draft.sortOrder !== undefined) patch.sortOrder = draft.sortOrder;
          if (draft.openInNewTab !== undefined) patch.openInNewTab = draft.openInNewTab;
          if (draft.isButton !== undefined) patch.isButton = draft.isButton;
          if (draft.description !== undefined) patch.description = draft.description;
          if (draft.icon !== undefined) patch.icon = draft.icon;
          if (draft.featuredImage !== undefined) patch.featuredImage = draft.featuredImage;
          if (draft.columnGroup !== undefined) patch.columnGroup = draft.columnGroup;
          const [row] = await db.update(siteNavigation).set(patch)
            .where(eq(siteNavigation.id, id)).returning();
          return row;
        },
      });
      if (result.pending) return json({ pending: true, pendingId: result.pendingId, summary: result.summary, status: 'pending' });
      revalidateForWrite('sites');
      return json(result.data);
    }
  );

  hasScope(ctx.scopes, 'sites:write') && server.registerTool(
    'nav_publish_all',
    {
      title: 'Publish all nav drafts for a website',
      description: 'Promote every nav row with a non-null draft on a website. Same per-row semantics as `nav_publish` (pendingDelete → delete; pendingCreate → clear draft; else apply draft → live).',
      inputSchema: { websiteId: z.number() },
    },
    async ({ websiteId }) => {
      if (!requireScope(ctx, 'sites:write')) return denied('sites:write');
      if (!(await requireService(clientId, 'websites'))) return serviceDenied('websites');
      const [site] = await db.select({ id: clientWebsites.id, name: clientWebsites.name }).from(clientWebsites)
        .where(and(eq(clientWebsites.id, websiteId), eq(clientWebsites.clientId, clientId))).limit(1);
      if (!site) return json({ error: 'Site not found' });
      const drafts = await db.select().from(siteNavigation)
        .where(and(
          eq(siteNavigation.websiteId, websiteId),
          sql`${siteNavigation.draft} IS NOT NULL`,
        ));
      const result = await stageOrApply({
        ctx,
        entityType: 'site_nav',
        operation: 'publish_all',
        entityId: null,
        summary: `Publish all nav drafts for "${site.name}" (${drafts.length} item${drafts.length === 1 ? '' : 's'})`,
        payload: { websiteId },
        originalSnapshot: { count: drafts.length, ids: drafts.map((d) => d.id) },
        apply: async () => {
          const results: Array<{ id: number; deleted?: boolean; published?: boolean }> = [];
          for (const navRow of drafts) {
            const draft: import('@/lib/db/schema').SiteNavigationDraft | null = navRow.draft;
            if (!draft) continue;
            if (draft.pendingDelete) {
              await db.delete(siteNavigation).where(eq(siteNavigation.id, navRow.id));
              results.push({ id: navRow.id, deleted: true });
              continue;
            }
            const patch: Record<string, unknown> = { draft: null, updatedAt: new Date() };
            if (draft.label !== undefined) patch.label = draft.label;
            if (draft.href !== undefined) patch.href = draft.href;
            if (draft.parentId !== undefined) patch.parentId = draft.parentId;
            if (draft.sortOrder !== undefined) patch.sortOrder = draft.sortOrder;
            if (draft.openInNewTab !== undefined) patch.openInNewTab = draft.openInNewTab;
            if (draft.isButton !== undefined) patch.isButton = draft.isButton;
            if (draft.description !== undefined) patch.description = draft.description;
            if (draft.icon !== undefined) patch.icon = draft.icon;
            if (draft.featuredImage !== undefined) patch.featuredImage = draft.featuredImage;
            if (draft.columnGroup !== undefined) patch.columnGroup = draft.columnGroup;
            await db.update(siteNavigation).set(patch).where(eq(siteNavigation.id, navRow.id));
            results.push({ id: navRow.id, published: true });
          }
          return { websiteId, count: results.length, items: results };
        },
      });
      if (result.pending) return json({ pending: true, pendingId: result.pendingId, summary: result.summary, status: 'pending' });
      revalidateForWrite('sites');
      return json(result.data);
    }
  );
}
