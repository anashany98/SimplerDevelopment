/**
 * Brain MCP adapter — documents write
 *
 * Split out of adapters/documents.ts to keep new files
 * under the 800-line new-file cap (scripts/check-file-budget.ts). Behavior is
 * unchanged from before the split.
 */
/**
 * Brain MCP adapter — documents
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
import {
  DOCUMENT_CATEGORIES,
  DOCUMENT_STATUSES,
  DOCUMENT_LINK_ENTITY_TYPES,
  DOCUMENT_REQUIRED_READ_TARGETS,
  CONFIDENTIALITY_LEVELS,
} from './document-schemas';

function absolutizeUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  return `${PORTAL_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`;
}



export function registerBrainDocumentsWriteTools(server: McpServer, ctx: PortalMcpContext, clientId: number) {
  // ── DOCUMENTS — write ────────────────────────────────────────────────────

  hasScope(ctx.scopes, 'brain:write') && server.registerTool(
    'brain_documents_create',
    {
      title: 'Create a Brain document',
      description: 'Create a new document seeded with an empty v1 draft. Slug is auto-derived from title (collisions per tenant suffix -2, -3, …). Echoes { id, slug, status, version1Id } — call brain_documents_get for the full row. To populate the body, follow up with brain_document_versions_edit_draft, then brain_documents_publish.',
      inputSchema: {
        title: z.string().min(1).max(255),
        category: z.enum(DOCUMENT_CATEGORIES).optional(),
        ownerId: z.number().int().positive().nullable().optional(),
        confidentialityLevel: z.enum(CONFIDENTIALITY_LEVELS).optional(),
        defaultTopicIds: z.array(z.number().int().positive()).optional(),
        sourceNoteId: z.number().int().positive().nullable().optional(),
      },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:write')) return denied('brain:write');
      try {
        const out = await createDocument(clientId, ctx.userId, {
          title: args.title,
          category: args.category as BrainDocumentCategory | undefined,
          ownerId: args.ownerId ?? null,
          confidentialityLevel: args.confidentialityLevel,
          defaultTopicIds: args.defaultTopicIds,
          sourceNoteId: args.sourceNoteId ?? null,
        });
        return json({
          id: out.document.id,
          slug: out.document.slug,
          status: out.document.status,
          version1Id: out.version.id,
        });
      } catch (e) {
        return err(e instanceof Error ? e.message : 'Failed to create document.');
      }
    },
  );

  hasScope(ctx.scopes, 'brain:write') && server.registerTool(
    'brain_documents_update',
    {
      title: 'Update a Brain document (metadata only)',
      description: 'Patch document-level metadata (title, category, ownerId, confidentialityLevel, defaultTopicIds). Status changes are REJECTED here — use brain_documents_publish / brain_documents_archive / brain_documents_unarchive. Returns a structured { error: "use_publish_or_archive" } if the patch attempts a status change. Echoes { id, updatedFields }.',
      inputSchema: {
        id: z.number().int().positive(),
        patch: z.object({
          title: z.string().min(1).max(255).optional(),
          category: z.enum(DOCUMENT_CATEGORIES).optional(),
          ownerId: z.number().int().positive().nullable().optional(),
          confidentialityLevel: z.enum(CONFIDENTIALITY_LEVELS).optional(),
          defaultTopicIds: z.array(z.number().int().positive()).optional(),
          status: z.enum(DOCUMENT_STATUSES).optional(),
        }),
      },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:write')) return denied('brain:write');
      try {
        const updated = await updateDocument(clientId, ctx.userId, args.id, {
          title: args.patch.title,
          category: args.patch.category as BrainDocumentCategory | undefined,
          ownerId: args.patch.ownerId,
          confidentialityLevel: args.patch.confidentialityLevel,
          defaultTopicIds: args.patch.defaultTopicIds,
          status: args.patch.status as BrainDocumentStatus | undefined,
        });
        if (!updated) return err('Document not found.');
        const updatedFields = Object.keys(args.patch).filter(
          (k) => k !== 'status' && (args.patch as Record<string, unknown>)[k] !== undefined,
        );
        return json({ id: updated.id, updatedFields });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg.includes('publishDocument') || msg.includes('archiveDocument')) {
          return json({
            error: 'use_publish_or_archive',
            message: 'Status changes go through brain_documents_publish, brain_documents_archive, or brain_documents_unarchive.',
          });
        }
        return err(msg || 'Failed to update document.');
      }
    },
  );

  hasScope(ctx.scopes, 'brain:write') && server.registerTool(
    'brain_document_versions_edit_draft',
    {
      title: 'Edit the current draft version of a Brain document',
      description: 'Patch the document\'s draft body / summary / changeNotes. If no draft exists (last action was a publish), creates a new draft seeded from the latest version\'s body — so editors don\'t lose context. Refuses if the document is archived. Echo: { documentId, versionId, versionNumber, isDraft: true }.',
      inputSchema: {
        documentId: z.number().int().positive(),
        patch: z.object({
          body: z.string().optional(),
          summary: z.string().nullable().optional(),
          changeNotes: z.string().nullable().optional(),
        }),
      },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:write')) return denied('brain:write');
      try {
        const out = await editDraftVersion(clientId, ctx.userId, args.documentId, {
          body: args.patch.body,
          summary: args.patch.summary,
          changeNotes: args.patch.changeNotes,
        });
        if (!out) return err('Document not found.');
        return json({
          documentId: args.documentId,
          versionId: out.version.id,
          versionNumber: out.version.versionNumber,
          isDraft: true,
        });
      } catch (e) {
        return err(e instanceof Error ? e.message : 'Failed to edit draft version.');
      }
    },
  );

  hasScope(ctx.scopes, 'brain:write') && server.registerTool(
    'brain_documents_publish',
    {
      title: 'Publish the current draft of a Brain document',
      description: 'Flip the current draft to a published version, atomically updating the document\'s currentPublishedVersionId + status="published" + publishedAt (first-publish only). Refuses if no draft exists OR if the draft body is empty — call brain_document_versions_edit_draft first. On empty body, returns structured { error: "empty_draft_body" }. Echo: { id, versionId, versionNumber, status: "published", publishedAt }.',
      inputSchema: {
        id: z.number().int().positive(),
      },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:write')) return denied('brain:write');
      try {
        const out = await publishDocument(clientId, ctx.userId, args.id);
        if (!out) return err('Document not found.');
        return json({
          id: out.document.id,
          versionId: out.version.id,
          versionNumber: out.version.versionNumber,
          status: out.document.status,
          publishedAt: out.document.publishedAt,
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg.includes('empty body')) {
          return json({
            error: 'empty_draft_body',
            message: 'Cannot publish an empty draft. Call brain_document_versions_edit_draft to add content first.',
          });
        }
        return err(msg || 'Failed to publish document.');
      }
    },
  );

  hasScope(ctx.scopes, 'brain:write') && server.registerTool(
    'brain_documents_archive',
    {
      title: 'Archive a Brain document',
      description: 'Soft cancellation — sets status="archived", archivedAt=now(), archiveReason=reason. Document remains in the database (cascade-deletion happens only on brain_documents_delete). Echo: { id, status: "archived", archivedAt }.',
      inputSchema: {
        id: z.number().int().positive(),
        reason: z.string().max(2000).optional(),
      },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:write')) return denied('brain:write');
      try {
        const out = await archiveDocument(clientId, ctx.userId, args.id, {
          reason: args.reason,
        });
        if (!out) return err('Document not found.');
        return json({
          id: out.id,
          status: out.status,
          archivedAt: out.archivedAt,
        });
      } catch (e) {
        return err(e instanceof Error ? e.message : 'Failed to archive document.');
      }
    },
  );

  hasScope(ctx.scopes, 'brain:write') && server.registerTool(
    'brain_documents_unarchive',
    {
      title: 'Unarchive a Brain document',
      description: 'Reverse archive: clears archivedAt + archiveReason and restores status to "published" (if a published version exists) or "draft" otherwise. Echo: { id, status }.',
      inputSchema: {
        id: z.number().int().positive(),
      },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:write')) return denied('brain:write');
      try {
        const out = await unarchiveDocument(clientId, ctx.userId, args.id);
        if (!out) return err('Document not found.');
        return json({ id: out.id, status: out.status });
      } catch (e) {
        return err(e instanceof Error ? e.message : 'Failed to unarchive document.');
      }
    },
  );

  hasScope(ctx.scopes, 'brain:write') && server.registerTool(
    'brain_documents_delete',
    {
      title: 'Delete a Brain document (hard)',
      description: 'Hard delete the document and (via FK cascade) every version, required-read, link, and acknowledgment. Refuses by default if any acknowledgments exist — history preservation matters more than tidiness. Pass force=true to cascade. Returns structured { error: "document_has_acks", ackCount } on conflict. Echo on success: { id, deleted: true }.',
      inputSchema: {
        id: z.number().int().positive(),
        force: z.boolean().optional(),
      },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:write')) return denied('brain:write');
      const out = await deleteDocument(clientId, ctx.userId, args.id, { force: args.force });
      if (!out.deleted) {
        if (out.refused) {
          return json({
            error: 'document_has_acks',
            ackCount: out.ackCount,
            message: 'Document has acknowledgments. Pass force=true to cascade-delete the audit trail.',
          });
        }
        return err('Document not found.');
      }
      return json({ id: args.id, deleted: true });
    },
  );

  hasScope(ctx.scopes, 'brain:write') && server.registerTool(
    'brain_documents_promote_from_note',
    {
      title: 'Promote a Brain note into a Brain document',
      description: 'Create a new document seeded from an existing brain_note — the note\'s body becomes the v1 draft\'s body. Title defaults to the note\'s title (or first non-empty line of the body). The document\'s sourceNoteId points back to the original. Echo: { documentId, slug, version1Id }.',
      inputSchema: {
        noteId: z.number().int().positive(),
        title: z.string().min(1).max(255).optional(),
        category: z.enum(DOCUMENT_CATEGORIES).optional(),
      },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:write')) return denied('brain:write');
      try {
        const out = await promoteFromNote(clientId, ctx.userId, args.noteId, {
          title: args.title,
          category: args.category as BrainDocumentCategory | undefined,
        });
        if (!out) return err('Note not found.');
        return json({
          documentId: out.document.id,
          slug: out.document.slug,
          version1Id: out.version.id,
        });
      } catch (e) {
        return err(e instanceof Error ? e.message : 'Failed to promote note to document.');
      }
    },
  );

  hasScope(ctx.scopes, 'brain:write') && server.registerTool(
    'brain_documents_link',
    {
      title: 'Link an entity to a Brain document',
      description: 'Attach a polymorphic entity (topic, initiative, decision, meeting, glossary_term, person) to a document. Idempotent — re-posting the same (documentId, entityType, entityId) returns alreadyLinked=true with linkId=null. Echo: { linkId, alreadyLinked }.',
      inputSchema: {
        documentId: z.number().int().positive(),
        entityType: z.enum(DOCUMENT_LINK_ENTITY_TYPES),
        entityId: z.number().int().positive(),
        note: z.string().nullable().optional(),
      },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:write')) return denied('brain:write');
      try {
        const out = await linkDocumentEntity(clientId, ctx.userId, {
          documentId: args.documentId,
          entityType: args.entityType as BrainDocumentLinkEntityType,
          entityId: args.entityId,
          note: args.note ?? null,
        });
        return json({ linkId: out.linkId, alreadyLinked: out.alreadyLinked });
      } catch (e) {
        return err(e instanceof Error ? e.message : 'Failed to link entity to document.');
      }
    },
  );

  hasScope(ctx.scopes, 'brain:write') && server.registerTool(
    'brain_documents_unlink',
    {
      title: 'Unlink an entity from a Brain document',
      description: 'Remove a polymorphic (documentId, entityType, entityId) link. Echo: { removed: boolean } — false if no matching link existed.',
      inputSchema: {
        documentId: z.number().int().positive(),
        entityType: z.enum(DOCUMENT_LINK_ENTITY_TYPES),
        entityId: z.number().int().positive(),
      },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:write')) return denied('brain:write');
      try {
        const removed = await unlinkDocumentEntity(clientId, ctx.userId, {
          documentId: args.documentId,
          entityType: args.entityType as BrainDocumentLinkEntityType,
          entityId: args.entityId,
        });
        return json({ removed });
      } catch (e) {
        return err(e instanceof Error ? e.message : 'Failed to unlink entity from document.');
      }
    },
  );

  hasScope(ctx.scopes, 'brain:write') && server.registerTool(
    'brain_document_required_reads_assign',
    {
      title: 'Assign a required-read on a Brain document',
      description: 'Make a person OR an org_unit required to read this document. Idempotent on (documentId, targetType, targetId) — re-assigning updates pinnedVersionId + dueAt. When targetType="org_unit" and expandOrgUnit=true, fans out to one row per ACTIVE member of the unit (current snapshot — new members later still need a re-assign). Echo: { assigned, alreadyAssigned, expandedTo? }.',
      inputSchema: {
        documentId: z.number().int().positive(),
        targetType: z.enum(DOCUMENT_REQUIRED_READ_TARGETS),
        targetId: z.number().int().positive(),
        pinnedVersionId: z.number().int().positive().nullable().optional(),
        dueAt: z.string().nullable().optional(),
        expandOrgUnit: z.boolean().optional(),
      },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:write')) return denied('brain:write');
      try {
        const out = await assignRequiredRead(clientId, ctx.userId, {
          documentId: args.documentId,
          targetType: args.targetType as BrainDocumentRequiredReadTarget,
          targetId: args.targetId,
          pinnedVersionId: args.pinnedVersionId ?? null,
          dueAt: args.dueAt ? new Date(args.dueAt) : null,
          expandOrgUnit: args.expandOrgUnit,
        });
        return json({
          assigned: out.assigned,
          alreadyAssigned: out.alreadyAssigned,
          ...(out.expandedTo !== undefined ? { expandedTo: out.expandedTo } : {}),
        });
      } catch (e) {
        return err(e instanceof Error ? e.message : 'Failed to assign required read.');
      }
    },
  );

  hasScope(ctx.scopes, 'brain:write') && server.registerTool(
    'brain_document_required_reads_remove',
    {
      title: 'Remove a required-read on a Brain document',
      description: 'Delete a required-read row. Default refuses if any acknowledgments reference it (history-preservation) — returns structured { error: "has_acks" }. Pass force=true to unlink (the FK is set-null, so the acks survive but lose their requiredReadId pointer). Echo on success: { removed: true }.',
      inputSchema: {
        requiredReadId: z.number().int().positive(),
        force: z.boolean().optional(),
      },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:write')) return denied('brain:write');
      const out = await removeRequiredRead(clientId, ctx.userId, args.requiredReadId, {
        force: args.force,
      });
      if (!out.removed) {
        if (out.reason === 'not_found') return err('Required-read not found.');
        if (out.reason === 'has_acks') {
          return json({
            error: 'has_acks',
            message: 'Required-read has acknowledgments. Pass force=true to detach (the acks will survive).',
          });
        }
        return err('Failed to remove required read.');
      }
      return json({ removed: true });
    },
  );

  hasScope(ctx.scopes, 'brain:write') && server.registerTool(
    'brain_documents_acknowledge',
    {
      title: 'Acknowledge a Brain document version',
      description: 'Record a (documentId, versionId, personId) acknowledgment. Idempotent — re-acking the same tuple returns the existing row without a duplicate audit entry. If requiredReadId is omitted, auto-links to a matching person-target required-read for this (documentId, personId) when one exists. Echo: { ackId, documentId, versionId, personId, acknowledgedAt }.',
      inputSchema: {
        documentId: z.number().int().positive(),
        versionId: z.number().int().positive(),
        personId: z.number().int().positive(),
        acknowledgmentNote: z.string().max(10_000).nullable().optional(),
        requiredReadId: z.number().int().positive().nullable().optional(),
      },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:write')) return denied('brain:write');
      try {
        const ack = await acknowledgeDocument(clientId, ctx.userId, {
          documentId: args.documentId,
          versionId: args.versionId,
          personId: args.personId,
          acknowledgmentNote: args.acknowledgmentNote ?? null,
          requiredReadId: args.requiredReadId ?? null,
        });
        return json({
          ackId: ack.id,
          documentId: ack.documentId,
          versionId: ack.versionId,
          personId: ack.personId,
          acknowledgedAt: ack.acknowledgedAt,
        });
      } catch (e) {
        return err(e instanceof Error ? e.message : 'Failed to acknowledge document.');
      }
    },
  );
}
