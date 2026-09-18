/**
 * Brain MCP adapter — playbook runs
 *
 * Split out of adapters/playbooks.ts to keep new files
 * under the 800-line new-file cap (scripts/check-file-budget.ts). Behavior is
 * unchanged from before the split.
 */
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



export function registerBrainPlaybookRunsTools(server: McpServer, ctx: PortalMcpContext, clientId: number) {
  // ── WRITE — playbook runs (Wave 2c) ──────────────────────────────────────

  hasScope(ctx.scopes, 'brain:write') && server.registerTool(
    'brain_playbook_runs_start',
    {
      title: 'Start a Brain playbook run',
      description: 'Spawn a new run of an active playbook. `context` is the variable bag step configs template against (e.g. { person: { fullName: "Jane" } }). `links` anchors the run to polymorphic entities (initiative, person, crm_company, crm_deal, meeting, decision). Entry steps fire immediately within the start tx. Echo: { runId, status: "active", firstStepKeys: string[] }.',
      inputSchema: {
        playbookId: z.number().int().positive(),
        label: z.string().min(1).max(255),
        context: z.record(z.string(), z.unknown()).optional(),
        triggerPayload: z.record(z.string(), z.unknown()).optional(),
        links: z.array(z.object({
          entityType: playbookLinkEntityTypeEnum,
          entityId: z.number().int().positive(),
        })).optional(),
      },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:write')) return denied('brain:write');
      try {
        const out = await startRun(clientId, ctx.userId, {
          playbookId: args.playbookId,
          label: args.label,
          context: args.context,
          triggerPayload: args.triggerPayload,
          links: args.links,
        });
        return json({
          runId: out.runId,
          status: out.runStatus,
          firstStepKeys: out.firstStepKeys,
        });
      } catch (e) {
        return err(e instanceof Error ? e.message : 'Failed to start run.');
      }
    },
  );

  hasScope(ctx.scopes, 'brain:write') && server.registerTool(
    'brain_playbook_runs_advance',
    {
      title: 'Advance a Brain playbook run',
      description: 'Resolve any active `branch` run-steps and chain forward to next steps. Task/decision/review_item/wait steps stay active until explicit completion — this tool does not touch them. Echo: { runId, newActiveStepKeys, newStatus }.',
      inputSchema: {
        runId: z.number().int().positive(),
      },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:write')) return denied('brain:write');
      try {
        const out = await advanceRun(clientId, ctx.userId, args.runId);
        if (!out) return err('Playbook run not found.');
        return json({
          runId: out.runId,
          newActiveStepKeys: out.newActiveStepKeys,
          newStatus: out.newStatus,
        });
      } catch (e) {
        return err(e instanceof Error ? e.message : 'Failed to advance run.');
      }
    },
  );

  hasScope(ctx.scopes, 'brain:write') && server.registerTool(
    'brain_playbook_run_steps_complete',
    {
      title: 'Complete a Brain playbook run step',
      description: 'Explicitly mark a run-step completed (used for task/decision/review_item kinds that don\'t auto-complete). Optionally record the entity this step produced. After the mutation, advanceRun chains forward. Echo: { stepId, status: "completed" }.',
      inputSchema: {
        runId: z.number().int().positive(),
        stepId: z.number().int().positive(),
        resultEntityType: z.string().max(50).optional(),
        resultEntityId: z.number().int().positive().optional(),
      },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:write')) return denied('brain:write');
      try {
        const out = await completeStep(clientId, ctx.userId, args.runId, args.stepId, {
          resultEntityType: args.resultEntityType,
          resultEntityId: args.resultEntityId,
        });
        if (!out) return err('Run step not found.');
        return json({ stepId: out.stepId, status: out.status });
      } catch (e) {
        return err(e instanceof Error ? e.message : 'Failed to complete step.');
      }
    },
  );

  hasScope(ctx.scopes, 'brain:write') && server.registerTool(
    'brain_playbook_run_steps_skip',
    {
      title: 'Skip a Brain playbook run step',
      description: 'Mark a run-step skipped (the step is treated as terminal for routing but with no result). Optional `reason` is stored on the row. After the mutation, advanceRun chains forward. Echo: { stepId, status: "skipped" }.',
      inputSchema: {
        runId: z.number().int().positive(),
        stepId: z.number().int().positive(),
        reason: z.string().max(5000).optional(),
      },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:write')) return denied('brain:write');
      try {
        const out = await skipStep(clientId, ctx.userId, args.runId, args.stepId, {
          reason: args.reason,
        });
        if (!out) return err('Run step not found.');
        return json({ stepId: out.stepId, status: out.status });
      } catch (e) {
        return err(e instanceof Error ? e.message : 'Failed to skip step.');
      }
    },
  );

  hasScope(ctx.scopes, 'brain:write') && server.registerTool(
    'brain_playbook_runs_abort',
    {
      title: 'Abort a Brain playbook run',
      description: 'Stop a run mid-flight. Any still-active step rows are marked skipped with the abort reason. Echo: { runId, status: "aborted" }.',
      inputSchema: {
        runId: z.number().int().positive(),
        reason: z.string().max(2000).optional(),
      },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:write')) return denied('brain:write');
      try {
        const updated = await abortRun(clientId, ctx.userId, args.runId, { reason: args.reason });
        if (!updated) return err('Playbook run not found.');
        return json({ runId: updated.id, status: updated.status });
      } catch (e) {
        return err(e instanceof Error ? e.message : 'Failed to abort run.');
      }
    },
  );
}
