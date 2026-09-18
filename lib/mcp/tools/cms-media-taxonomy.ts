/**
 * MCP tools — cms media & taxonomy
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


export function registerCmsMediaTaxonomyTools(server: McpServer, ctx: PortalMcpContext): void {
  const clientId = ctx.client.id;

  // ── MEDIA ──────────────────────────────────────────────────────────────
  hasScope(ctx.scopes, 'media:read') && server.registerTool(
    'media_list',
    {
      title: 'List media assets',
      description: 'List uploaded media assets for the client.',
      inputSchema: { limit: z.number().default(50).optional() },
    },
    async ({ limit = 50 }) => {
      if (!requireScope(ctx, 'media:read')) return denied('media:read');
      const rows = await db.select().from(media)
        .where(eq(media.clientId, clientId))
        .orderBy(desc(media.createdAt)).limit(limit);
      return json(rows);
    }
  );

  hasScope(ctx.scopes, 'media:write') && server.registerTool(
    'media_upload_from_url',
    {
      title: 'Upload media from URL',
      description:
        'Download a remote image/file (http/https) and store it in the client\'s media library. Returns the media row including the internal `url` that can be used in posts, decks, and emails.',
      inputSchema: {
        url: z.string().url().describe('Public http(s) URL to fetch.'),
        filename: z.string().optional().describe('Override filename; otherwise derived from the URL path.'),
        alt: z.string().optional(),
        caption: z.string().optional(),
        websiteId: z.number().optional().describe('Scope the asset to a specific site.'),
        brandingProfileId: z.number().optional(),
      },
    },
    async ({ url, filename, alt, caption, websiteId, brandingProfileId }) => {
      if (!requireScope(ctx, 'media:write')) return denied('media:write');
      if (!(await requireService(clientId, 'websites'))) return serviceDenied('websites');
      try {
        await assertSafeUrl(url);
      } catch (err) {
        return json({ error: `URL rejected: ${(err as Error).message}` });
      }
      let resp: Response;
      try {
        resp = await fetch(url, { redirect: 'manual' });
        if (resp.status >= 300 && resp.status < 400) {
          return json({ error: 'Refusing to follow redirects on remote upload (SSRF guard).' });
        }
      } catch (err) {
        return json({ error: `Fetch failed: ${(err as Error).message}` });
      }
      if (!resp.ok) return json({ error: `Fetch returned ${resp.status}` });
      const contentLength = Number(resp.headers.get('content-length') ?? 0);
      const MAX_BYTES = 25 * 1024 * 1024;
      if (contentLength && contentLength > MAX_BYTES) {
        return json({ error: `File too large (${contentLength} bytes; max ${MAX_BYTES}).` });
      }
      const buf = Buffer.from(await resp.arrayBuffer());
      if (buf.length > MAX_BYTES) return json({ error: `File too large (${buf.length} bytes).` });
      const mimeType = resp.headers.get('content-type')?.split(';')[0]?.trim() || 'application/octet-stream';
      const derivedName = filename
        ?? decodeURIComponent(new URL(url).pathname.split('/').filter(Boolean).pop() || 'upload')
        ?? 'upload';
      const result = await uploadToS3(buf, derivedName, mimeType);
      const [row] = await db.insert(media).values({
        filename: derivedName,
        storedFilename: result.storedFilename,
        mimeType: result.mimeType,
        fileSize: result.fileSize,
        url: result.url,
        alt: alt ?? null,
        caption: caption ?? null,
        uploadedBy: ctx.userId,
        clientId,
        websiteId: websiteId ?? null,
        brandingProfileId: brandingProfileId ?? null,
      }).returning();
      revalidateForWrite('portal');
      return json(row);
    }
  );

  // Allow-list mirrors the SAFE_INLINE set in app/api/media/proxy/[...path]/route.ts
  // plus SVG (which the proxy serves under a restrictive CSP) and a few audio
  // codecs the proxy already lists. Any mimeType not in this set is rejected
  // up-front so we never even mint a presigned URL for, e.g., text/html.
  const ALLOWED_UPLOAD_MIME_TYPES = new Set<string>([
    'image/png',
    'image/jpeg',
    'image/gif',
    'image/webp',
    'image/avif',
    'image/svg+xml',
    'application/pdf',
    'video/mp4',
    'video/webm',
    'video/quicktime',
    'audio/mpeg',
    'audio/ogg',
    'audio/wav',
  ]);
  const MAX_MEDIA_UPLOAD_BYTES = 25 * 1024 * 1024;

  hasScope(ctx.scopes, 'media:write') && server.registerTool(
    'media_upload_presign',
    {
      title: 'Presign a direct-to-S3 media upload',
      description:
        'Mint a short-lived S3 PUT URL so the caller (e.g. Claude Code) can `curl --upload-file` a local file directly into our media bucket without piping bytes through the MCP conversation. After the PUT succeeds, call `media_register` with the returned `mediaKey` to create the media row. The presigned URL pins both Content-Type and Content-Length; size cap is 25 MB, mimeType must be in the allow-list (images, PDF, mp4/webm/quicktime, common audio).',
      inputSchema: {
        filename: z.string().min(1).describe('Original filename — used to derive the extension and stored as media.filename on register.'),
        mimeType: z.string().min(1).describe('Content-Type the caller will send on PUT. Must be in the allow-list.'),
        fileSize: z.number().int().positive().describe('Exact byte count the caller will send. Capped at 25 MB; signed into the URL so S3 rejects mismatches.'),
      },
    },
    async ({ filename, mimeType, fileSize }) => {
      if (!requireScope(ctx, 'media:write')) return denied('media:write');
      if (!(await requireService(clientId, 'websites'))) return serviceDenied('websites');
      const normalizedMime = mimeType.split(';')[0]?.trim().toLowerCase() ?? '';
      if (!ALLOWED_UPLOAD_MIME_TYPES.has(normalizedMime)) {
        return json({
          error: `mimeType "${mimeType}" is not allowed. Allowed: ${Array.from(ALLOWED_UPLOAD_MIME_TYPES).join(', ')}.`,
        });
      }
      if (fileSize <= 0) return json({ error: 'fileSize must be > 0' });
      if (fileSize > MAX_MEDIA_UPLOAD_BYTES) {
        return json({ error: `File too large (${fileSize} bytes; max ${MAX_MEDIA_UPLOAD_BYTES}).` });
      }
      const { storedFilename, key } = generateMediaKey(filename);
      try {
        const presigned = await presignPut({
          key,
          contentType: normalizedMime,
          contentLength: fileSize,
          expiresInSeconds: 300,
        });
        return json({
          mediaKey: key,
          storedFilename,
          uploadUrl: presigned.uploadUrl,
          requiredHeaders: presigned.requiredHeaders,
          expiresAt: presigned.expiresAt,
        });
      } catch (err) {
        return json({ error: `Failed to presign upload: ${(err as Error).message}` });
      }
    }
  );

  hasScope(ctx.scopes, 'media:write') && server.registerTool(
    'media_register',
    {
      title: 'Register an uploaded media object',
      description:
        'Finalize a presigned-upload flow: HEAD the S3 object the caller PUT to (via `media_upload_presign`), verify the size cap, and insert a `media` row pointing at it. Returns the new media row. Pairs with `media_upload_presign`.',
      inputSchema: {
        mediaKey: z.string().min(1).describe('S3 key returned by media_upload_presign (e.g. "media/<uuid>.<ext>").'),
        originalFilename: z.string().min(1).describe('User-facing filename, stored as media.filename.'),
        mimeType: z.string().min(1).describe('Expected mimeType. The server re-reads the S3-reported Content-Type and trusts that, not this value, but the field is required for parity with the URL-host path and to fail fast on obviously-wrong inputs.'),
        alt: z.string().optional(),
        caption: z.string().optional(),
        websiteId: z.number().optional().describe('Scope the asset to a specific site.'),
        brandingProfileId: z.number().optional(),
      },
    },
    async ({ mediaKey, originalFilename, mimeType, alt, caption, websiteId, brandingProfileId }) => {
      if (!requireScope(ctx, 'media:write')) return denied('media:write');
      if (!(await requireService(clientId, 'websites'))) return serviceDenied('websites');
      const normalizedDeclaredMime = mimeType.split(';')[0]?.trim().toLowerCase() ?? '';
      if (!ALLOWED_UPLOAD_MIME_TYPES.has(normalizedDeclaredMime)) {
        return json({ error: `mimeType "${mimeType}" is not in the allow-list.` });
      }
      // S3 key must live under the media/ prefix the proxy serves, otherwise
      // the resulting media.url won't resolve. Block path traversal too.
      if (!mediaKey.startsWith('media/') || mediaKey.includes('..')) {
        return json({ error: 'mediaKey must start with "media/" and contain no path traversal.' });
      }
      const s3 = getS3Client();
      const bucket = getBucketName();
      let head;
      try {
        head = await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: mediaKey }));
      } catch (err) {
        const error = err as { name?: string; $metadata?: { httpStatusCode?: number } };
        if (error?.name === 'NotFound' || error?.$metadata?.httpStatusCode === 404) {
          return json({ error: 'Object not found — did the curl PUT succeed?' });
        }
        return json({ error: `HEAD failed: ${(err as Error).message}` });
      }
      const actualSize = Number(head.ContentLength ?? 0);
      if (!actualSize) return json({ error: 'S3 reported empty object.' });
      if (actualSize > MAX_MEDIA_UPLOAD_BYTES) {
        return json({
          error: `Uploaded object exceeds 25 MB cap (${actualSize} bytes). Refusing to register.`,
        });
      }
      const reportedMime = head.ContentType?.split(';')[0]?.trim().toLowerCase() || normalizedDeclaredMime;
      // S3-reported Content-Type is what the proxy will hand to the browser,
      // so re-check it against the allow-list rather than trusting the caller.
      if (!ALLOWED_UPLOAD_MIME_TYPES.has(reportedMime)) {
        return json({ error: `S3-reported mimeType "${reportedMime}" is not in the allow-list.` });
      }
      const storedFilename = mediaKey.replace(/^media\//, '');
      const url = `/api/media/proxy/${mediaKey}`;
      const [row] = await db.insert(media).values({
        filename: originalFilename,
        storedFilename,
        mimeType: reportedMime,
        fileSize: actualSize,
        url,
        alt: alt ?? null,
        caption: caption ?? null,
        uploadedBy: ctx.userId,
        clientId,
        websiteId: websiteId ?? null,
        brandingProfileId: brandingProfileId ?? null,
      }).returning();
      revalidateForWrite('portal');
      return json(row);
    }
  );

  hasScope(ctx.scopes, 'media:delete') && server.registerTool(
    'media_delete',
    {
      title: 'Delete media asset',
      description: 'Delete a media row from the client\'s library. NOTE: this removes the DB record; the S3 object itself is not purged.',
      inputSchema: {
        id: z.number(),
      },
    },
    async ({ id }) => {
      if (!requireScope(ctx, 'media:delete')) return denied('media:delete');
      if (!(await requireService(clientId, 'websites'))) return serviceDenied('websites');
      const [existing] = await db.select({ id: media.id }).from(media)
        .where(and(eq(media.id, id), eq(media.clientId, clientId))).limit(1);
      if (!existing) return json({ error: 'Media not found' });
      await db.delete(media).where(eq(media.id, id));
      revalidateForWrite('portal');
      return json({ success: true, id });
    }
  );


  // ── CATEGORIES / TAGS ──────────────────────────────────────────────────
  hasScope(ctx.scopes, 'sites:read') && server.registerTool(
    'taxonomies_list',
    {
      title: 'List categories and tags',
      description: 'List categories and tags scoped to a website (the client must own it).',
      inputSchema: { websiteId: z.number() },
    },
    async ({ websiteId }) => {
      if (!requireScope(ctx, 'sites:read')) return denied('sites:read');
      const [site] = await db.select({ id: clientWebsites.id }).from(clientWebsites)
        .where(and(eq(clientWebsites.id, websiteId), eq(clientWebsites.clientId, clientId))).limit(1);
      if (!site) return json({ error: 'Site not found' });
      const [cats, tgs] = await Promise.all([
        db.select().from(categories).where(eq(categories.websiteId, websiteId)).orderBy(categories.name),
        db.select().from(tags).where(eq(tags.websiteId, websiteId)).orderBy(tags.name),
      ]);
      return json({ categories: cats, tags: tgs });
    }
  );

  hasScope(ctx.scopes, 'sites:write') && server.registerTool(
    'taxonomies_create_category',
    {
      title: 'Create post category',
      description: 'Create a category on a website. Slug must be unique per website.',
      inputSchema: {
        websiteId: z.number(),
        name: z.string().min(1),
        slug: z.string().min(1).optional().describe('Derived from name if omitted.'),
        description: z.string().optional(),
        color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
      },
    },
    async ({ websiteId, name, slug, description, color }) => {
      if (!requireScope(ctx, 'sites:write')) return denied('sites:write');
      if (!(await requireService(clientId, 'websites'))) return serviceDenied('websites');
      const [site] = await db.select({ id: clientWebsites.id, name: clientWebsites.name }).from(clientWebsites)
        .where(and(eq(clientWebsites.id, websiteId), eq(clientWebsites.clientId, clientId))).limit(1);
      if (!site) return json({ error: 'Site not found' });
      const finalSlug = slugify((slug ?? name).trim());
      const result = await stageOrApply({
        ctx,
        entityType: 'taxonomy',
        operation: 'create',
        entityId: null,
        summary: `Create category "${name.trim()}" on "${site.name}"`,
        payload: { kind: 'category', websiteId, name, slug: finalSlug, description, color },
        apply: async () => {
          try {
            const [row] = await db.insert(categories).values({
              websiteId,
              name: name.trim(),
              slug: finalSlug,
              description: description ?? null,
              color: color ?? null,
            }).returning();
            return row;
          } catch (err) {
            throw new Error(`Could not create category (likely duplicate slug): ${(err as Error).message}`);
          }
        },
      });
      if (result.pending) return json({ pending: true, pendingId: result.pendingId, summary: result.summary, status: 'pending' });
      revalidateForWrite('posts');
      return json(result.data);
    }
  );

  hasScope(ctx.scopes, 'sites:write') && server.registerTool(
    'taxonomies_create_tag',
    {
      title: 'Create post tag',
      description: 'Create a tag on a website. Slug must be unique per website.',
      inputSchema: {
        websiteId: z.number(),
        name: z.string().min(1),
        slug: z.string().min(1).optional(),
      },
    },
    async ({ websiteId, name, slug }) => {
      if (!requireScope(ctx, 'sites:write')) return denied('sites:write');
      if (!(await requireService(clientId, 'websites'))) return serviceDenied('websites');
      const [site] = await db.select({ id: clientWebsites.id, name: clientWebsites.name }).from(clientWebsites)
        .where(and(eq(clientWebsites.id, websiteId), eq(clientWebsites.clientId, clientId))).limit(1);
      if (!site) return json({ error: 'Site not found' });
      const finalSlug = slugify((slug ?? name).trim());
      const result = await stageOrApply({
        ctx,
        entityType: 'taxonomy',
        operation: 'create',
        entityId: null,
        summary: `Create tag "${name.trim()}" on "${site.name}"`,
        payload: { kind: 'tag', websiteId, name, slug: finalSlug },
        apply: async () => {
          try {
            const [row] = await db.insert(tags).values({
              websiteId,
              name: name.trim(),
              slug: finalSlug,
            }).returning();
            return row;
          } catch (err) {
            throw new Error(`Could not create tag (likely duplicate slug): ${(err as Error).message}`);
          }
        },
      });
      if (result.pending) return json({ pending: true, pendingId: result.pendingId, summary: result.summary, status: 'pending' });
      revalidateForWrite('posts');
      return json(result.data);
    }
  );

  hasScope(ctx.scopes, 'sites:write') && server.registerTool(
    'posts_set_taxonomies',
    {
      title: 'Set post categories and tags',
      description:
        'Replace the categories and/or tags assigned to a post. Pass arrays of category/tag ids (not names) — call taxonomies_list first to look them up. Omitted arrays are left unchanged.',
      inputSchema: {
        postId: z.number(),
        categoryIds: z.array(z.number()).optional(),
        tagIds: z.array(z.number()).optional(),
      },
    },
    async ({ postId, categoryIds, tagIds }) => {
      if (!requireScope(ctx, 'sites:write')) return denied('sites:write');
      if (!(await requireService(clientId, 'websites'))) return serviceDenied('websites');
      const [post] = await db.select({ websiteId: posts.websiteId, title: posts.title }).from(posts)
        .where(eq(posts.id, postId)).limit(1);
      if (!post) return json({ error: 'Post not found' });
      if (!post.websiteId) return json({ error: 'Permission denied — agency post' });
      const [site] = await db.select({ id: clientWebsites.id }).from(clientWebsites)
        .where(and(eq(clientWebsites.id, post.websiteId), eq(clientWebsites.clientId, clientId))).limit(1);
      if (!site) return json({ error: 'Permission denied' });
      const prevCats = await db.select({ categoryId: postCategories.categoryId })
        .from(postCategories).where(eq(postCategories.postId, postId));
      const prevTags = await db.select({ tagId: postTags.tagId })
        .from(postTags).where(eq(postTags.postId, postId));
      const result = await stageOrApply({
        ctx,
        entityType: 'post_taxonomy',
        operation: 'update',
        entityId: postId,
        summary: `Set taxonomies on post "${post.title}"`,
        payload: { postId, categoryIds, tagIds },
        originalSnapshot: {
          categoryIds: prevCats.map((r) => r.categoryId),
          tagIds: prevTags.map((r) => r.tagId),
        },
        apply: async () => {
          if (categoryIds !== undefined) {
            await db.delete(postCategories).where(eq(postCategories.postId, postId));
            if (categoryIds.length > 0) {
              await db.insert(postCategories).values(categoryIds.map(cid => ({ postId, categoryId: cid })));
            }
          }
          if (tagIds !== undefined) {
            await db.delete(postTags).where(eq(postTags.postId, postId));
            if (tagIds.length > 0) {
              await db.insert(postTags).values(tagIds.map(tid => ({ postId, tagId: tid })));
            }
          }
          const assignedCats = await db.select({ categoryId: postCategories.categoryId })
            .from(postCategories).where(eq(postCategories.postId, postId));
          const assignedTags = await db.select({ tagId: postTags.tagId })
            .from(postTags).where(eq(postTags.postId, postId));
          return {
            postId,
            categoryIds: assignedCats.map(r => r.categoryId),
            tagIds: assignedTags.map(r => r.tagId),
          };
        },
      });
      if (result.pending) return json({ pending: true, pendingId: result.pendingId, summary: result.summary, status: 'pending' });
      revalidateForWrite('posts');
      return json(result.data);
    }
  );
}
