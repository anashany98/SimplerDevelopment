/**
 * Wire Brain tools into the @modelcontextprotocol/sdk server. Lets a Claude
 * Desktop user (or any MCP client) drive Company Brain via natural language —
 * search the brain, list/get/create/update tasks and meetings, manage the
 * AI review queue.
 *
 * Scopes:
 *   brain:read      — list/get/search across all brain entities
 *   brain:write     — create/update tasks, meetings, links
 *   brain:approve   — approve/reject AI review items, edit relationship
 *                     overlays. This is sensitive; gate behind a separate
 *                     scope so power users can opt in explicitly.
 *
 * Trust boundary: `brain:write` tools commit directly — the "AI is never the
 * source of truth" review-queue path (lib/brain/review.ts) is opt-in per
 * tool, not structural. Only tools that explicitly route through
 * brainAiReviewItems (e.g. `brain_propose_task` vs. the direct
 * `brain_create_task`) get human approval before the record exists.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { hasScope, type PortalMcpContext } from '@/lib/mcp-auth';
import { json, denied } from '@/lib/mcp/types';
import { searchBrain } from './search';
import { getOrCreateBrainProfile } from './profiles';
import {
  createMeetingFromAdapter,
  getMeeting,
  linkMeeting,
  listMeetings,
  type BrainMeeting,
} from './meetings';
import {
  createTask,
  getTask,
  listTasks,
  updateTask,
} from './tasks';
import {
  createOverlay,
  getRelationship,
  listRelationships,
  updateOverlay,
} from './relationships';
import {
  approveReviewItem,
  getReviewItem,
  listReviewItems,
  rejectReviewItem,
} from './review';
import {
  applySuggestionToReviewItem,
  suggestReviewerForItem,
} from './review-routing';
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
} from './notes';
import { classifyNotes, type NoteClassification } from './classify-notes';
import { applyClassifications } from './apply-classifications';
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
} from './initiatives';
import {
  listGoals,
  getGoalById,
  createGoal,
  updateGoal,
  checkinGoal,
  deleteGoal,
} from './goals';
import {
  createSavedSearch,
  deleteSavedSearch,
  getSavedSearch,
  listSavedSearches,
  updateSavedSearch,
  type BrainSavedSearchFilters,
} from './saved-searches';
import {
  createTemplate,
  deleteTemplate,
  DuplicateTemplateNameError,
  getTemplate,
  listTemplates,
  updateTemplate,
  type BrainNoteTemplateTrigger,
} from './templates';
import { applyTemplate } from './template';
import { getDashboardSummary } from './dashboard';
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
} from './playbooks';
import {
  listRuns,
  getRunById,
  listActiveRunsForEntity,
  startRun,
  advanceRun,
  completeStep,
  skipStep,
  abortRun,
} from './playbook-runs';
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
} from './documents';
import {
  assignRequiredRead,
  listRequiredReadsForDocument,
  listRequiredReadsForPerson,
  removeRequiredRead,
  acknowledge as acknowledgeDocument,
  listAcknowledgmentsForDocument,
  listAcknowledgmentsForPerson,
  complianceReport,
} from './document-acks';
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
import { err } from './adapters/shared';
import { registerDecisionBrainTools } from './adapters/decisions';
import { registerTopicBrainTools } from './adapters/topics';
import { registerPeopleBrainTools } from './adapters/people';
import { registerGlossaryBrainTools } from './adapters/glossary';
import { registerBrainReadsTools } from './adapters/reads';
import { registerBrainWritesTools } from './adapters/writes';
import { registerBrainNotesTools } from './adapters/notes';
import { registerBrainTaxonomyTools } from './adapters/taxonomy';
import { registerBrainCrmReadsTools } from './adapters/crm-reads';
import { registerBrainInitiativesGoalsTools } from './adapters/initiatives-goals';
import { registerBrainPlaybooksTools } from './adapters/playbooks';
import { registerBrainPlaybookRunsTools } from './adapters/playbook-runs';
import { registerBrainDocumentsTools } from './adapters/documents';
import { registerBrainDocumentsWriteTools } from './adapters/documents-write';

function absolutizeUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  return `${PORTAL_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`;
}

export function registerBrainToolsOnSdk(server: McpServer, ctx: PortalMcpContext) {
  const clientId = ctx.client.id;

  // BRAIN — search/relationships/meetings/tasks/review reads — see ./adapters/reads.ts.
  registerBrainReadsTools(server, ctx, clientId);

  // BRAIN — core writes + approvals + review routing — see ./adapters/writes.ts.
  registerBrainWritesTools(server, ctx, clientId);

  // BRAIN — knowledge notes — see ./adapters/notes.ts.
  registerBrainNotesTools(server, ctx, clientId);

  // BRAIN — taxonomy/saved searches/note templates — see ./adapters/taxonomy.ts.
  registerBrainTaxonomyTools(server, ctx, clientId);

  // BRAIN — CRM reads (companies/contacts/deals/posts) — see ./adapters/crm-reads.ts.
  registerBrainCrmReadsTools(server, ctx, clientId);

  // BRAIN — initiatives & goals — see ./adapters/initiatives-goals.ts.
  registerBrainInitiativesGoalsTools(server, ctx, clientId);

  // BRAIN — DECISIONS lives in ./adapters/decisions.ts. This registrar stays
  // composable: one register*BrainTools() call per domain, no inline tool
  // blocks. See ADR automation-vs-workflows-boundary for the other boundary.
  registerDecisionBrainTools(server, ctx, clientId);

  // BRAIN — TOPICS lives in ./adapters/topics.ts (same composable pattern as
  // decisions above: one register*BrainTools() call per domain).
  registerTopicBrainTools(server, ctx, clientId);
  // ── PEOPLE — reads ───────────────────────────────────────────────────────

  registerPeopleBrainTools(server, ctx, clientId);
  // BRAIN — GLOSSARY lives in ./adapters/glossary.ts (same composable pattern).
  registerGlossaryBrainTools(server, ctx, clientId);

  // BRAIN — playbooks & runs — see ./adapters/playbooks.ts.
  registerBrainPlaybooksTools(server, ctx, clientId);
  registerBrainPlaybookRunsTools(server, ctx, clientId);

  // BRAIN — documents — see ./adapters/documents.ts.
  registerBrainDocumentsTools(server, ctx, clientId);
  registerBrainDocumentsWriteTools(server, ctx, clientId);

}
