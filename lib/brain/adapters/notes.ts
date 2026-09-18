/**
 * Brain MCP adapter — knowledge notes
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


export function registerBrainNotesTools(server: McpServer, ctx: PortalMcpContext, clientId: number) {
  // ── KNOWLEDGE — notes (the surface AI agents drive web crawls into) ──────

  hasScope(ctx.scopes, 'brain:read') && server.registerTool(
    'brain_list_notes',
    {
      title: 'List Brain knowledge notes',
      description: 'List/search notes in Company Brain Knowledge. Use this BEFORE crawling a URL to dedupe — pass `sourceUrl` for an exact match or `sourceUrlStartsWith` for a domain-wide check. Slim by default (no body — call brain_get_note for the full row); paginated via { items, total, limit, offset }.',
      inputSchema: {
        search: z.string().optional().describe('ILIKE on title and body.'),
        tag: z.string().optional().describe('Match a single tag.'),
        sourceUrl: z.string().optional().describe('Exact source URL match — for dedup.'),
        sourceUrlStartsWith: z.string().optional().describe('Prefix match on source URL — e.g. "https://docs.example.com/" to find everything ingested from that site.'),
        relationshipOverlayId: z.number().int().positive().optional(),
        companyId: z.number().int().positive().optional(),
        dealId: z.number().int().positive().optional(),
        contactId: z.number().int().positive().optional(),
        meetingId: z.number().int().positive().optional(),
        pinnedOnly: z.boolean().optional(),
        trashed: z.boolean().optional().describe('When true, return only soft-deleted notes (the trash bin). Default false.'),
        limit: z.number().int().min(1).max(200).optional(),
        offset: z.number().int().min(0).optional(),
      },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:read')) return denied('brain:read');
      const limit = args.limit ?? 50;
      const offset = args.offset ?? 0;
      const filters = {
        search: args.search,
        tag: args.tag,
        sourceUrl: args.sourceUrl,
        sourceUrlStartsWith: args.sourceUrlStartsWith,
        relationshipOverlayId: args.relationshipOverlayId,
        companyId: args.companyId,
        dealId: args.dealId,
        contactId: args.contactId,
        meetingId: args.meetingId,
        pinnedOnly: args.pinnedOnly,
        trashed: args.trashed,
      };
      const [notes, total] = await Promise.all([
        // includeBody: true because this MCP tool returns a 400-char preview
        // and the body length; the default slim list projection drops body.
        listNotes(clientId, { ...filters, limit, offset, includeBody: true }),
        countNotes(clientId, filters),
      ]);
      // Trim bodies for list responses; full body is available via brain_get_note.
      const items = notes.map((n) => ({
        id: n.id,
        title: n.title,
        bodyPreview: n.body.slice(0, 400),
        bodyLength: n.body.length,
        tags: n.tags,
        sourceUrl: n.sourceUrl,
        confidentialityLevel: n.confidentialityLevel,
        pinned: n.pinned,
        source: n.source,
        relationshipOverlayId: n.relationshipOverlayId,
        companyId: n.companyId,
        dealId: n.dealId,
        contactId: n.contactId,
        meetingId: n.meetingId,
        attachmentFilename: n.attachmentFilename,
        attachmentMimeType: n.attachmentMimeType,
        deletedAt: n.deletedAt,
        createdAt: n.createdAt,
        updatedAt: n.updatedAt,
      }));
      return json({ items, total, limit, offset });
    },
  );

  hasScope(ctx.scopes, 'brain:read') && server.registerTool(
    'brain_get_note',
    {
      title: 'Get a Brain knowledge note',
      description: 'Fetch a single note with its full body. Use brain_list_notes to find IDs.',
      inputSchema: {
        noteId: z.number().int().positive(),
      },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:read')) return denied('brain:read');
      const note = await getNote(clientId, args.noteId);
      if (!note) return err('Note not found.');
      return json(note);
    },
  );

  hasScope(ctx.scopes, 'brain:write') && server.registerTool(
    'brain_create_note',
    {
      title: 'Create a Brain knowledge note',
      description: 'Save a knowledge note. The primary write surface for AI-driven web ingestion: pass `sourceUrl` to record provenance and source="crawl" when ingesting from the web. Body is markdown, capped at 50KB. Pre-check for an existing note via brain_list_notes(sourceUrl=...) before creating to avoid duplicates.',
      inputSchema: {
        title: z.string().min(1).max(255),
        body: z.string().max(50_000).optional(),
        tags: z.array(z.string()).optional(),
        sourceUrl: z.string().url().optional().describe('Original URL the content came from (for crawled notes).'),
        source: z.enum(['manual', 'ai_review', 'document_import', 'crawl']).optional(),
        confidentialityLevel: z.enum(['standard', 'restricted', 'confidential']).optional(),
        pinned: z.boolean().optional(),
        relationshipOverlayId: z.number().int().positive().optional(),
        companyId: z.number().int().positive().optional(),
        dealId: z.number().int().positive().optional(),
        contactId: z.number().int().positive().optional(),
        meetingId: z.number().int().positive().optional(),
      },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:write')) return denied('brain:write');
      const note = await createNote({
        clientId,
        title: args.title,
        body: args.body ?? '',
        tags: args.tags ?? [],
        sourceUrl: args.sourceUrl ?? null,
        source: args.source ?? (args.sourceUrl ? 'crawl' : 'manual'),
        confidentialityLevel: args.confidentialityLevel,
        pinned: args.pinned ?? false,
        relationshipOverlayId: args.relationshipOverlayId ?? null,
        companyId: args.companyId ?? null,
        dealId: args.dealId ?? null,
        contactId: args.contactId ?? null,
        meetingId: args.meetingId ?? null,
        createdBy: ctx.userId,
      });
      return json(note);
    },
  );

  hasScope(ctx.scopes, 'brain:write') && server.registerTool(
    'brain_upsert_note_by_url',
    {
      title: 'Upsert a Brain knowledge note keyed by source URL',
      description: 'Idempotent crawl primitive: if a note already exists for this `sourceUrl`, update its title/body/tags; otherwise create a new one. Returns `{ note, created: boolean }`. Prefer this over brain_create_note when ingesting web pages.',
      inputSchema: {
        sourceUrl: z.string().url(),
        title: z.string().min(1).max(255),
        body: z.string().max(50_000),
        tags: z.array(z.string()).optional(),
        confidentialityLevel: z.enum(['standard', 'restricted', 'confidential']).optional(),
        relationshipOverlayId: z.number().int().positive().optional(),
        companyId: z.number().int().positive().optional(),
        dealId: z.number().int().positive().optional(),
      },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:write')) return denied('brain:write');
      const existing = await getNoteBySourceUrl(clientId, args.sourceUrl);
      if (existing) {
        const updated = await updateNote(clientId, existing.id, {
          title: args.title,
          body: args.body,
          tags: args.tags,
          confidentialityLevel: args.confidentialityLevel,
          relationshipOverlayId: args.relationshipOverlayId,
          companyId: args.companyId,
          dealId: args.dealId,
        }, ctx.userId);
        return json({ note: updated, created: false });
      }
      const created = await createNote({
        clientId,
        title: args.title,
        body: args.body,
        tags: args.tags ?? [],
        sourceUrl: args.sourceUrl,
        source: 'crawl',
        confidentialityLevel: args.confidentialityLevel,
        relationshipOverlayId: args.relationshipOverlayId ?? null,
        companyId: args.companyId ?? null,
        dealId: args.dealId ?? null,
        createdBy: ctx.userId,
      });
      return json({ note: created, created: true });
    },
  );

  hasScope(ctx.scopes, 'brain:write') && server.registerTool(
    'brain_update_note',
    {
      title: 'Update a Brain knowledge note',
      description: 'Patch fields on an existing note. Pass `null` for nullable fields to clear them.',
      inputSchema: {
        noteId: z.number().int().positive(),
        title: z.string().min(1).max(255).optional(),
        body: z.string().max(50_000).optional(),
        tags: z.array(z.string()).optional(),
        sourceUrl: z.string().url().nullable().optional(),
        confidentialityLevel: z.enum(['standard', 'restricted', 'confidential']).optional(),
        pinned: z.boolean().optional(),
        relationshipOverlayId: z.number().int().positive().nullable().optional(),
        companyId: z.number().int().positive().nullable().optional(),
        dealId: z.number().int().positive().nullable().optional(),
        contactId: z.number().int().positive().nullable().optional(),
        meetingId: z.number().int().positive().nullable().optional(),
      },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:write')) return denied('brain:write');
      const updated = await updateNote(clientId, args.noteId, {
        title: args.title,
        body: args.body,
        tags: args.tags,
        sourceUrl: args.sourceUrl ?? undefined,
        confidentialityLevel: args.confidentialityLevel,
        pinned: args.pinned,
        relationshipOverlayId: args.relationshipOverlayId ?? undefined,
        companyId: args.companyId ?? undefined,
        dealId: args.dealId ?? undefined,
        contactId: args.contactId ?? undefined,
        meetingId: args.meetingId ?? undefined,
      }, ctx.userId);
      if (!updated) return err('Note not found.');
      return json(updated);
    },
  );

  hasScope(ctx.scopes, 'brain:write') && server.registerTool(
    'brain_delete_note',
    {
      title: 'Delete a Brain knowledge note',
      description: 'Two-stage delete matching the portal. Default (force=false) soft-deletes — note moves to trash and can be restored via brain_restore_note; if the note was already trashed, this hard-deletes it. Pass force=true to hard-delete on the first call. Hard delete cleans up any attached S3 object. AUDITED.',
      inputSchema: {
        noteId: z.number().int().positive(),
        force: z.boolean().optional().describe('When true, skip the soft-delete stage and hard-delete immediately.'),
      },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:write')) return denied('brain:write');
      const before = await getNote(clientId, args.noteId);
      if (!before) return err('Note not found.');
      const willHardDelete = args.force === true || before.deletedAt !== null;
      const ok = await deleteNote(clientId, args.noteId, ctx.userId, { force: args.force });
      if (!ok) return err('Note not found.');
      return json({ id: args.noteId, deleted: willHardDelete ? 'hard' : 'soft' });
    },
  );

  hasScope(ctx.scopes, 'brain:write') && server.registerTool(
    'brain_restore_note',
    {
      title: 'Restore a soft-deleted Brain knowledge note',
      description: 'Move a trashed note back to the active list. No-op (returns the note) if it was not deleted. Mirrors POST /portal/brain/knowledge/[id]/restore.',
      inputSchema: {
        noteId: z.number().int().positive(),
      },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:write')) return denied('brain:write');
      const restored = await restoreNote(clientId, args.noteId, ctx.userId);
      if (!restored) return err('Note not found.');
      return json({
        id: restored.id,
        title: restored.title,
        bodyLength: restored.body.length,
        tags: restored.tags,
        sourceUrl: restored.sourceUrl,
        pinned: restored.pinned,
        deletedAt: restored.deletedAt,
        updatedAt: restored.updatedAt,
      });
    },
  );

  hasScope(ctx.scopes, 'brain:write') && server.registerTool(
    'brain_bulk_update_notes',
    {
      title: 'Bulk update Brain knowledge notes',
      description: 'Apply one of: soft_delete, restore, hard_delete, add_tags, remove_tags, replace_tag_prefix to up to 500 notes. Returns { updated, skipped }. Cross-tenant ids are silently skipped.',
      inputSchema: {
        ids: z.array(z.number().int().positive()).min(1).max(500),
        op: z.discriminatedUnion('kind', [
          z.object({ kind: z.literal('soft_delete') }),
          z.object({ kind: z.literal('restore') }),
          z.object({ kind: z.literal('hard_delete') }),
          z.object({ kind: z.literal('add_tags'), tags: z.array(z.string().min(1)).min(1) }),
          z.object({ kind: z.literal('remove_tags'), tags: z.array(z.string().min(1)).min(1) }),
          z.object({ kind: z.literal('replace_tag_prefix'), from: z.string().min(1), to: z.string() }),
        ]),
      },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:write')) return denied('brain:write');
      const summary = await bulkUpdateNotes(clientId, args.ids, args.op as BulkOp, ctx.userId);
      return json({ updated: summary.updated, skipped: summary.failed });
    },
  );
}
