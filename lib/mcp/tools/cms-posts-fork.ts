/**
 * MCP tools — cms posts fork
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


export function registerCmsPostsForkTools(server: McpServer, ctx: PortalMcpContext): void {
  const clientId = ctx.client.id;

  // ── posts_fork ──────────────────────────────────────────────────────
  // Lightweight clone. Duplicates the source post into a new draft row
  // pointing back via `parent_post_id`. Approve on the fork's link
  // publishes the fork (last-write-wins against the parent's live state).
  hasScope(ctx.scopes, 'sites:write') && server.registerTool(
    'posts_fork',
    {
      title: 'Fork a post into a draft',
      description:
        'Duplicate a published post into a new draft row tied to the original via parent_post_id. Use when you want to revise a live page without taking it down — edit the fork, share its approval link for review, and the approver merges the fork back when it ships. Returns the new post id + an approval URL.',
      inputSchema: {
        id: z.number().describe('Source post id to fork.'),
        titleSuffix: z.string().default(' (fork)').optional().describe('Appended to the cloned title.'),
      },
    },
    async ({ id, titleSuffix = ' (fork)' }) => {
      if (!requireScope(ctx, 'sites:write')) return denied('sites:write');
      if (!(await requireService(clientId, 'websites'))) return serviceDenied('websites');
      const [source] = await db.select().from(posts).where(eq(posts.id, id)).limit(1);
      if (!source) return json({ error: 'Source post not found' });
      if (!source.websiteId) return json({ error: 'Permission denied — agency post' });
      const [site] = await db.select({ id: clientWebsites.id }).from(clientWebsites)
        .where(and(eq(clientWebsites.id, source.websiteId), eq(clientWebsites.clientId, clientId))).limit(1);
      if (!site) return json({ error: 'Permission denied' });

      const forkSlug = `${source.slug}-fork-${Date.now().toString(36)}`;
      const [forkRow] = await db.insert(posts).values({
        websiteId: source.websiteId,
        title: `${source.title}${titleSuffix}`,
        slug: forkSlug,
        content: source.content,
        excerpt: source.excerpt,
        postType: source.postType,
        published: false,
        publishedAt: null,
        coverImage: source.coverImage,
        seoTitle: source.seoTitle,
        seoDescription: source.seoDescription,
        ogImage: source.ogImage,
        noIndex: source.noIndex,
        canonicalUrl: source.canonicalUrl,
        customCss: source.customCss,
        customJs: source.customJs,
        parentPostId: source.id,
      }).returning(postProjection(false));
      const link = await createApprovalLink({
        ctx,
        entityType: 'post',
        entityId: forkRow.id,
        summary: `Fork of post #${source.id} "${source.title}"`,
      });
      revalidateForWrite('portal');
      return json({ ...forkRow, parentPostId: source.id, approval: approvalEnvelope(link) });
    }
  );

  hasScope(ctx.scopes, 'sites:delete') && server.registerTool(
    'posts_delete',
    {
      title: 'Delete post',
      description: 'Permanently delete a post. Revisions cascade. Only posts that belong to a website owned by this client can be deleted.',
      inputSchema: { id: z.number() },
    },
    async ({ id }) => {
      if (!requireScope(ctx, 'sites:delete')) return denied('sites:delete');
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
      const result = await stageOrApply({
        ctx,
        entityType: 'post',
        operation: 'delete',
        entityId: id,
        summary: `Delete post #${id} "${post.title}"`,
        payload: { id },
        originalSnapshot: { title: post.title, slug: post.slug, published: post.published, postType: post.postType },
        apply: async () => {
          await db.delete(posts).where(eq(posts.id, id));
          return { success: true, id };
        },
      });
      if (result.pending) return json({ pending: true, pendingId: result.pendingId, summary: result.summary, status: 'pending' });
      revalidateForWrite('posts');
      return json(result.data);
    }
  );

  // Upload an HTML file as a draft `page` post wrapping a single html-embed
  // block. Mirrors POST /api/portal/cms/websites/[siteId]/posts/upload-html:
  // cleans the HTML, imports referenced assets to media, stores the file in
  // S3, and emits a draft post pointing at it. Body must be base64 — MCP
  // can't carry multipart.
  hasScope(ctx.scopes, 'sites:write') && server.registerTool(
    'posts_upload_html',
    {
      title: 'Upload HTML as page',
      description: 'Upload an HTML/XHTML file (base64-encoded) as a draft `page` post wrapping a single html-embed block. The HTML is cleaned (nav/header stripped, head assets preserved), referenced assets are imported to media, and the file is stored in S3. Max 1 MB.',
      inputSchema: {
        websiteId: z.number().int().positive(),
        filename: z.string().min(1).regex(/\.(html?|xhtml)$/i, 'File must be .html, .htm, or .xhtml'),
        contentBase64: z.string().min(1).describe('Base64-encoded HTML body. Decoded size must be ≤ 1 MB.'),
        sourceUrl: z.string().url().optional().describe('Original URL — used to resolve relative asset refs during import.'),
      },
    },
    async ({ websiteId, filename, contentBase64, sourceUrl }) => {
      if (!requireScope(ctx, 'sites:write')) return denied('sites:write');
      if (!(await requireService(clientId, 'websites'))) return serviceDenied('websites');
      // Gate on author role: posts_upload_html always produces an html-embed
      // block, which the SEO prefetch path may inline into the parent DOM —
      // same XSS risk as html-render. Restrict to staff (admin/editor/employee).
      try {
        await assertBlocksAllowedForUserId([{ type: 'html-embed' }], ctx.userId);
      } catch (e) {
        if (e instanceof BlockGateError) return json({ error: e.message });
        throw e;
      }
      const [site] = await db.select({ id: clientWebsites.id, name: clientWebsites.name }).from(clientWebsites)
        .where(and(eq(clientWebsites.id, websiteId), eq(clientWebsites.clientId, clientId))).limit(1);
      if (!site) return json({ error: 'Site not found' });

      let rawBuffer: Buffer;
      try {
        rawBuffer = Buffer.from(contentBase64, 'base64');
      } catch {
        return json({ error: 'Invalid base64 content' });
      }
      const MAX_HTML_SIZE = 1_000_000;
      if (rawBuffer.byteLength === 0) return json({ error: 'Empty file' });
      if (rawBuffer.byteLength > MAX_HTML_SIZE) {
        return json({ error: `File exceeds ${MAX_HTML_SIZE} bytes` });
      }

      const result = await stageOrApply({
        ctx,
        entityType: 'post',
        operation: 'upload_html',
        entityId: null,
        summary: `Upload HTML "${filename}" as draft page on "${site.name}"`,
        payload: { websiteId, filename, contentBase64, sourceUrl },
        apply: async () => {
          const cleaned = cleanEmbedHtml(rawBuffer.toString('utf8'));
          const imported = await importHtmlAssets(cleaned, {
            websiteId: site.id,
            clientId,
            uploadedBy: ctx.userId,
            baseUrl: sourceUrl,
          });
          const buffer = Buffer.from(imported.html, 'utf8');
          const uploadResult = await uploadToS3(buffer, filename, 'text/html');

          await db.insert(media).values({
            filename,
            storedFilename: uploadResult.storedFilename,
            mimeType: 'text/html',
            fileSize: uploadResult.fileSize,
            url: uploadResult.url,
            uploadedBy: ctx.userId,
            clientId,
            websiteId: site.id,
          });

          // Find a free slug — append numeric suffix on collision (matches the
          // route's behavior so API + MCP yield identical post layouts).
          const baseSlug = slugify(filename.trim().replace(/\.[^.]+$/, ''), 80) || 'page';
          let slug = baseSlug;
          for (let i = 2; i < 100; i++) {
            const [collision] = await db.select({ id: posts.id }).from(posts)
              .where(and(eq(posts.slug, slug), eq(posts.websiteId, site.id))).limit(1);
            if (!collision) break;
            slug = `${baseSlug}-${i}`;
          }

          const filenameNoExt = filename.replace(/\.[^.]+$/, '');
          const ts = Date.now();
          const uploadedBlocks = [
            {
              id: `block-${ts}-html`,
              type: 'html-embed' as const,
              order: 1,
              url: uploadResult.url,
              filename,
              height: '100vh',
              width: 'full' as const,
              sandbox: 'scripts',
              iframeTitle: filenameNoExt,
            },
          ];
          const blockContent = JSON.stringify({ blocks: uploadedBlocks });

          const [post] = await db.insert(posts).values({
            title: filenameNoExt || 'Uploaded HTML',
            slug,
            postType: 'page',
            content: blockContent,
            published: false,
            websiteId: site.id,
          }).returning(SLIM_POST_COLUMNS);
          // Fan out to any editor that already opened this post id (rare for a
          // brand-new upload, but cheap insurance — same wire path as a
          // peer-typed edit). Fire-and-forget.
          void publishBlocksUpdate({
            entityType: 'post',
            entityId: post.id,
            blocks: uploadedBlocks as unknown as import('@/types/blocks').Block[],
          }).catch((err) => {
            console.warn('[mcp/posts_upload_html] realtime publish failed:', err);
          });
          return {
            ...post,
            importedAssets: imported.importedCount,
            skippedAssets: imported.skippedCount,
            url: uploadResult.url,
          };
        },
      });
      if (result.pending) return json({ pending: true, pendingId: result.pendingId, summary: result.summary, status: 'pending' });
      revalidateForWrite('posts');
      return json(result.data);
    }
  );


  // Same as posts_upload_html but for a zipped multi-file bundle. The skill
  // `sd-build-html-embed` authors `index.html` + `style.css` + `script.js` +
  // `assets/` locally, then ships the whole tree through this tool. The zip
  // pipeline (lib/html-zip-upload.ts) is shared with the portal UI's REST
  // route — same validation (50 MB total / 200 files / 10 MB per file,
  // ext allowlist, traversal guards) — so block JSON is byte-identical to
  // what the portal upload button produces.
  hasScope(ctx.scopes, 'sites:write') && server.registerTool(
    'posts_upload_html_zip',
    {
      title: 'Upload HTML bundle (zip) as page',
      description: 'Upload a zip archive (base64-encoded) containing index.html + supporting assets (css/js/images/fonts) as a draft `page` post wrapping a single html-embed block. Every file in the zip is uploaded to S3 under a shared media/<uuid>/ prefix; relative refs (./style.css, assets/img.png) resolve through the path-based media proxy. Limits: 50 MB uncompressed total, 200 files, 10 MB per file, ext allowlist (html/css/js/png/jpg/webp/svg/woff/woff2/ttf/json/...). The index entry priority is: root /index.html → first root .html → first .html anywhere.',
      inputSchema: {
        websiteId: z.number().int().positive(),
        filename: z.string().min(1).regex(/\.zip$/i, 'File must be a .zip'),
        contentBase64: z.string().min(1).describe('Base64-encoded zip body. Decoded size must be ≤ 50 MB.'),
      },
    },
    async ({ websiteId, filename, contentBase64 }) => {
      if (!requireScope(ctx, 'sites:write')) return denied('sites:write');
      if (!(await requireService(clientId, 'websites'))) return serviceDenied('websites');
      try {
        await assertBlocksAllowedForUserId([{ type: 'html-embed' }], ctx.userId);
      } catch (e) {
        if (e instanceof BlockGateError) return json({ error: e.message });
        throw e;
      }
      const [site] = await db.select({ id: clientWebsites.id, name: clientWebsites.name }).from(clientWebsites)
        .where(and(eq(clientWebsites.id, websiteId), eq(clientWebsites.clientId, clientId))).limit(1);
      if (!site) return json({ error: 'Site not found' });

      let zipBuffer: Buffer;
      try {
        zipBuffer = Buffer.from(contentBase64, 'base64');
      } catch {
        return json({ error: 'Invalid base64 content' });
      }
      if (zipBuffer.byteLength === 0) return json({ error: 'Empty zip' });
      if (zipBuffer.byteLength > MAX_ZIP_TOTAL_BYTES) {
        return json({ error: `Zip exceeds ${MAX_ZIP_TOTAL_BYTES} bytes` });
      }

      let unpacked;
      try {
        unpacked = await unpackAndUploadZip(zipBuffer);
      } catch (err) {
        if (isZipHttpError(err)) return json({ error: err.message });
        throw err;
      }

      // Insert one media row per uploaded file under the shared prefix.
      const mediaRows = unpacked.entries.map((entry) => ({
        filename: entry.relativePath,
        storedFilename: entry.upload.storedFilename,
        mimeType: entry.mimeType,
        fileSize: entry.upload.fileSize,
        url: entry.upload.url,
        uploadedBy: ctx.userId,
        clientId,
        websiteId: site.id,
      }));
      await db.insert(media).values(mediaRows);

      // Pick a free slug derived from the zip filename minus .zip.
      const baseSlug = slugify(filename.trim().replace(/\.zip$/i, ''), 80) || 'bundle';
      let slug = baseSlug;
      for (let i = 2; i < 100; i++) {
        const [collision] = await db.select({ id: posts.id }).from(posts)
          .where(and(eq(posts.slug, slug), eq(posts.websiteId, site.id))).limit(1);
        if (!collision) break;
        slug = `${baseSlug}-${i}`;
      }

      const ts = Date.now();
      const titleBase = baseSlug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) || 'Uploaded Bundle';
      const uploadedBlocks = [
        {
          id: `block-${ts}-html`,
          type: 'html-embed' as const,
          order: 1,
          url: unpacked.index.upload.url,
          filename: unpacked.index.relativePath,
          height: '100vh',
          width: 'full' as const,
          sandbox: 'scripts',
          iframeTitle: titleBase,
        },
      ];
      const blockContent = JSON.stringify({ blocks: uploadedBlocks });

      const [post] = await db.insert(posts).values({
        title: titleBase,
        slug,
        postType: 'page',
        content: blockContent,
        published: false,
        websiteId: site.id,
      }).returning(SLIM_POST_COLUMNS);

      const approval = approvalEnvelope(
        await createApprovalLink({
          ctx,
          entityType: 'post',
          entityId: post.id,
          summary: `Bundle "${filename}" → page "${titleBase}"`,
        }),
      );

      revalidateForWrite('posts');
      return json({
        ...post,
        bundleFileCount: unpacked.entries.length,
        bundlePrefix: unpacked.prefix,
        url: unpacked.index.upload.url,
        approval,
      });
    }
  );
}
