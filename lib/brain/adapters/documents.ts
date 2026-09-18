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


export function registerBrainDocumentsTools(server: McpServer, ctx: PortalMcpContext, clientId: number) {
  // ── DOCUMENTS — merged from feat/brain-documents ─────────────────────────

  hasScope(ctx.scopes, 'brain:read') && server.registerTool(
    'brain_documents_list',
    {
      title: 'List Brain documents',
      description: 'List versioned SOPs / policies / required-reads. Slim by default — returns { id, title, slug, category, status, ownerId, currentPublishedVersionId, publishedAt, versionCount, requiredReadCount, ackCount } per row. Pass `include: ["body"]` to hydrate each row with the current published version\'s body (heavy, opt in). Filters: status, category, ownerId, search. Cap limit 100.',
      inputSchema: {
        status: z.enum(DOCUMENT_STATUSES).optional(),
        category: z.enum(DOCUMENT_CATEGORIES).optional(),
        ownerId: z.number().int().positive().optional(),
        search: z.string().max(500).optional(),
        limit: z.number().int().min(1).max(100).optional(),
        offset: z.number().int().min(0).optional(),
        include: z.array(z.enum(['body'])).optional(),
      },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:read')) return denied('brain:read');
      const items = await listDocuments(clientId, {
        status: args.status as BrainDocumentStatus | undefined,
        category: args.category as BrainDocumentCategory | undefined,
        ownerId: args.ownerId,
        search: args.search,
        limit: args.limit,
        offset: args.offset,
      });
      const include = new Set(args.include ?? []);
      if (!include.has('body')) {
        return json({ items, limit: args.limit ?? 50, offset: args.offset ?? 0 });
      }
      // Heavy include — batch fetch each row's current published version body.
      const versionIds = items
        .map((r) => r.currentPublishedVersionId)
        .filter((v): v is number => v !== null);
      const bodies = versionIds.length > 0
        ? await db
          .select({
            id: brainDocumentVersions.id,
            body: brainDocumentVersions.body,
          })
          .from(brainDocumentVersions)
          .where(and(
            eq(brainDocumentVersions.clientId, clientId),
            inArray(brainDocumentVersions.id, versionIds),
          ))
        : [];
      const bodyById = new Map(bodies.map((b) => [b.id, b.body]));
      const hydrated = items.map((r) => ({
        ...r,
        body: r.currentPublishedVersionId !== null ? bodyById.get(r.currentPublishedVersionId) ?? null : null,
      }));
      return json({ items: hydrated, limit: args.limit ?? 50, offset: args.offset ?? 0 });
    },
  );

  hasScope(ctx.scopes, 'brain:read') && server.registerTool(
    'brain_documents_get',
    {
      title: 'Get a Brain document',
      description: 'Fetch a single document + its slim version list + resolved links. Heavy fields are opt-in: pass `includeBody=true` to attach `currentPublishedVersion` and `currentDraftVersion` full rows (each carries the markdown body); pass `includeAllVersions=true` to attach every version\'s full row in `versions` (can be very large). Without either, you get { document, versions (slim: id/versionNumber/isDraft/publishedAt/title), links }.',
      inputSchema: {
        id: z.number().int().positive(),
        includeBody: z.boolean().optional(),
        includeAllVersions: z.boolean().optional(),
      },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:read')) return denied('brain:read');
      const detail = await getDocumentById(clientId, args.id, {
        includeBody: args.includeBody,
        includeAllVersions: args.includeAllVersions,
      });
      if (!detail) return err('Document not found.');
      return json({
        document: detail.document,
        currentPublishedVersion: detail.currentPublishedVersion ?? null,
        currentDraftVersion: detail.currentDraftVersion ?? null,
        versions: detail.versions,
        ...(detail.allVersions ? { allVersions: detail.allVersions } : {}),
        links: detail.links,
      });
    },
  );

  hasScope(ctx.scopes, 'brain:read') && server.registerTool(
    'brain_document_versions_list',
    {
      title: 'List versions of a Brain document',
      description: 'List a document\'s versions (newest first). Slim by default — returns { id, versionNumber, isDraft, publishedAt, title }. Pass `include: ["body"]` to attach the full markdown body per row (heavy); `["changeNotes"]` to attach the per-version change log; `["summary"]` to attach the optional executive summary. Cap limit 100.',
      inputSchema: {
        documentId: z.number().int().positive(),
        limit: z.number().int().min(1).max(100).optional(),
        offset: z.number().int().min(0).optional(),
        include: z.array(z.enum(['body', 'changeNotes', 'summary'])).optional(),
      },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:read')) return denied('brain:read');
      // Tenant-scope check via the lib helper.
      const detail = await getDocumentById(clientId, args.documentId, {});
      if (!detail) return err('Document not found.');
      const limit = args.limit !== undefined ? Math.max(1, Math.min(args.limit, 100)) : 50;
      const offset = args.offset !== undefined ? Math.max(0, args.offset) : 0;
      const include = new Set(args.include ?? []);
      const wantBody = include.has('body');
      const wantNotes = include.has('changeNotes');
      const wantSummary = include.has('summary');

      const rows = await db
        .select({
          id: brainDocumentVersions.id,
          versionNumber: brainDocumentVersions.versionNumber,
          isDraft: brainDocumentVersions.isDraft,
          publishedAt: brainDocumentVersions.publishedAt,
          title: brainDocumentVersions.title,
          body: brainDocumentVersions.body,
          changeNotes: brainDocumentVersions.changeNotes,
          summary: brainDocumentVersions.summary,
        })
        .from(brainDocumentVersions)
        .where(and(
          eq(brainDocumentVersions.documentId, args.documentId),
          eq(brainDocumentVersions.clientId, clientId),
        ))
        .orderBy(desc(brainDocumentVersions.versionNumber))
        .limit(limit)
        .offset(offset);

      const items = rows.map((r) => ({
        id: r.id,
        versionNumber: r.versionNumber,
        isDraft: r.isDraft,
        publishedAt: r.publishedAt,
        title: r.title,
        ...(wantBody ? { body: r.body } : {}),
        ...(wantNotes ? { changeNotes: r.changeNotes } : {}),
        ...(wantSummary ? { summary: r.summary } : {}),
      }));
      return json({ items, limit, offset });
    },
  );

  hasScope(ctx.scopes, 'brain:read') && server.registerTool(
    'brain_document_versions_get',
    {
      title: 'Get a Brain document version',
      description: 'Fetch one specific version of a document — the caller asked for THIS version, so the full markdown `body` ships by default. Pass `include: ["changeNotes"]` or `["summary"]` to attach those extra fields too.',
      inputSchema: {
        versionId: z.number().int().positive(),
        include: z.array(z.enum(['changeNotes', 'summary'])).optional(),
      },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:read')) return denied('brain:read');
      const [row] = await db
        .select()
        .from(brainDocumentVersions)
        .where(and(
          eq(brainDocumentVersions.id, args.versionId),
          eq(brainDocumentVersions.clientId, clientId),
        ))
        .limit(1);
      if (!row) return err('Document version not found.');
      const include = new Set(args.include ?? []);
      return json({
        id: row.id,
        documentId: row.documentId,
        versionNumber: row.versionNumber,
        isDraft: row.isDraft,
        publishedAt: row.publishedAt,
        publishedBy: row.publishedBy,
        title: row.title,
        body: row.body,
        createdBy: row.createdBy,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        ...(include.has('changeNotes') ? { changeNotes: row.changeNotes } : {}),
        ...(include.has('summary') ? { summary: row.summary } : {}),
      });
    },
  );

  hasScope(ctx.scopes, 'brain:read') && server.registerTool(
    'brain_document_required_reads_list_for_document',
    {
      title: 'List required-reads on a Brain document',
      description: 'Who is REQUIRED to read this document? Returns rows { id, targetType, targetId, targetName (resolved from brain_people.fullName or brain_org_units.name), pinnedVersionId, dueAt, assignedAt }. Filter by targetType to view only person- or only org_unit-scoped assignments. Cap limit 100.',
      inputSchema: {
        documentId: z.number().int().positive(),
        targetType: z.enum(DOCUMENT_REQUIRED_READ_TARGETS).optional(),
        limit: z.number().int().min(1).max(100).optional(),
        offset: z.number().int().min(0).optional(),
      },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:read')) return denied('brain:read');
      const items = await listRequiredReadsForDocument(clientId, args.documentId, {
        targetType: args.targetType as BrainDocumentRequiredReadTarget | undefined,
        limit: args.limit,
        offset: args.offset,
      });
      return json({ items, limit: args.limit ?? 100, offset: args.offset ?? 0 });
    },
  );

  hasScope(ctx.scopes, 'brain:read') && server.registerTool(
    'brain_document_required_reads_list_for_person',
    {
      title: 'List a person\'s required-read queue',
      description: 'What does THIS person have to read? Returns the person\'s direct required-read assignments with each row\'s acknowledged status, the version they actually need to ack (pinned or the doc\'s currentPublishedVersionId), and an `ackId`/`acknowledgedAt` when present. `status` filters: `open` = unacknowledged, `acknowledged` = already done, `all` = both (default). Org-unit-scoped assignments NOT expanded — use brain_document_compliance_report for that view.',
      inputSchema: {
        personId: z.number().int().positive(),
        status: z.enum(['open', 'acknowledged', 'all']).optional(),
        limit: z.number().int().min(1).max(100).optional(),
        offset: z.number().int().min(0).optional(),
      },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:read')) return denied('brain:read');
      const items = await listRequiredReadsForPerson(clientId, args.personId, {
        status: args.status,
        limit: args.limit,
        offset: args.offset,
      });
      return json({ items, limit: args.limit ?? 100, offset: args.offset ?? 0 });
    },
  );

  hasScope(ctx.scopes, 'brain:read') && server.registerTool(
    'brain_document_acknowledgments_list_for_document',
    {
      title: 'List acknowledgments for a Brain document',
      description: 'Audit trail — every (version, person, acknowledgedAt) recorded against this document. Optional filters by versionId or personId. Returns slim rows { ackId, versionId, versionNumber, personId, personName, acknowledgedAt, acknowledgmentNote }. Cap limit 100.',
      inputSchema: {
        documentId: z.number().int().positive(),
        versionId: z.number().int().positive().optional(),
        personId: z.number().int().positive().optional(),
        limit: z.number().int().min(1).max(100).optional(),
        offset: z.number().int().min(0).optional(),
      },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:read')) return denied('brain:read');
      const items = await listAcknowledgmentsForDocument(clientId, args.documentId, {
        versionId: args.versionId,
        personId: args.personId,
        limit: args.limit,
        offset: args.offset,
      });
      return json({ items, limit: args.limit ?? 100, offset: args.offset ?? 0 });
    },
  );

  hasScope(ctx.scopes, 'brain:read') && server.registerTool(
    'brain_document_acknowledgments_list_for_person',
    {
      title: 'List acknowledgments by a person',
      description: 'Every document this person has acknowledged, newest first. Returns { ackId, documentId, documentTitle, versionNumber, acknowledgedAt } per row. Cap limit 100.',
      inputSchema: {
        personId: z.number().int().positive(),
        limit: z.number().int().min(1).max(100).optional(),
        offset: z.number().int().min(0).optional(),
      },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:read')) return denied('brain:read');
      const items = await listAcknowledgmentsForPerson(clientId, args.personId, {
        limit: args.limit,
        offset: args.offset,
      });
      return json({ items, limit: args.limit ?? 100, offset: args.offset ?? 0 });
    },
  );

  hasScope(ctx.scopes, 'brain:read') && server.registerTool(
    'brain_document_compliance_report',
    {
      title: 'Compliance report for a Brain document',
      description: 'The canonical "who has read this, who hasn\'t" view. Expands org-unit required-reads to active member person ids, partitions the assigned-person universe into acknowledged / pending / overdue against the document\'s currentPublishedVersionId, and returns full id arrays + a summary count rollup. A document with no current published version yields acknowledged=0 (nothing to ack against yet).',
      inputSchema: {
        documentId: z.number().int().positive(),
      },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:read')) return denied('brain:read');
      const report = await complianceReport(clientId, args.documentId);
      if (!report) return err('Document not found.');
      return json(report);
    },
  );
}
