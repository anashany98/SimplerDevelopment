/**
 * Brain MCP adapter — initiatives & goals
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


export function registerBrainInitiativesGoalsTools(server: McpServer, ctx: PortalMcpContext, clientId: number) {
  // ── READ — initiatives ──────────────────────────────────────────────────
  //
  // Initiatives are the multi-quarter umbrella under which goals, tasks,
  // notes, meetings, decisions, topics, and CRM links hang. Token-budget
  // rules: list/tree responses default slim (no description / lessonsLearned);
  // heavy fields are opt-in via the `include` flag.

  hasScope(ctx.scopes, 'brain:read') && server.registerTool(
    'brain_initiatives_list',
    {
      title: 'List Brain initiatives',
      description: 'List initiatives for this tenant. Slim by default — returns { id, name, slug, status, priority, ownerId, targetDate, goalCount } per row. Pass `include: ["description"]` or `["lessonsLearned"]` to opt into heavier text fields. Filters: status, ownerId, priority, hasOpenGoals, targetDateBefore (ISO).',
      inputSchema: {
        status: z.enum(['planned', 'active', 'paused', 'completed', 'cancelled']).optional(),
        ownerId: z.number().int().positive().optional(),
        priority: z.enum(['low', 'medium', 'high', 'critical']).optional(),
        hasOpenGoals: z.boolean().optional(),
        targetDateBefore: z.string().optional().describe('ISO date — return only initiatives whose targetDate is before this.'),
        limit: z.number().int().min(1).max(100).optional(),
        offset: z.number().int().min(0).optional(),
        include: z.array(z.enum(['description', 'lessonsLearned'])).optional(),
      },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:read')) return denied('brain:read');
      const rows = await listInitiatives(clientId, {
        status: args.status,
        ownerId: args.ownerId,
        priority: args.priority,
        hasOpenGoals: args.hasOpenGoals,
        targetDateBefore: args.targetDateBefore ? new Date(args.targetDateBefore) : undefined,
        limit: args.limit,
        offset: args.offset,
      });
      const include = new Set(args.include ?? []);
      const items = rows.map((r) => ({
        id: r.id,
        name: r.name,
        slug: r.slug,
        status: r.status,
        priority: r.priority,
        ownerId: r.ownerId,
        targetDate: r.targetDate ? r.targetDate.toISOString() : null,
        goalCount: r.goalCount,
        ...(include.has('description') ? { description: r.description } : {}),
        ...(include.has('lessonsLearned') ? { lessonsLearned: r.lessonsLearned } : {}),
      }));
      return json({ items, limit: args.limit ?? 50, offset: args.offset ?? 0 });
    },
  );

  hasScope(ctx.scopes, 'brain:read') && server.registerTool(
    'brain_initiatives_get',
    {
      title: 'Get a Brain initiative',
      description: 'Get one initiative by id. Pass `includeGoals=true` to inline ordered goals, `includeLinks=true` to inline resolved linked-entity rows (also returns byType counts when present). Heavy text fields (description, lessonsLearned) are opt-in via `include`.',
      inputSchema: {
        id: z.number().int().positive(),
        includeGoals: z.boolean().optional(),
        includeLinks: z.boolean().optional(),
        include: z.array(z.enum(['description', 'lessonsLearned'])).optional(),
      },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:read')) return denied('brain:read');
      const detail = await getInitiativeById(clientId, args.id, {
        includeGoals: args.includeGoals,
        includeLinks: args.includeLinks,
      });
      if (!detail) return err('Initiative not found.');
      const include = new Set(args.include ?? []);
      const i = detail.initiative;
      const initiative: Record<string, unknown> = {
        id: i.id,
        name: i.name,
        slug: i.slug,
        status: i.status,
        priority: i.priority,
        ownerId: i.ownerId,
        sponsorId: i.sponsorId,
        startDate: i.startDate ? i.startDate.toISOString() : null,
        targetDate: i.targetDate ? i.targetDate.toISOString() : null,
        closedAt: i.closedAt ? i.closedAt.toISOString() : null,
        closeReason: i.closeReason,
        confidentialityLevel: i.confidentialityLevel,
        createdBy: i.createdBy,
        createdAt: i.createdAt.toISOString(),
        updatedAt: i.updatedAt.toISOString(),
      };
      if (include.has('description')) initiative.description = i.description;
      if (include.has('lessonsLearned')) initiative.lessonsLearned = i.lessonsLearned;

      const out: Record<string, unknown> = { initiative };
      if (detail.goals) {
        // Slim goal projection for embedded list; full goal via brain_goals_get.
        out.goals = detail.goals.map((g) => ({
          id: g.id,
          title: g.title,
          status: g.status,
          ownerId: g.ownerId,
          targetDate: g.targetDate ? g.targetDate.toISOString() : null,
          sortOrder: g.sortOrder,
          currentMetric: g.currentMetric,
          targetMetric: g.targetMetric,
          unit: g.unit,
        }));
      }
      if (detail.links) {
        out.links = {
          byType: detail.links.byType,
          ...(detail.links.items ? {
            items: detail.links.items.map((l) => ({
              entityType: l.entityType,
              entityId: l.entityId,
              title: l.title,
              pinned: l.pinned,
              note: l.note,
            })),
          } : {}),
        };
      }
      return json(out);
    },
  );

  hasScope(ctx.scopes, 'brain:read') && server.registerTool(
    'brain_initiatives_links',
    {
      title: 'List entities linked to a Brain initiative',
      description: 'List the polymorphic entities (tasks, notes, meetings, decisions, topics, CRM deals, CRM companies) linked to an initiative. Returns resolved display rows + { total, byType counts }.',
      inputSchema: {
        id: z.number().int().positive(),
        entityType: z.enum(['task', 'note', 'meeting', 'decision', 'topic', 'crm_deal', 'crm_company']).optional(),
        limit: z.number().int().min(1).max(100).optional(),
        offset: z.number().int().min(0).optional(),
      },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:read')) return denied('brain:read');
      const rows = await listInitiativeLinks(clientId, args.id, {
        entityType: args.entityType,
        limit: args.limit,
        offset: args.offset,
      });
      const items = rows.map((r) => ({
        entityType: r.entityType,
        entityId: r.entityId,
        title: r.title,
        pinned: r.pinned,
        note: r.note,
      }));
      const byType: Record<string, number> = {};
      for (const it of items) byType[it.entityType] = (byType[it.entityType] ?? 0) + 1;
      return json({ items, total: items.length, byType });
    },
  );

  // ── READ — goals ────────────────────────────────────────────────────────

  hasScope(ctx.scopes, 'brain:read') && server.registerTool(
    'brain_goals_list',
    {
      title: 'List Brain goals',
      description: 'List goals for this tenant. Slim by default — returns { id, initiativeId, title, status, ownerId, targetDate, sortOrder, currentMetric, targetMetric, unit } per row. Pass `include: ["description"]` or `["lastProgressNote"]` to opt into heavier text fields.',
      inputSchema: {
        initiativeId: z.number().int().positive().optional(),
        status: z.enum(['open', 'on_track', 'at_risk', 'off_track', 'achieved', 'missed']).optional(),
        ownerId: z.number().int().positive().optional(),
        limit: z.number().int().min(1).max(100).optional(),
        offset: z.number().int().min(0).optional(),
        include: z.array(z.enum(['description', 'lastProgressNote'])).optional(),
      },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:read')) return denied('brain:read');
      const rows = await listGoals(clientId, {
        initiativeId: args.initiativeId,
        status: args.status,
        ownerId: args.ownerId,
        limit: args.limit,
        offset: args.offset,
      });
      const include = new Set(args.include ?? []);
      const items = rows.map((g) => ({
        id: g.id,
        initiativeId: g.initiativeId,
        title: g.title,
        status: g.status,
        ownerId: g.ownerId,
        targetDate: g.targetDate ? g.targetDate.toISOString() : null,
        sortOrder: g.sortOrder,
        currentMetric: g.currentMetric,
        targetMetric: g.targetMetric,
        unit: g.unit,
        ...(include.has('description') ? { description: g.description } : {}),
        ...(include.has('lastProgressNote') ? { lastProgressNote: g.lastProgressNote } : {}),
      }));
      return json({ items, limit: args.limit ?? 100, offset: args.offset ?? 0 });
    },
  );

  hasScope(ctx.scopes, 'brain:read') && server.registerTool(
    'brain_goals_get',
    {
      title: 'Get a Brain goal',
      description: 'Get one goal by id with a slim parent-initiative reference ({ id, name, slug, status }). Heavy text fields (description, lastProgressNote) are opt-in via `include`.',
      inputSchema: {
        id: z.number().int().positive(),
        include: z.array(z.enum(['description', 'lastProgressNote'])).optional(),
      },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:read')) return denied('brain:read');
      const detail = await getGoalById(clientId, args.id);
      if (!detail) return err('Goal not found.');
      const include = new Set(args.include ?? []);
      const g = detail.goal;
      const goal: Record<string, unknown> = {
        id: g.id,
        initiativeId: g.initiativeId,
        title: g.title,
        status: g.status,
        ownerId: g.ownerId,
        unit: g.unit,
        targetMetric: g.targetMetric,
        currentMetric: g.currentMetric,
        targetDate: g.targetDate ? g.targetDate.toISOString() : null,
        sortOrder: g.sortOrder,
        lastCheckedInAt: g.lastCheckedInAt ? g.lastCheckedInAt.toISOString() : null,
        createdBy: g.createdBy,
        createdAt: g.createdAt.toISOString(),
        updatedAt: g.updatedAt.toISOString(),
      };
      if (include.has('description')) goal.description = g.description;
      if (include.has('lastProgressNote')) goal.lastProgressNote = g.lastProgressNote;
      return json({
        goal,
        initiative: detail.initiative
          ? {
              id: detail.initiative.initiativeId,
              name: detail.initiative.name,
              slug: detail.initiative.slug,
              status: detail.initiative.status,
            }
          : null,
      });
    },
  );

  // ── WRITE — initiatives ────────────────────────────────────────────────

  hasScope(ctx.scopes, 'brain:write') && server.registerTool(
    'brain_initiatives_create',
    {
      title: 'Create a Brain initiative',
      description: 'Create a multi-quarter initiative. Echo: { id, slug, status } — re-fetch via brain_initiatives_get for the full row.',
      inputSchema: {
        name: z.string().min(1).max(255),
        description: z.string().nullable().optional(),
        status: z.enum(['planned', 'active', 'paused', 'completed', 'cancelled']).optional(),
        priority: z.enum(['low', 'medium', 'high', 'critical']).optional(),
        ownerId: z.number().int().positive().nullable().optional(),
        sponsorId: z.number().int().positive().nullable().optional(),
        startDate: z.string().nullable().optional(),
        targetDate: z.string().nullable().optional(),
        confidentialityLevel: z.enum(['standard', 'restricted', 'confidential']).optional(),
      },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:write')) return denied('brain:write');
      try {
        const created = await createInitiative(clientId, ctx.userId, {
          name: args.name,
          description: args.description ?? null,
          status: args.status,
          priority: args.priority,
          ownerId: args.ownerId ?? null,
          sponsorId: args.sponsorId ?? null,
          startDate: args.startDate ? new Date(args.startDate) : args.startDate === null ? null : undefined,
          targetDate: args.targetDate ? new Date(args.targetDate) : args.targetDate === null ? null : undefined,
          confidentialityLevel: args.confidentialityLevel,
        });
        return json({ id: created.id, slug: created.slug, status: created.status });
      } catch (e) {
        return err(e instanceof Error ? e.message : 'Failed to create initiative.');
      }
    },
  );

  hasScope(ctx.scopes, 'brain:write') && server.registerTool(
    'brain_initiatives_update',
    {
      title: 'Update a Brain initiative',
      description: 'Patch fields on an initiative. Status changes are NOT allowed here — use brain_initiatives_close or brain_initiatives_reopen. Echo: { id, updatedFields }. Returns a structured error { error: "use_close_or_reopen" } if a status change is attempted.',
      inputSchema: {
        id: z.number().int().positive(),
        patch: z.object({
          name: z.string().min(1).max(255).optional(),
          description: z.string().nullable().optional(),
          priority: z.enum(['low', 'medium', 'high', 'critical']).optional(),
          ownerId: z.number().int().positive().nullable().optional(),
          sponsorId: z.number().int().positive().nullable().optional(),
          startDate: z.string().nullable().optional(),
          targetDate: z.string().nullable().optional(),
          confidentialityLevel: z.enum(['standard', 'restricted', 'confidential']).optional(),
        }),
      },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:write')) return denied('brain:write');
      const p = args.patch;
      try {
        const updated = await updateInitiative(clientId, ctx.userId, args.id, {
          name: p.name,
          description: p.description,
          priority: p.priority,
          ownerId: p.ownerId,
          sponsorId: p.sponsorId,
          startDate: p.startDate ? new Date(p.startDate) : p.startDate === null ? null : undefined,
          targetDate: p.targetDate ? new Date(p.targetDate) : p.targetDate === null ? null : undefined,
          confidentialityLevel: p.confidentialityLevel,
        });
        if (!updated) return err('Initiative not found.');
        return json({ id: updated.id, updatedFields: Object.keys(p).filter((k) => (p as Record<string, unknown>)[k] !== undefined) });
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        if (message.includes('use closeInitiative or reopenInitiative')) {
          return json({ error: 'use_close_or_reopen', message });
        }
        return err(message || 'Failed to update initiative.');
      }
    },
  );

  hasScope(ctx.scopes, 'brain:write') && server.registerTool(
    'brain_initiatives_close',
    {
      title: 'Close a Brain initiative',
      description: 'Terminal status transition — outcome must be "completed" or "cancelled". Requires at least one of `reason` / `lessonsLearned`. If lessonsLearned is provided, a brain_note is auto-created with the text and pinned-linked back. Echo: { id, status, closedAt, noteId? }.',
      inputSchema: {
        id: z.number().int().positive(),
        outcome: z.enum(['completed', 'cancelled']),
        reason: z.string().max(2000).optional(),
        lessonsLearned: z.string().max(50_000).optional(),
      },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:write')) return denied('brain:write');
      try {
        const out = await closeInitiative(clientId, ctx.userId, args.id, {
          outcome: args.outcome,
          reason: args.reason,
          lessonsLearned: args.lessonsLearned,
        });
        if (!out) return err('Initiative not found.');
        return json({
          id: out.initiative.id,
          status: out.initiative.status,
          closedAt: out.initiative.closedAt ? out.initiative.closedAt.toISOString() : null,
          ...(out.lessonsLearnedNoteId !== null ? { noteId: out.lessonsLearnedNoteId } : {}),
        });
      } catch (e) {
        return err(e instanceof Error ? e.message : 'Failed to close initiative.');
      }
    },
  );

  hasScope(ctx.scopes, 'brain:write') && server.registerTool(
    'brain_initiatives_reopen',
    {
      title: 'Reopen a Brain initiative',
      description: 'Reopen a previously closed initiative — only allowed from `completed` or `cancelled`. Sets status="active" and clears closedAt. Echo: { id, status }. Returns a structured error { error: "non_terminal_status" } if the current status is not terminal.',
      inputSchema: {
        id: z.number().int().positive(),
      },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:write')) return denied('brain:write');
      try {
        const updated = await reopenInitiative(clientId, ctx.userId, args.id);
        if (!updated) return err('Initiative not found.');
        return json({ id: updated.id, status: updated.status });
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        if (message.includes('cannot reopen from non-terminal status')) {
          return json({ error: 'non_terminal_status', message });
        }
        return err(message || 'Failed to reopen initiative.');
      }
    },
  );

  hasScope(ctx.scopes, 'brain:write') && server.registerTool(
    'brain_initiatives_link',
    {
      title: 'Link an entity to a Brain initiative',
      description: 'Attach a polymorphic entity (task, note, meeting, decision, topic, crm_deal, crm_company, person, org_unit, glossary_term) to an initiative. Idempotent — re-posting the same (initiativeId, entityType, entityId) returns alreadyLinked=true with linkId=null. Echo: { linkId, alreadyLinked }.',
      inputSchema: {
        initiativeId: z.number().int().positive(),
        entityType: z.enum(['task', 'note', 'meeting', 'decision', 'topic', 'crm_deal', 'crm_company', 'person', 'org_unit', 'glossary_term']),
        entityId: z.number().int().positive(),
        note: z.string().nullable().optional(),
        pinned: z.boolean().optional(),
      },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:write')) return denied('brain:write');
      try {
        const out = await linkEntity(clientId, ctx.userId, {
          initiativeId: args.initiativeId,
          entityType: args.entityType,
          entityId: args.entityId,
          note: args.note ?? null,
          pinned: args.pinned,
        });
        return json({ linkId: out.linkId, alreadyLinked: out.alreadyLinked });
      } catch (e) {
        return err(e instanceof Error ? e.message : 'Failed to link entity.');
      }
    },
  );

  hasScope(ctx.scopes, 'brain:write') && server.registerTool(
    'brain_initiatives_unlink',
    {
      title: 'Unlink an entity from a Brain initiative',
      description: 'Remove a polymorphic link from an initiative. Echo: { removed: boolean } — false if no matching link existed.',
      inputSchema: {
        initiativeId: z.number().int().positive(),
        entityType: z.enum(['task', 'note', 'meeting', 'decision', 'topic', 'crm_deal', 'crm_company', 'person', 'org_unit', 'glossary_term']),
        entityId: z.number().int().positive(),
      },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:write')) return denied('brain:write');
      try {
        const removed = await unlinkEntity(clientId, ctx.userId, {
          initiativeId: args.initiativeId,
          entityType: args.entityType,
          entityId: args.entityId,
        });
        return json({ removed });
      } catch (e) {
        return err(e instanceof Error ? e.message : 'Failed to unlink entity.');
      }
    },
  );

  // ── WRITE — goals ───────────────────────────────────────────────────────

  hasScope(ctx.scopes, 'brain:write') && server.registerTool(
    'brain_goals_create',
    {
      title: 'Create a Brain goal',
      description: 'Create a goal under an existing initiative (must be in the same tenant). Echo: { id, status, initiativeId } — re-fetch via brain_goals_get for the full row.',
      inputSchema: {
        initiativeId: z.number().int().positive(),
        title: z.string().min(1).max(255),
        description: z.string().nullable().optional(),
        ownerId: z.number().int().positive().nullable().optional(),
        unit: z.string().max(30).nullable().optional(),
        targetMetric: z.number().int().nullable().optional(),
        currentMetric: z.number().int().nullable().optional(),
        targetDate: z.string().nullable().optional(),
        sortOrder: z.number().int().optional(),
        status: z.enum(['open', 'on_track', 'at_risk', 'off_track', 'achieved', 'missed']).optional(),
      },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:write')) return denied('brain:write');
      try {
        const created = await createGoal(clientId, ctx.userId, {
          initiativeId: args.initiativeId,
          title: args.title,
          description: args.description ?? null,
          ownerId: args.ownerId ?? null,
          unit: args.unit ?? null,
          targetMetric: args.targetMetric ?? null,
          currentMetric: args.currentMetric ?? null,
          targetDate: args.targetDate ? new Date(args.targetDate) : args.targetDate === null ? null : undefined,
          sortOrder: args.sortOrder,
          status: args.status,
        });
        return json({ id: created.id, status: created.status, initiativeId: created.initiativeId });
      } catch (e) {
        return err(e instanceof Error ? e.message : 'Failed to create goal.');
      }
    },
  );

  hasScope(ctx.scopes, 'brain:write') && server.registerTool(
    'brain_goals_update',
    {
      title: 'Update a Brain goal',
      description: 'Patch fields on a goal. Status changes are allowed here (unlike initiatives). Echo: { id, updatedFields }.',
      inputSchema: {
        id: z.number().int().positive(),
        patch: z.object({
          title: z.string().min(1).max(255).optional(),
          description: z.string().nullable().optional(),
          ownerId: z.number().int().positive().nullable().optional(),
          unit: z.string().max(30).nullable().optional(),
          targetMetric: z.number().int().nullable().optional(),
          currentMetric: z.number().int().nullable().optional(),
          targetDate: z.string().nullable().optional(),
          sortOrder: z.number().int().optional(),
          status: z.enum(['open', 'on_track', 'at_risk', 'off_track', 'achieved', 'missed']).optional(),
        }),
      },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:write')) return denied('brain:write');
      const p = args.patch;
      try {
        const updated = await updateGoal(clientId, ctx.userId, args.id, {
          title: p.title,
          description: p.description,
          ownerId: p.ownerId,
          unit: p.unit,
          targetMetric: p.targetMetric,
          currentMetric: p.currentMetric,
          targetDate: p.targetDate ? new Date(p.targetDate) : p.targetDate === null ? null : undefined,
          sortOrder: p.sortOrder,
          status: p.status,
        });
        if (!updated) return err('Goal not found.');
        return json({ id: updated.id, updatedFields: Object.keys(p).filter((k) => (p as Record<string, unknown>)[k] !== undefined) });
      } catch (e) {
        return err(e instanceof Error ? e.message : 'Failed to update goal.');
      }
    },
  );

  hasScope(ctx.scopes, 'brain:write') && server.registerTool(
    'brain_goals_checkin',
    {
      title: 'Check in on a Brain goal',
      description: 'Drop a progress check-in — updates currentMetric / lastProgressNote / lastCheckedInAt. When status is omitted but currentMetric is provided, the auto-classifier picks the new status. Not audit-logged (lastCheckedInAt is the breadcrumb). Echo: { id, status, currentMetric, lastCheckedInAt }.',
      inputSchema: {
        id: z.number().int().positive(),
        currentMetric: z.number().int().optional(),
        note: z.string().max(10_000).nullable().optional(),
        status: z.enum(['open', 'on_track', 'at_risk', 'off_track', 'achieved', 'missed']).optional(),
      },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:write')) return denied('brain:write');
      try {
        const updated = await checkinGoal(clientId, ctx.userId, args.id, {
          currentMetric: args.currentMetric,
          note: args.note,
          status: args.status,
        });
        if (!updated) return err('Goal not found.');
        return json({
          id: updated.id,
          status: updated.status,
          currentMetric: updated.currentMetric,
          lastCheckedInAt: updated.lastCheckedInAt ? updated.lastCheckedInAt.toISOString() : null,
        });
      } catch (e) {
        return err(e instanceof Error ? e.message : 'Failed to check in.');
      }
    },
  );

  hasScope(ctx.scopes, 'brain:write') && server.registerTool(
    'brain_goals_delete',
    {
      title: 'Delete a Brain goal',
      description: 'Hard-delete a goal (leaf row — no cascade impact). Echo: { id, deleted: true }.',
      inputSchema: {
        id: z.number().int().positive(),
      },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:write')) return denied('brain:write');
      try {
        const ok = await deleteGoal(clientId, ctx.userId, args.id);
        if (!ok) return err('Goal not found.');
        return json({ id: args.id, deleted: true });
      } catch (e) {
        return err(e instanceof Error ? e.message : 'Failed to delete goal.');
      }
    },
  );
}
