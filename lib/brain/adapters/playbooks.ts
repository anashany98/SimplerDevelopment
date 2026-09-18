/**
 * Brain MCP adapter — playbooks & runs
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
import { playbookLinkEntityTypeEnum } from './shared';

function absolutizeUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  return `${PORTAL_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`;
}


export function registerBrainPlaybooksTools(server: McpServer, ctx: PortalMcpContext, clientId: number) {
  // ── READ — playbooks (Wave 2c) ───────────────────────────────────────────

  const playbookStatusEnum = z.enum(['draft', 'active', 'archived']);
  const playbookTriggerKindEnum = z.enum(['manual', 'event', 'scheduled']);
  const playbookRunStatusEnum = z.enum(['pending', 'active', 'paused', 'completed', 'aborted', 'failed']);
  const playbookStepKindEnum = z.enum(['task', 'note', 'meeting', 'decision', 'review_item', 'wait', 'branch']);
  const playbookConditionOpEnum = z.enum(['eq', 'neq', 'in', 'not_in', 'exists', 'not_exists', 'gt', 'lt']);
  const playbookConditionSchema = z.object({
    field: z.string().min(1),
    op: playbookConditionOpEnum,
    value: z.unknown().optional(),
  }).nullable();
  const playbookListIncludeEnum = z.enum(['description', 'triggerConfig', 'defaultTopicIds']);
  const playbookGetIncludeEnum = z.enum(['description', 'stepConfigs']);
  const playbookRunGetIncludeEnum = z.enum(['context', 'triggerPayload']);

  hasScope(ctx.scopes, 'brain:read') && server.registerTool(
    'brain_playbooks_list',
    {
      title: 'List Brain playbooks',
      description: 'List multi-step playbooks for this tenant. Slim by default — returns { id, name, slug, status, category, triggerKind, ownerId, stepCount, activeRunCount } per row. Pass `include: ["description"]`, `["triggerConfig"]`, or `["defaultTopicIds"]` to opt into heavier fields. Filters: status, category, triggerKind, ownerId.',
      inputSchema: {
        status: z.union([playbookStatusEnum, z.array(playbookStatusEnum)]).optional(),
        category: z.string().max(100).optional(),
        triggerKind: z.union([playbookTriggerKindEnum, z.array(playbookTriggerKindEnum)]).optional(),
        ownerId: z.number().int().positive().optional(),
        limit: z.number().int().min(1).max(100).optional(),
        offset: z.number().int().min(0).optional(),
        include: z.array(playbookListIncludeEnum).optional(),
      },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:read')) return denied('brain:read');
      const rows = await listPlaybooks(clientId, {
        status: args.status,
        category: args.category,
        triggerKind: args.triggerKind,
        ownerId: args.ownerId,
        limit: args.limit,
        offset: args.offset,
      });
      const include = new Set(args.include ?? []);
      // Heavy fields require a second fetch — only if requested AND there are rows.
      let extraByPlaybook: Map<number, {
        description: string | null;
        triggerConfig: unknown;
        defaultTopicIds: number[];
      }> | null = null;
      if (rows.length > 0 && (include.has('description') || include.has('triggerConfig') || include.has('defaultTopicIds'))) {
        const { brainPlaybooks } = await import('@/lib/db/schema');
        const extras = await db.select({
          id: brainPlaybooks.id,
          description: brainPlaybooks.description,
          triggerConfig: brainPlaybooks.triggerConfig,
          defaultTopicIds: brainPlaybooks.defaultTopicIds,
        }).from(brainPlaybooks)
          .where(and(
            eq(brainPlaybooks.clientId, clientId),
            inArray(brainPlaybooks.id, rows.map((r) => r.id)),
          ));
        extraByPlaybook = new Map(extras.map((e) => [e.id, {
          description: e.description,
          triggerConfig: e.triggerConfig,
          defaultTopicIds: e.defaultTopicIds ?? [],
        }]));
      }
      const items = rows.map((r) => {
        const extra = extraByPlaybook?.get(r.id);
        return {
          id: r.id,
          name: r.name,
          slug: r.slug,
          status: r.status,
          category: r.category,
          triggerKind: r.triggerKind,
          ownerId: r.ownerId,
          stepCount: r.stepCount,
          activeRunCount: r.activeRunCount,
          ...(include.has('description') && extra ? { description: extra.description } : {}),
          ...(include.has('triggerConfig') && extra ? { triggerConfig: extra.triggerConfig } : {}),
          ...(include.has('defaultTopicIds') && extra ? { defaultTopicIds: extra.defaultTopicIds } : {}),
        };
      });
      return json({ items, limit: args.limit ?? 50, offset: args.offset ?? 0 });
    },
  );

  hasScope(ctx.scopes, 'brain:read') && server.registerTool(
    'brain_playbooks_get',
    {
      title: 'Get a Brain playbook with steps',
      description: 'Get one playbook by id with its ordered steps. Slim by default — step rows return { id, key, name, kind, nextStepKeys, sortOrder } and the playbook omits description. Pass `include: ["description"]` to inline the playbook description, `["stepConfigs"]` to inline each step\'s config + condition + description blobs.',
      inputSchema: {
        id: z.number().int().positive(),
        include: z.array(playbookGetIncludeEnum).optional(),
      },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:read')) return denied('brain:read');
      const detail = await getPlaybookById(clientId, args.id);
      if (!detail) return err('Playbook not found.');
      const include = new Set(args.include ?? []);
      const p = detail.playbook;
      const playbook: Record<string, unknown> = {
        id: p.id,
        name: p.name,
        slug: p.slug,
        status: p.status,
        category: p.category,
        triggerKind: p.triggerKind,
        triggerConfig: p.triggerConfig,
        ownerId: p.ownerId,
        defaultTopicIds: p.defaultTopicIds,
        source: p.source,
        createdBy: p.createdBy,
        createdAt: p.createdAt.toISOString(),
        updatedAt: p.updatedAt.toISOString(),
      };
      if (include.has('description')) playbook.description = p.description;
      const steps = detail.steps.map((s) => {
        const row: Record<string, unknown> = {
          id: s.id,
          key: s.key,
          name: s.name,
          kind: s.kind,
          nextStepKeys: s.nextStepKeys,
          sortOrder: s.sortOrder,
        };
        if (include.has('stepConfigs')) {
          row.description = s.description;
          row.config = s.config;
          row.condition = s.condition;
        }
        return row;
      });
      return json({ playbook, steps });
    },
  );

  hasScope(ctx.scopes, 'brain:read') && server.registerTool(
    'brain_playbook_runs_list',
    {
      title: 'List Brain playbook runs',
      description: 'List runs for this tenant. Slim row default — { id, playbookId, playbookName, label, status, startedAt, completedAt, stepProgress: { completed, total } }. Filter by status and / or playbookId. Cap limit at 100.',
      inputSchema: {
        status: z.union([playbookRunStatusEnum, z.array(playbookRunStatusEnum)]).optional(),
        playbookId: z.number().int().positive().optional(),
        limit: z.number().int().min(1).max(100).optional(),
        offset: z.number().int().min(0).optional(),
      },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:read')) return denied('brain:read');
      const rows = await listRuns(clientId, {
        status: args.status,
        playbookId: args.playbookId,
        limit: args.limit,
        offset: args.offset,
      });
      const items = rows.map((r) => ({
        id: r.id,
        playbookId: r.playbookId,
        playbookName: r.playbookName,
        label: r.label,
        status: r.status,
        startedAt: r.startedAt ? r.startedAt.toISOString() : null,
        completedAt: r.completedAt ? r.completedAt.toISOString() : null,
        stepProgress: r.stepProgress,
      }));
      return json({ items, limit: args.limit ?? 50, offset: args.offset ?? 0 });
    },
  );

  hasScope(ctx.scopes, 'brain:read') && server.registerTool(
    'brain_playbook_runs_get',
    {
      title: 'Get a Brain playbook run',
      description: 'Get one run by id with { run, playbook (slim: id/name/slug/status), steps (per-run state), links }. Heavy JSON columns (`context`, `triggerPayload`) are opt-in via `include`.',
      inputSchema: {
        id: z.number().int().positive(),
        include: z.array(playbookRunGetIncludeEnum).optional(),
      },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:read')) return denied('brain:read');
      const detail = await getRunById(clientId, args.id);
      if (!detail) return err('Playbook run not found.');
      const include = new Set(args.include ?? []);
      const r = detail.run;
      const run: Record<string, unknown> = {
        id: r.id,
        playbookId: r.playbookId,
        label: r.label,
        status: r.status,
        startedBy: r.startedBy,
        startedAt: r.startedAt ? r.startedAt.toISOString() : null,
        completedAt: r.completedAt ? r.completedAt.toISOString() : null,
        abortedAt: r.abortedAt ? r.abortedAt.toISOString() : null,
        abortReason: r.abortReason,
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
      };
      if (include.has('context')) run.context = r.context;
      if (include.has('triggerPayload')) run.triggerPayload = r.triggerPayload;
      return json({
        run,
        playbook: {
          id: detail.playbook.id,
          name: detail.playbook.name,
          slug: detail.playbook.slug,
          status: detail.playbook.status,
        },
        steps: detail.steps.map((s) => ({
          id: s.id,
          stepId: s.stepId,
          key: s.key,
          name: s.name,
          kind: s.kind,
          status: s.status,
          resultEntityType: s.resultEntityType,
          resultEntityId: s.resultEntityId,
          startedAt: s.startedAt ? s.startedAt.toISOString() : null,
          completedAt: s.completedAt ? s.completedAt.toISOString() : null,
          waitUntil: s.waitUntil ? s.waitUntil.toISOString() : null,
          failureReason: s.failureReason,
        })),
        links: detail.links.map((l) => ({
          id: l.id,
          entityType: l.entityType,
          entityId: l.entityId,
        })),
      });
    },
  );

  hasScope(ctx.scopes, 'brain:read') && server.registerTool(
    'brain_playbook_runs_active_for_entity',
    {
      title: 'List active playbook runs anchored to an entity',
      description: 'Returns active + paused runs anchored to the given entity via brain_playbook_links — e.g. "what onboarding playbook is in flight for this person?". Slim row shape, same as brain_playbook_runs_list.',
      inputSchema: {
        entityType: playbookLinkEntityTypeEnum,
        entityId: z.number().int().positive(),
      },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:read')) return denied('brain:read');
      const rows = await listActiveRunsForEntity(clientId, args.entityType, args.entityId);
      const items = rows.map((r) => ({
        id: r.id,
        playbookId: r.playbookId,
        playbookName: r.playbookName,
        label: r.label,
        status: r.status,
        startedAt: r.startedAt ? r.startedAt.toISOString() : null,
        completedAt: r.completedAt ? r.completedAt.toISOString() : null,
        stepProgress: r.stepProgress,
      }));
      return json({ items, total: items.length });
    },
  );

  // ── WRITE — playbooks (Wave 2c) ──────────────────────────────────────────

  hasScope(ctx.scopes, 'brain:write') && server.registerTool(
    'brain_playbooks_create',
    {
      title: 'Create a Brain playbook',
      description: 'Create a new playbook (always starts in `draft`). Use brain_playbooks_add_step to attach steps, then brain_playbooks_activate once the DAG is valid. Echo: { id, slug, status }.',
      inputSchema: {
        name: z.string().min(1).max(200),
        description: z.string().nullable().optional(),
        triggerKind: playbookTriggerKindEnum.optional(),
        triggerConfig: z.object({
          event: z.string().optional(),
          filters: z.record(z.string(), z.unknown()).optional(),
          cron: z.string().optional(),
        }).nullable().optional(),
        category: z.string().max(100).nullable().optional(),
        ownerId: z.number().int().positive().nullable().optional(),
        defaultTopicIds: z.array(z.number().int().positive()).optional(),
      },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:write')) return denied('brain:write');
      try {
        const created = await createPlaybook(clientId, ctx.userId, {
          name: args.name,
          description: args.description ?? null,
          triggerKind: args.triggerKind,
          triggerConfig: args.triggerConfig ?? null,
          category: args.category ?? null,
          ownerId: args.ownerId ?? null,
          defaultTopicIds: args.defaultTopicIds,
        });
        return json({ id: created.id, slug: created.slug, status: created.status });
      } catch (e) {
        return err(e instanceof Error ? e.message : 'Failed to create playbook.');
      }
    },
  );

  hasScope(ctx.scopes, 'brain:write') && server.registerTool(
    'brain_playbooks_update',
    {
      title: 'Update a Brain playbook',
      description: 'Patch fields on a playbook definition. Status changes are NOT allowed here — use brain_playbooks_activate or brain_playbooks_archive. Echo: { id, updatedFields }. Returns a structured error { error: "use_activate_or_archive" } if a status change is attempted.',
      inputSchema: {
        id: z.number().int().positive(),
        patch: z.object({
          name: z.string().min(1).max(200).optional(),
          description: z.string().nullable().optional(),
          category: z.string().max(100).nullable().optional(),
          ownerId: z.number().int().positive().nullable().optional(),
          triggerKind: playbookTriggerKindEnum.optional(),
          triggerConfig: z.object({
            event: z.string().optional(),
            filters: z.record(z.string(), z.unknown()).optional(),
            cron: z.string().optional(),
          }).nullable().optional(),
          defaultTopicIds: z.array(z.number().int().positive()).optional(),
        }),
      },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:write')) return denied('brain:write');
      const p = args.patch;
      try {
        const updated = await updatePlaybook(clientId, ctx.userId, args.id, {
          name: p.name,
          description: p.description,
          category: p.category,
          ownerId: p.ownerId,
          triggerKind: p.triggerKind,
          triggerConfig: p.triggerConfig,
          defaultTopicIds: p.defaultTopicIds,
        });
        if (!updated) return err('Playbook not found.');
        return json({
          id: updated.id,
          updatedFields: Object.keys(p).filter((k) => (p as Record<string, unknown>)[k] !== undefined),
        });
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        if (message.includes('use activatePlaybook or archivePlaybook')) {
          return json({ error: 'use_activate_or_archive', message });
        }
        return err(message || 'Failed to update playbook.');
      }
    },
  );

  hasScope(ctx.scopes, 'brain:write') && server.registerTool(
    'brain_playbooks_activate',
    {
      title: 'Activate a Brain playbook',
      description: 'Flip status from `draft` to `active`. Refuses if the playbook has zero steps OR the step graph fails DAG validation (cycles, missing next-step refs, no entry point). On DAG failure returns a structured error { error: "dag_invalid", errors: string[] }. Echo on success: { id, status: "active" }.',
      inputSchema: {
        id: z.number().int().positive(),
      },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:write')) return denied('brain:write');
      try {
        const updated = await activatePlaybook(clientId, ctx.userId, args.id);
        if (!updated) return err('Playbook not found.');
        return json({ id: updated.id, status: updated.status });
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        const dagPrefix = 'playbook DAG invalid: ';
        if (message.startsWith(dagPrefix)) {
          const errors = message.slice(dagPrefix.length).split('; ').filter(Boolean);
          return json({ error: 'dag_invalid', errors });
        }
        if (message.includes('zero steps')) {
          return json({ error: 'dag_invalid', errors: [message] });
        }
        return err(message || 'Failed to activate playbook.');
      }
    },
  );

  hasScope(ctx.scopes, 'brain:write') && server.registerTool(
    'brain_playbooks_archive',
    {
      title: 'Archive a Brain playbook',
      description: 'Flip status to `archived`. Refuses while pending/active/paused runs exist unless `force=true`. Echo on success: { id, status: "archived" }. Returns a structured error { error: "active_runs_exist", message } if force is omitted and active runs block the transition.',
      inputSchema: {
        id: z.number().int().positive(),
        force: z.boolean().optional(),
      },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:write')) return denied('brain:write');
      try {
        const updated = await archivePlaybook(clientId, ctx.userId, args.id, { force: args.force });
        if (!updated) return err('Playbook not found.');
        return json({ id: updated.id, status: updated.status });
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        if (message.includes('cannot archive playbook with')) {
          return json({ error: 'active_runs_exist', message });
        }
        return err(message || 'Failed to archive playbook.');
      }
    },
  );

  hasScope(ctx.scopes, 'brain:write') && server.registerTool(
    'brain_playbooks_delete',
    {
      title: 'Delete a Brain playbook',
      description: 'Hard delete. Refuses while any runs exist (active or historical) unless `force=true` — force cascades through runs/run-steps/links. Echo on success: { id, deleted: true }. Returns a structured error { error: "runs_exist", message } if force is omitted and runs block the delete.',
      inputSchema: {
        id: z.number().int().positive(),
        force: z.boolean().optional(),
      },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:write')) return denied('brain:write');
      try {
        const deleted = await deletePlaybook(clientId, ctx.userId, args.id, { force: args.force });
        if (!deleted) return err('Playbook not found.');
        return json({ id: args.id, deleted: true });
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        if (message.includes('cannot delete playbook with')) {
          return json({ error: 'runs_exist', message });
        }
        return err(message || 'Failed to delete playbook.');
      }
    },
  );

  hasScope(ctx.scopes, 'brain:write') && server.registerTool(
    'brain_playbooks_add_step',
    {
      title: 'Add a step to a Brain playbook',
      description: 'Append a step to a playbook. The step `key` is a stable identifier within the playbook (used by nextStepKeys + run state). `sortOrder` auto-picks (append) when omitted. Echo: { id, key } — re-fetch via brain_playbooks_get for the full row.',
      inputSchema: {
        playbookId: z.number().int().positive(),
        step: z.object({
          key: z.string().min(1).max(100),
          name: z.string().min(1).max(200),
          description: z.string().nullable().optional(),
          kind: playbookStepKindEnum,
          config: z.record(z.string(), z.unknown()).optional(),
          condition: playbookConditionSchema.optional(),
          nextStepKeys: z.array(z.string()).optional(),
          sortOrder: z.number().int().optional(),
        }),
      },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:write')) return denied('brain:write');
      try {
        const step: AddStepInput = {
          key: args.step.key,
          name: args.step.name,
          description: args.step.description ?? null,
          kind: args.step.kind,
          config: args.step.config,
          condition: (args.step.condition ?? null) as BrainPlaybookCondition,
          nextStepKeys: args.step.nextStepKeys,
          sortOrder: args.step.sortOrder,
        };
        const created = await addStep(clientId, ctx.userId, args.playbookId, step);
        return json({ id: created.id, key: created.key });
      } catch (e) {
        return err(e instanceof Error ? e.message : 'Failed to add step.');
      }
    },
  );

  hasScope(ctx.scopes, 'brain:write') && server.registerTool(
    'brain_playbooks_update_step',
    {
      title: 'Update a Brain playbook step',
      description: 'Patch fields on an existing step. Echo: { id, updatedFields }.',
      inputSchema: {
        stepId: z.number().int().positive(),
        patch: z.object({
          key: z.string().min(1).max(100).optional(),
          name: z.string().min(1).max(200).optional(),
          description: z.string().nullable().optional(),
          kind: playbookStepKindEnum.optional(),
          config: z.record(z.string(), z.unknown()).optional(),
          condition: playbookConditionSchema.optional(),
          nextStepKeys: z.array(z.string()).optional(),
          sortOrder: z.number().int().optional(),
        }),
      },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:write')) return denied('brain:write');
      const p = args.patch;
      try {
        const patch: UpdateStepInput = {
          key: p.key,
          name: p.name,
          description: p.description,
          kind: p.kind,
          config: p.config,
          condition: p.condition === undefined
            ? undefined
            : (p.condition as BrainPlaybookCondition),
          nextStepKeys: p.nextStepKeys,
          sortOrder: p.sortOrder,
        };
        const updated = await updateStep(clientId, ctx.userId, args.stepId, patch);
        if (!updated) return err('Step not found.');
        return json({
          id: updated.id,
          updatedFields: Object.keys(p).filter((k) => (p as Record<string, unknown>)[k] !== undefined),
        });
      } catch (e) {
        return err(e instanceof Error ? e.message : 'Failed to update step.');
      }
    },
  );

  hasScope(ctx.scopes, 'brain:write') && server.registerTool(
    'brain_playbooks_remove_step',
    {
      title: 'Remove a Brain playbook step',
      description: 'Remove a step from a playbook. Defensive — refuses if any run-step row references it (delete the affected runs first). Also walks sibling steps and strips this step\'s key from their nextStepKeys arrays so the DAG stays clean. Echo: { stepId, deleted: true }.',
      inputSchema: {
        stepId: z.number().int().positive(),
      },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:write')) return denied('brain:write');
      try {
        const deleted = await removeStep(clientId, ctx.userId, args.stepId);
        if (!deleted) return err('Step not found.');
        return json({ stepId: args.stepId, deleted: true });
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        if (message.includes('run-step row(s) reference')) {
          return json({ error: 'run_steps_reference', message });
        }
        return err(message || 'Failed to remove step.');
      }
    },
  );

  hasScope(ctx.scopes, 'brain:write') && server.registerTool(
    'brain_playbooks_reorder_steps',
    {
      title: 'Reorder Brain playbook steps',
      description: 'Atomically re-sortOrder the given step ids. All ids must belong to the same playbook + tenant; otherwise the whole batch is rejected. Steps not in `orderedStepIds` are left untouched. Echo: { playbookId, count }.',
      inputSchema: {
        playbookId: z.number().int().positive(),
        orderedStepIds: z.array(z.number().int().positive()).min(1),
      },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:write')) return denied('brain:write');
      try {
        const refreshed = await reorderSteps(clientId, ctx.userId, args.playbookId, args.orderedStepIds);
        return json({ playbookId: args.playbookId, count: refreshed.length });
      } catch (e) {
        return err(e instanceof Error ? e.message : 'Failed to reorder steps.');
      }
    },
  );
}
