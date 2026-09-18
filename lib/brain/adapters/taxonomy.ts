/**
 * Brain MCP adapter — taxonomy, saved searches & note templates
 *
 * Split out of lib/brain/mcp-sdk-adapter.ts so the registrar decomposes
 * domain by domain (same composable pattern as people/decisions/topics/
 * glossary). Registered by the main registerBrainToolsOnSdk — never imported
 * by another adapter. Behavior is unchanged from before the split.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { hasScope, type PortalMcpContext } from '@/lib/mcp-auth';
import { json, denied } from '@/lib/mcp/types';
import { searchBrain } from '../search';
import { getOrCreateBrainProfile } from '../profiles';
import {
  createMeetingFromAdapter,
  getMeeting,
  linkMeeting,
  listMeetings,
  type BrainMeeting,
} from '../meetings';
import {
  createTask,
  getTask,
  listTasks,
  updateTask,
} from '../tasks';
import {
  createOverlay,
  getRelationship,
  listRelationships,
  updateOverlay,
} from '../relationships';
import {
  approveReviewItem,
  getReviewItem,
  listReviewItems,
  rejectReviewItem,
} from '../review';
import {
  applySuggestionToReviewItem,
  suggestReviewerForItem,
} from '../review-routing';
import {
  bulkUpdateNotes,
  createNote,
  countNotes,
  deleteNote,
  getNote,
  getNoteBySourceUrl,
  listNotes,
  restoreNote,
  updateNote,
  type BulkOp,
} from '../notes';
import { classifyNotes, type NoteClassification } from '../classify-notes';
import { applyClassifications } from '../apply-classifications';
import {
  listInitiatives,
  getInitiativeById,
  createInitiative,
  updateInitiative,
  closeInitiative,
  reopenInitiative,
  linkEntity,
  unlinkEntity,
  listInitiativeLinks,
} from '../initiatives';
import {
  listGoals,
  getGoalById,
  createGoal,
  updateGoal,
  checkinGoal,
  deleteGoal,
} from '../goals';
import {
  createSavedSearch,
  deleteSavedSearch,
  getSavedSearch,
  listSavedSearches,
  updateSavedSearch,
  type BrainSavedSearchFilters,
} from '../saved-searches';
import {
  createTemplate,
  deleteTemplate,
  DuplicateTemplateNameError,
  getTemplate,
  listTemplates,
  updateTemplate,
  type BrainNoteTemplateTrigger,
} from '../templates';
import { applyTemplate } from '../template';
import { getDashboardSummary } from '../dashboard';
import {
  listPlaybooks,
  getPlaybookById,
  createPlaybook,
  updatePlaybook,
  activatePlaybook,
  archivePlaybook,
  deletePlaybook,
  addStep,
  updateStep,
  removeStep,
  reorderSteps,
  type AddStepInput,
  type UpdateStepInput,
  type BrainPlaybookCondition,
} from '../playbooks';
import {
  listRuns,
  getRunById,
  listActiveRunsForEntity,
  startRun,
  advanceRun,
  completeStep,
  skipStep,
  abortRun,
} from '../playbook-runs';
import {
  listDocuments,
  getDocumentById,
  createDocument,
  updateDocument,
  editDraftVersion,
  publishDocument,
  archiveDocument,
  unarchiveDocument,
  deleteDocument,
  promoteFromNote,
  linkEntity as linkDocumentEntity,
  unlinkEntity as unlinkDocumentEntity,
  listDocumentLinks,
} from '../documents';
import {
  assignRequiredRead,
  listRequiredReadsForDocument,
  listRequiredReadsForPerson,
  removeRequiredRead,
  acknowledge as acknowledgeDocument,
  listAcknowledgmentsForDocument,
  listAcknowledgmentsForPerson,
  complianceReport,
} from '../document-acks';
import { db } from '@/lib/db';
import {
  brainAiReviewItems,
  brainAuditLogs,
  brainOrgUnits,
  brainPeople,
  brainPersonOrgUnits,
  brainDocumentVersions,
  users,
  type BrainPersonStatus,
  type BrainDocumentStatus,
  type BrainDocumentCategory,
  type BrainDocumentLinkEntityType,
  type BrainDocumentRequiredReadTarget,
} from '@/lib/db/schema';
import { eq, and, desc, inArray, sql } from 'drizzle-orm';
import { assertUserVisibleToClient, OwnershipError } from '@/lib/security/assert-owned';

// MCP clients are off-origin (Claude Desktop, etc.), so relative paths like
// /portal/brain/knowledge are useless to them. Absolutize against the public
// portal origin before returning.
const PORTAL_BASE_URL = (process.env.NEXTAUTH_URL || 'https://simplerdevelopment.com').replace(/\/$/, '');
import { err } from './shared';
import { registerDecisionBrainTools } from './decisions';
import { registerTopicBrainTools } from './topics';
import { registerPeopleBrainTools } from './people';
import { registerGlossaryBrainTools } from './glossary';

function absolutizeUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  return `${PORTAL_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`;
}


export function registerBrainTaxonomyTools(server: McpServer, ctx: PortalMcpContext, clientId: number) {
  // ── KNOWLEDGE — taxonomy classification (BRAIN-1) ────────────────────────
  // Zod enums mirroring the union slug types from ./classify-notes. Kept
  // inline so the input schema is self-describing for MCP clients.
  const sourceSlugEnum = z.enum([
    'slate-kb', 'competitor', 'own-marketing',
    'industry-news', 'research-brief', 'meeting-transcript', 'linkedin-draft',
  ]);
  const slateAreaSlugEnum = z.enum([
    'queries', 'deliver', 'portals', 'forms',
    'workflows', 'reports', 'permissions', 'integrations', 'none',
  ]);
  const audienceSlugEnum = z.enum([
    'vp-enrollment', 'slate-admin', 'advancement',
    'internal-only', 'prospect-facing',
  ]);
  const contentTypeSlugEnum = z.enum([
    'how-to', 'case-study', 'reference', 'opinion',
    'transcript', 'news', 'service-page',
  ]);
  const recencySlugEnum = z.enum(['evergreen', 'current-12mo', 'archive']);
  const competitorSlugEnum = z.enum([
    'carnegie', 'enrollmentfuel', 'rhb', 'waybetter',
    'human-capital', 'huron', 'bwf',
  ]);
  const noteStatusSlugEnum = z.enum(['canonical', 'draft', 'stub', 'duplicate']);

  hasScope(ctx.scopes, 'brain:write') && server.registerTool(
    'brain_classify_notes',
    {
      title: 'Classify Brain knowledge notes (BRAIN-1 taxonomy)',
      description: 'Run the LLM classifier across knowledge notes to assign source / slate-area / audience / content-type / recency / competitor / status facets. Pass an explicit `noteIds` array OR `all:true` (one is required). `dryRun:true` (DEFAULT) returns counts + a 5-row sample only — token-budget safe for thousands of notes. `dryRun:false` returns the full per-note classifications (minus `reasoning`) so they can be fed to brain_apply_classifications. No DB writes either way — this tool only previews.',
      inputSchema: {
        noteIds: z.array(z.number().int().positive()).max(500).optional(),
        all: z.boolean().optional(),
        limit: z.number().int().min(1).max(500).optional(),
        concurrency: z.number().int().min(1).max(8).optional(),
        dryRun: z.boolean().optional().default(true).describe('When true (default), return counts + 5-row sample only. When false, return all classifications (without reasoning).'),
      },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:write')) return denied('brain:write');
      const hasIds = Array.isArray(args.noteIds) && args.noteIds.length > 0;
      const all = args.all === true;
      if (!hasIds && !all) {
        return err('brain_classify_notes requires either `noteIds` (a non-empty array) or `all:true`.');
      }
      if (hasIds && all) {
        return err('brain_classify_notes accepts `noteIds` OR `all:true`, not both.');
      }
      const out = await classifyNotes({
        clientId,
        noteIds: hasIds ? args.noteIds : undefined,
        all: all || undefined,
        limit: args.limit,
        concurrency: args.concurrency,
        actorId: ctx.userId,
      });
      const dryRun = args.dryRun !== false; // default true
      if (dryRun) {
        const countsBySource: Record<string, number> = {};
        const countsByContentType: Record<string, number> = {};
        const countsByStatus: Record<string, number> = {};
        for (const c of out.classifications) {
          countsBySource[c.source] = (countsBySource[c.source] ?? 0) + 1;
          countsByContentType[c.contentType] = (countsByContentType[c.contentType] ?? 0) + 1;
          countsByStatus[c.status] = (countsByStatus[c.status] ?? 0) + 1;
        }
        return json({
          dryRun: true,
          classifiedCount: out.classifications.length,
          skippedCount: out.skipped.length,
          countsBySource,
          countsByContentType,
          countsByStatus,
          sampleClassifications: out.classifications.slice(0, 5).map((c) => ({
            noteId: c.noteId,
            source: c.source,
            slateAreas: c.slateAreas,
            audiences: c.audiences,
            contentType: c.contentType,
            recency: c.recency,
            competitor: c.competitor ?? null,
            status: c.status,
            confidence: c.confidence,
          })),
          tokensUsed: out.tokensUsed,
          costUsd: out.costUsd,
        });
      }
      return json({
        dryRun: false,
        classifications: out.classifications.map((c) => ({
          noteId: c.noteId,
          source: c.source,
          slateAreas: c.slateAreas,
          audiences: c.audiences,
          contentType: c.contentType,
          recency: c.recency,
          competitor: c.competitor ?? null,
          status: c.status,
          confidence: c.confidence,
          // reasoning intentionally dropped — verbose, blows the token budget.
        })),
        skipped: out.skipped,
        tokensUsed: out.tokensUsed,
        costUsd: out.costUsd,
      });
    },
  );

  hasScope(ctx.scopes, 'brain:write') && server.registerTool(
    'brain_apply_classifications',
    {
      title: 'Apply Brain note classifications (BRAIN-1 taxonomy)',
      description: 'Persist classifier output from brain_classify_notes: writes the brain_notes.status enum and attaches the matching reserved taxonomy topics. Rows below `minConfidence` (default 0.7) are routed to the AI review queue when `routeBelowMinToReview` is true (default), otherwise silently skipped. Idempotent — re-applying counts existing attachments as `attachmentsExisted`. Echo: { notesUpdated, topicsAttached, attachmentsExisted, routedToReview, skippedTotal, skipped (first 20) }.',
      inputSchema: {
        classifications: z.array(z.object({
          noteId: z.number().int().positive(),
          source: sourceSlugEnum,
          slateAreas: z.array(slateAreaSlugEnum),
          audiences: z.array(audienceSlugEnum),
          contentType: contentTypeSlugEnum,
          recency: recencySlugEnum,
          competitor: competitorSlugEnum.nullable().optional(),
          status: noteStatusSlugEnum,
          confidence: z.number().min(0).max(1),
          reasoning: z.string().optional(),
        })).min(1).max(500),
        minConfidence: z.number().min(0).max(1).optional(),
        routeBelowMinToReview: z.boolean().optional(),
      },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:write')) return denied('brain:write');
      const out = await applyClassifications({
        clientId,
        classifications: args.classifications as NoteClassification[],
        actorId: ctx.userId,
        minConfidence: args.minConfidence,
        routeBelowMinToReview: args.routeBelowMinToReview,
      });
      return json({
        notesUpdated: out.notesUpdated,
        topicsAttached: out.topicsAttached,
        attachmentsExisted: out.attachmentsExisted,
        routedToReview: out.routedToReview,
        skippedTotal: out.skipped.length,
        skipped: out.skipped.slice(0, 20),
      });
    },
  );

  hasScope(ctx.scopes, 'brain:read') && server.registerTool(
    'brain_list_note_history',
    {
      title: 'List Brain note audit history',
      description: 'Audit log for one note: created, updated, soft_deleted, restored, hard_deleted, attachment_cleared, etc. Slim by default (omits metadata.diff and other large blobs). Pass includeDiff=true to receive the full metadata payload.',
      inputSchema: {
        noteId: z.number().int().positive(),
        limit: z.number().int().min(1).max(200).optional(),
        includeDiff: z.boolean().optional().describe('When true, include the full metadata blob (may contain diffs). Default false.'),
      },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:read')) return denied('brain:read');
      const note = await getNote(clientId, args.noteId);
      if (!note) return err('Note not found.');
      const limit = args.limit ?? 50;
      const rows = await db.select().from(brainAuditLogs)
        .where(and(
          eq(brainAuditLogs.clientId, clientId),
          eq(brainAuditLogs.entityType, 'brain_note'),
          eq(brainAuditLogs.entityId, args.noteId),
        ))
        .orderBy(desc(brainAuditLogs.createdAt))
        .limit(limit);
      const items = rows.map((r) => ({
        id: r.id,
        action: r.action,
        actorId: r.actorId,
        createdAt: r.createdAt,
        ...(args.includeDiff ? { metadata: r.metadata } : {}),
      }));
      return json({ items, limit });
    },
  );

  // ── KNOWLEDGE — saved searches ───────────────────────────────────────────

  hasScope(ctx.scopes, 'brain:read') && server.registerTool(
    'brain_list_saved_searches',
    {
      title: 'List Brain saved searches',
      description: 'List the caller\'s sidebar-pinned filter sets. scope=mine returns personal pins only, scope=shared returns team pins (userId IS NULL), scope=all (default) returns both. Slim by default (no filters JSON); pass includeFilters=true to receive the filter payloads inline.',
      inputSchema: {
        scope: z.enum(['mine', 'shared', 'all']).optional(),
        includeFilters: z.boolean().optional(),
      },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:read')) return denied('brain:read');
      const scope = args.scope ?? 'all';
      let rows;
      if (scope === 'shared') {
        rows = await listSavedSearches(clientId, { userId: null });
      } else if (scope === 'mine') {
        const all = await listSavedSearches(clientId, { userId: ctx.userId });
        rows = all.filter((r) => r.userId === ctx.userId);
      } else {
        rows = await listSavedSearches(clientId, { userId: ctx.userId });
      }
      const items = rows.map((r) => ({
        id: r.id,
        name: r.name,
        icon: r.icon,
        scope: r.userId === null ? 'shared' : 'personal',
        userId: r.userId,
        sortOrder: r.sortOrder,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
        ...(args.includeFilters ? { filters: r.filters } : {}),
      }));
      return json({ items });
    },
  );

  hasScope(ctx.scopes, 'brain:read') && server.registerTool(
    'brain_get_saved_search',
    {
      title: 'Get a Brain saved search',
      description: 'Fetch a saved search by id, including the full filters JSON.',
      inputSchema: {
        id: z.number().int().positive(),
      },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:read')) return denied('brain:read');
      const row = await getSavedSearch(clientId, args.id);
      if (!row) return err('Saved search not found.');
      return json(row);
    },
  );

  hasScope(ctx.scopes, 'brain:write') && server.registerTool(
    'brain_create_saved_search',
    {
      title: 'Create a Brain saved search',
      description: 'Pin a knowledge filter set to the sidebar. scope="shared" makes it team-visible (userId IS NULL); scope="personal" (default) scopes to the caller. Returns identity echo only — re-fetch via brain_get_saved_search if you need the filters back.',
      inputSchema: {
        name: z.string().min(1).max(150),
        filters: z.object({
          search: z.string().optional(),
          tagPrefix: z.string().optional(),
          tags: z.array(z.string()).optional(),
          pinnedOnly: z.boolean().optional(),
          trashed: z.boolean().optional(),
          sort: z.enum(['updated', 'created', 'title']).optional(),
          order: z.enum(['asc', 'desc']).optional(),
        }),
        icon: z.string().max(50).optional(),
        sortOrder: z.number().optional(),
        scope: z.enum(['personal', 'shared']).optional(),
      },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:write')) return denied('brain:write');
      const userId = args.scope === 'shared' ? null : ctx.userId;
      const created = await createSavedSearch({
        clientId,
        userId,
        name: args.name,
        icon: args.icon,
        filters: args.filters as BrainSavedSearchFilters,
        sortOrder: args.sortOrder,
        createdBy: ctx.userId,
      });
      return json({
        id: created.id,
        name: created.name,
        icon: created.icon,
        scope: created.userId === null ? 'shared' : 'personal',
        userId: created.userId,
        sortOrder: created.sortOrder,
        createdAt: created.createdAt,
      });
    },
  );

  hasScope(ctx.scopes, 'brain:write') && server.registerTool(
    'brain_update_saved_search',
    {
      title: 'Update a Brain saved search',
      description: 'Patch fields on a saved search. Pass scope to move between personal and shared. Returns identity echo + updatedAt; re-fetch via brain_get_saved_search if you need the new filters.',
      inputSchema: {
        id: z.number().int().positive(),
        name: z.string().min(1).max(150).optional(),
        filters: z.object({
          search: z.string().optional(),
          tagPrefix: z.string().optional(),
          tags: z.array(z.string()).optional(),
          pinnedOnly: z.boolean().optional(),
          trashed: z.boolean().optional(),
          sort: z.enum(['updated', 'created', 'title']).optional(),
          order: z.enum(['asc', 'desc']).optional(),
        }).optional(),
        icon: z.string().max(50).optional(),
        sortOrder: z.number().optional(),
        scope: z.enum(['personal', 'shared']).optional(),
      },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:write')) return denied('brain:write');
      const patch: Parameters<typeof updateSavedSearch>[2] = {};
      if (args.name !== undefined) patch.name = args.name;
      if (args.filters !== undefined) patch.filters = args.filters as BrainSavedSearchFilters;
      if (args.icon !== undefined) patch.icon = args.icon;
      if (args.sortOrder !== undefined) patch.sortOrder = args.sortOrder;
      if (args.scope !== undefined) patch.userId = args.scope === 'shared' ? null : ctx.userId;
      const updated = await updateSavedSearch(clientId, args.id, patch, ctx.userId);
      if (!updated) return err('Saved search not found.');
      return json({
        id: updated.id,
        name: updated.name,
        icon: updated.icon,
        scope: updated.userId === null ? 'shared' : 'personal',
        userId: updated.userId,
        sortOrder: updated.sortOrder,
        updatedAt: updated.updatedAt,
      });
    },
  );

  hasScope(ctx.scopes, 'brain:write') && server.registerTool(
    'brain_delete_saved_search',
    {
      title: 'Delete a Brain saved search',
      description: 'Remove a saved-search pin from the sidebar.',
      inputSchema: {
        id: z.number().int().positive(),
      },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:write')) return denied('brain:write');
      const ok = await deleteSavedSearch(clientId, args.id, ctx.userId);
      if (!ok) return err('Saved search not found.');
      return json({ id: args.id, deleted: true });
    },
  );

  // ── KNOWLEDGE — note templates ───────────────────────────────────────────

  hasScope(ctx.scopes, 'brain:read') && server.registerTool(
    'brain_list_note_templates',
    {
      title: 'List Brain note templates',
      description: 'List reusable note templates (markdown bodies with {{variables}}). Slim by default (omits the body text); pass includeBody=true to inline bodies — they can be multi-KB each.',
      inputSchema: {
        trigger: z.enum(['manual', 'daily', 'meeting', 'slash']).optional(),
        enabled: z.boolean().optional(),
        includeBody: z.boolean().optional(),
      },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:read')) return denied('brain:read');
      const rows = await listTemplates(clientId, {
        trigger: args.trigger as BrainNoteTemplateTrigger | undefined,
        enabled: args.enabled,
      });
      const items = rows.map((t) => ({
        id: t.id,
        name: t.name,
        trigger: t.trigger,
        enabled: t.enabled,
        variables: t.variables,
        defaultTags: t.defaultTags,
        bodyLength: t.body.length,
        createdAt: t.createdAt,
        updatedAt: t.updatedAt,
        ...(args.includeBody ? { body: t.body } : {}),
      }));
      return json({ items });
    },
  );

  hasScope(ctx.scopes, 'brain:read') && server.registerTool(
    'brain_get_note_template',
    {
      title: 'Get a Brain note template',
      description: 'Fetch a template by id, including the full markdown body.',
      inputSchema: {
        id: z.number().int().positive(),
      },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:read')) return denied('brain:read');
      const row = await getTemplate(clientId, args.id);
      if (!row) return err('Template not found.');
      return json(row);
    },
  );

  hasScope(ctx.scopes, 'brain:write') && server.registerTool(
    'brain_create_note_template',
    {
      title: 'Create a Brain note template',
      description: 'Define a reusable note template. Body is markdown — supports {{variables}} resolved by lib/brain/template.ts. Returns 409-equivalent error if a template with this name already exists for the client.',
      inputSchema: {
        name: z.string().min(1).max(150),
        body: z.string().min(1),
        trigger: z.enum(['manual', 'daily', 'meeting', 'slash']).optional(),
        variables: z.array(z.string()).optional(),
        defaultTags: z.array(z.string()).optional(),
        enabled: z.boolean().optional(),
      },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:write')) return denied('brain:write');
      try {
        const created = await createTemplate({
          clientId,
          name: args.name,
          body: args.body,
          trigger: args.trigger as BrainNoteTemplateTrigger | undefined,
          variables: args.variables ?? null,
          defaultTags: args.defaultTags ?? null,
          enabled: args.enabled,
          createdBy: ctx.userId,
        });
        return json({
          id: created.id,
          name: created.name,
          trigger: created.trigger,
          enabled: created.enabled,
          bodyLength: created.body.length,
          createdAt: created.createdAt,
        });
      } catch (e) {
        if (e instanceof DuplicateTemplateNameError) {
          return err(`A template named "${args.name}" already exists for this client.`);
        }
        return err(e instanceof Error ? e.message : 'Failed to create template.');
      }
    },
  );

  hasScope(ctx.scopes, 'brain:write') && server.registerTool(
    'brain_update_note_template',
    {
      title: 'Update a Brain note template',
      description: 'Patch any field on a template. Returns identity echo + updatedAt; re-fetch via brain_get_note_template if you need the full body back.',
      inputSchema: {
        id: z.number().int().positive(),
        name: z.string().min(1).max(150).optional(),
        body: z.string().min(1).optional(),
        trigger: z.enum(['manual', 'daily', 'meeting', 'slash']).optional(),
        variables: z.array(z.string()).nullable().optional(),
        defaultTags: z.array(z.string()).nullable().optional(),
        enabled: z.boolean().optional(),
      },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:write')) return denied('brain:write');
      try {
        const updated = await updateTemplate(clientId, args.id, {
          name: args.name,
          body: args.body,
          trigger: args.trigger as BrainNoteTemplateTrigger | undefined,
          variables: args.variables,
          defaultTags: args.defaultTags,
          enabled: args.enabled,
        }, ctx.userId);
        if (!updated) return err('Template not found.');
        return json({
          id: updated.id,
          name: updated.name,
          trigger: updated.trigger,
          enabled: updated.enabled,
          bodyLength: updated.body.length,
          updatedAt: updated.updatedAt,
        });
      } catch (e) {
        if (e instanceof DuplicateTemplateNameError) {
          return err(`A template named "${args.name}" already exists for this client.`);
        }
        return err(e instanceof Error ? e.message : 'Failed to update template.');
      }
    },
  );

  hasScope(ctx.scopes, 'brain:write') && server.registerTool(
    'brain_delete_note_template',
    {
      title: 'Delete a Brain note template',
      description: 'Permanently delete a template. Existing notes created from it are unaffected.',
      inputSchema: {
        id: z.number().int().positive(),
      },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:write')) return denied('brain:write');
      const ok = await deleteTemplate(clientId, args.id, ctx.userId);
      if (!ok) return err('Template not found.');
      return json({ id: args.id, deleted: true });
    },
  );

  hasScope(ctx.scopes, 'brain:write') && server.registerTool(
    'brain_create_note_from_template',
    {
      title: 'Materialize a Brain note from a template',
      description: 'Apply a template (resolving {{today}}, {{userName}}, etc.) and create a new note. Mirrors POST /portal/brain/knowledge/from-template/[id]. Slim echo (no body) — fetch full content via brain_get_note.',
      inputSchema: {
        templateId: z.number().int().positive(),
        titleOverride: z.string().max(255).optional(),
      },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:write')) return denied('brain:write');
      const template = await getTemplate(clientId, args.templateId);
      if (!template) return err('Template not found.');

      const [actor] = await db.select({ name: users.name, email: users.email }).from(users)
        .where(eq(users.id, ctx.userId))
        .limit(1);
      const userName = actor?.name?.trim() || actor?.email || null;

      const appliedBody = await applyTemplate(template.body, {
        today: new Date(),
        clientId,
        userName,
      });

      const tags = Array.from(new Set([
        ...(template.defaultTags ?? []),
        `from_template:${template.id}`,
      ]));

      const note = await createNote({
        clientId,
        title: args.titleOverride?.trim() || template.name,
        body: appliedBody,
        tags,
        source: 'manual',
        createdBy: ctx.userId,
      });

      return json({
        id: note.id,
        title: note.title,
        bodyLength: note.body.length,
        tags: note.tags,
        updatedAt: note.updatedAt,
      });
    },
  );
}
