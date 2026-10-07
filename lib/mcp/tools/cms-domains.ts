/**
 * MCP tools — cms domains & env vars
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


export function registerCmsDomainsTools(server: McpServer, ctx: PortalMcpContext): void {
  const clientId = ctx.client.id;

  // ── WEBSITE DOMAINS / ENV VARS ─────────────────────────────────────────
  async function requireClientSite(websiteId: number) {
    const [site] = await db.select({ id: clientWebsites.id }).from(clientWebsites)
      .where(and(eq(clientWebsites.id, websiteId), eq(clientWebsites.clientId, clientId))).limit(1);
    return site ?? null;
  }

  hasScope(ctx.scopes, 'sites:read') && server.registerTool(
    'website_domains_list',
    {
      title: 'List website custom domains',
      description: 'List custom domains attached to a website.',
      inputSchema: { websiteId: z.number() },
    },
    async ({ websiteId }) => {
      if (!requireScope(ctx, 'sites:read')) return denied('sites:read');
      if (!(await requireClientSite(websiteId))) return json({ error: 'Site not found' });
      const rows = await db.select().from(websiteDomains)
        .where(eq(websiteDomains.websiteId, websiteId));
      return json(rows);
    }
  );

  hasScope(ctx.scopes, 'sites:write') && server.registerTool(
    'website_domains_add',
    {
      title: 'Attach domain to website',
      description:
        'Add a custom domain to a website (starts pending until DNS verification). This does NOT provision DNS records — user must configure them externally.',
      inputSchema: {
        websiteId: z.number(),
        domain: z.string().min(3),
        isPrimary: z.boolean().optional(),
      },
    },
    async ({ websiteId, domain, isPrimary }) => {
      if (!requireScope(ctx, 'sites:write')) return denied('sites:write');
      if (!(await requireService(clientId, 'websites'))) return serviceDenied('websites');
      if (!(await requireClientSite(websiteId))) return json({ error: 'Site not found' });
      if (isPrimary) {
        await db.update(websiteDomains)
          .set({ isPrimary: false, updatedAt: new Date() })
          .where(and(eq(websiteDomains.websiteId, websiteId), eq(websiteDomains.isPrimary, true)));
      }
      const [row] = await db.insert(websiteDomains).values({
        websiteId,
        domain: domain.trim().toLowerCase(),
        isPrimary: isPrimary ?? false,
      }).returning();
      revalidateForWrite('sites');
      return json(row);
    }
  );

  hasScope(ctx.scopes, 'sites:delete') && server.registerTool(
    'website_domains_remove',
    {
      title: 'Detach domain from website',
      description: 'Remove a custom domain attachment. Does not affect external DNS.',
      inputSchema: { id: z.number() },
    },
    async ({ id }) => {
      if (!requireScope(ctx, 'sites:delete')) return denied('sites:delete');
      if (!(await requireService(clientId, 'websites'))) return serviceDenied('websites');
      const [domain] = await db
        .select({ id: websiteDomains.id, websiteId: websiteDomains.websiteId })
        .from(websiteDomains)
        .innerJoin(clientWebsites, eq(clientWebsites.id, websiteDomains.websiteId))
        .where(and(eq(websiteDomains.id, id), eq(clientWebsites.clientId, clientId))).limit(1);
      if (!domain) return json({ error: 'Domain not found' });
      await db.delete(websiteDomains).where(eq(websiteDomains.id, id));
      revalidateForWrite('sites');
      return json({ success: true, id });
    }
  );

  hasScope(ctx.scopes, 'sites:read') && server.registerTool(
    'website_env_vars_list',
    {
      title: 'List website environment variables',
      description:
        'List env vars for a website environment (defaults to production). Values ARE included — treat output as secrets.',
      inputSchema: {
        websiteId: z.number(),
        environment: z.string().optional().default('production'),
      },
    },
    async ({ websiteId, environment = 'production' }) => {
      if (!requireScope(ctx, 'sites:read')) return denied('sites:read');
      if (!(await requireClientSite(websiteId))) return json({ error: 'Site not found' });
      const [env] = await db.select({ id: websiteEnvironments.id }).from(websiteEnvironments)
        .where(and(eq(websiteEnvironments.websiteId, websiteId), eq(websiteEnvironments.name, environment))).limit(1);
      if (!env) return json({ error: `Environment "${environment}" not found` });
      const rows = await db.select().from(websiteEnvVars)
        .where(eq(websiteEnvVars.environmentId, env.id))
        .orderBy(websiteEnvVars.key);
      return json(rows);
    }
  );

  hasScope(ctx.scopes, 'sites:write') && server.registerTool(
    'website_env_vars_set',
    {
      title: 'Set website environment variable',
      description:
        'Upsert an env var on a website environment (production/staging). Marks syncedToVercel=false — actual Vercel sync happens via portal UI.',
      inputSchema: {
        websiteId: z.number(),
        environment: z.string().optional().default('production'),
        key: z.string().min(1),
        value: z.string(),
      },
    },
    async ({ websiteId, environment = 'production', key, value }) => {
      if (!requireScope(ctx, 'sites:write')) return denied('sites:write');
      if (!(await requireService(clientId, 'websites'))) return serviceDenied('websites');
      if (!(await requireClientSite(websiteId))) return json({ error: 'Site not found' });
      const [env] = await db.select({ id: websiteEnvironments.id }).from(websiteEnvironments)
        .where(and(eq(websiteEnvironments.websiteId, websiteId), eq(websiteEnvironments.name, environment))).limit(1);
      if (!env) return json({ error: `Environment "${environment}" not found` });
      const [existing] = await db.select({ id: websiteEnvVars.id }).from(websiteEnvVars)
        .where(and(eq(websiteEnvVars.environmentId, env.id), eq(websiteEnvVars.key, key))).limit(1);
      if (existing) {
        const [row] = await db.update(websiteEnvVars)
          .set({ value, syncedToVercel: false })
          .where(eq(websiteEnvVars.id, existing.id)).returning();
        return json(row);
      }
      const [row] = await db.insert(websiteEnvVars).values({
        environmentId: env.id,
        key,
        value,
        syncedToVercel: false,
      }).returning();
      revalidateForWrite('sites');
      return json(row);
    }
  );

  hasScope(ctx.scopes, 'sites:delete') && server.registerTool(
    'website_env_vars_delete',
    {
      title: 'Delete website environment variable',
      description: 'Remove an env var by id.',
      inputSchema: { id: z.number() },
    },
    async ({ id }) => {
      if (!requireScope(ctx, 'sites:delete')) return denied('sites:delete');
      if (!(await requireService(clientId, 'websites'))) return serviceDenied('websites');
      const [envVar] = await db
        .select({ id: websiteEnvVars.id, websiteId: websiteEnvironments.websiteId })
        .from(websiteEnvVars)
        .innerJoin(websiteEnvironments, eq(websiteEnvironments.id, websiteEnvVars.environmentId))
        .innerJoin(clientWebsites, eq(clientWebsites.id, websiteEnvironments.websiteId))
        .where(and(eq(websiteEnvVars.id, id), eq(clientWebsites.clientId, clientId))).limit(1);
      if (!envVar) return json({ error: 'Env var not found' });
      await db.delete(websiteEnvVars).where(eq(websiteEnvVars.id, id));
      revalidateForWrite('sites');
      return json({ success: true, id });
    }
  );
}
