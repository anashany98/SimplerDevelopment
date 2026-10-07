/**
 * Company Brain Agent — tool definitions and executor.
 *
 * Exports:
 *   BRAIN_TOOLS      — Anthropic.Tool[] passed to the brain agent API route
 *   executeBrainTool — dispatcher called by the route's tool-use loop
 *
 * Each handler calls lib/brain/* directly (no HTTP round-trips). Errors are
 * caught per-handler and returned as { error: string } so the agent can reason
 * about failures without crashing the conversation loop.
 */

import type Anthropic from '@anthropic-ai/sdk';
import { searchBrain, type BrainSearchEntityType } from '@/lib/brain/search';
import { getNote, createNote } from '@/lib/brain/notes';
import { listDecisions, getDecisionById, type ListDecisionsOpts } from '@/lib/brain/decisions';
import { listPeople, type ListPeopleOpts } from '@/lib/brain/people';
import { lookupGlossary, listGlossaryTerms } from '@/lib/brain/glossary';
import { getDashboardSummary } from '@/lib/brain/dashboard';
import { listTasks, createTask } from '@/lib/brain/tasks';
import type { BrainTaskStatus } from '@/lib/db/schema';
import { listInitiatives, type ListInitiativesOpts } from '@/lib/brain/initiatives';
import { listGoals, getGoalById, type ListGoalsOpts } from '@/lib/brain/goals';
import { listRelationships, getRelationship } from '@/lib/brain/relationships';
import { getTopicTree } from '@/lib/brain/topics';
import { listPlaybooks, getPlaybookById, type ListPlaybooksOpts } from '@/lib/brain/playbooks';
import { listDocuments, getDocumentById, type ListDocumentsOpts } from '@/lib/brain/documents';
import { getOrgUnitTree } from '@/lib/brain/org-units';
import { sanitizeToolResult } from './sanitizer';

// ─── Tool definitions ─────────────────────────────────────────────────────────

export const BRAIN_TOOLS: Anthropic.Tool[] = [
  {
    name: 'brain_search',
    description:
      'Search the Company Brain using hybrid full-text and semantic search. Returns matching meetings, notes, tasks, relationships, companies, contacts, deals, and posts.',
    input_schema: {
      type: 'object' as const,
      properties: {
        query: { type: 'string', description: 'Search query' },
        types: {
          type: 'array',
          items: {
            type: 'string',
            enum: ['note', 'task', 'meeting', 'relationship', 'company', 'contact', 'deal', 'post'],
          },
          description: 'Entity types to include (omit for all types)',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of results to return (default 25, max 100)',
        },
      },
      required: ['query'],
    },
  },

  {
    name: 'brain_dashboard_summary',
    description:
      'Get a high-level Company Brain dashboard summary: counts of open tasks, active initiatives, at-risk goals, pending review items, active people, glossary terms, and more.',
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },

  {
    name: 'brain_get_note',
    description: 'Read a Company Brain knowledge note by its numeric ID. Returns the full note including markdown body.',
    input_schema: {
      type: 'object' as const,
      properties: {
        note_id: { type: 'number', description: 'Numeric ID of the note to retrieve' },
      },
      required: ['note_id'],
    },
  },

  {
    name: 'brain_create_note',
    description: 'Create a new Company Brain knowledge note with a title and markdown body.',
    input_schema: {
      type: 'object' as const,
      properties: {
        title: { type: 'string', description: 'Note title (max 255 characters)' },
        body: { type: 'string', description: 'Note body in Markdown format' },
        tags: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional list of tags to categorize the note',
        },
        pinned: { type: 'boolean', description: 'Whether to pin the note (default false)' },
      },
      required: ['title'],
    },
  },

  {
    name: 'brain_list_decisions',
    description: 'List recent decisions logged in the Company Brain. Supports filtering by status.',
    input_schema: {
      type: 'object' as const,
      properties: {
        status: {
          type: 'string',
          enum: ['proposed', 'accepted', 'rejected', 'superseded'],
          description: 'Filter by decision status (omit for all statuses)',
        },
        limit: { type: 'number', description: 'Maximum number of decisions to return (default 20, max 200)' },
      },
      required: [],
    },
  },

  {
    name: 'brain_get_decision',
    description: 'Read a specific decision by its numeric ID, including its supersede chain.',
    input_schema: {
      type: 'object' as const,
      properties: {
        decision_id: { type: 'number', description: 'Numeric ID of the decision to retrieve' },
      },
      required: ['decision_id'],
    },
  },

  {
    name: 'brain_list_people',
    description:
      'List people in the Company Brain people directory (employees, advisors, contractors) with their titles and org unit membership.',
    input_schema: {
      type: 'object' as const,
      properties: {
        search: {
          type: 'string',
          description: 'Optional substring search across name, email, and title',
        },
        status: {
          type: 'string',
          enum: ['active', 'inactive', 'contractor', 'advisor'],
          description: 'Filter by person status (omit for all)',
        },
        limit: { type: 'number', description: 'Maximum number of people to return (default 50, max 100)' },
      },
      required: [],
    },
  },

  {
    name: 'brain_lookup_glossary',
    description:
      'Look up a term in the Company Brain glossary using exact, prefix, and substring matching. Use this to find definitions for domain-specific vocabulary.',
    input_schema: {
      type: 'object' as const,
      properties: {
        query: { type: 'string', description: 'Term or phrase to look up' },
        limit: { type: 'number', description: 'Maximum number of matches to return (default 5, max 25)' },
      },
      required: ['query'],
    },
  },

  {
    name: 'brain_list_glossary',
    description: 'List all active glossary terms in the Company Brain, optionally filtered by category or search query.',
    input_schema: {
      type: 'object' as const,
      properties: {
        search: { type: 'string', description: 'Optional substring search across terms and definitions' },
        category: { type: 'string', description: 'Optional category filter' },
        limit: { type: 'number', description: 'Maximum number of terms to return (default 50, max 100)' },
      },
      required: [],
    },
  },

  {
    name: 'brain_list_initiatives',
    description: 'List Company Brain initiatives (multi-quarter strategic umbrella efforts) with their status and goal counts.',
    input_schema: {
      type: 'object' as const,
      properties: {
        status: {
          type: 'string',
          enum: ['planned', 'active', 'completed', 'cancelled'],
          description: 'Filter by initiative status (omit for all)',
        },
        limit: { type: 'number', description: 'Maximum number of initiatives to return (default 25)' },
      },
      required: [],
    },
  },

  {
    name: 'brain_list_tasks',
    description: 'List open Company Brain tasks, optionally filtered by status.',
    input_schema: {
      type: 'object' as const,
      properties: {
        status: {
          type: 'string',
          enum: ['open', 'in_progress', 'blocked', 'done'],
          description: 'Filter by task status (omit for all — defaults to open tasks only)',
        },
        limit: { type: 'number', description: 'Maximum number of tasks to return (default 50, max 200)' },
      },
      required: [],
    },
  },

  {
    name: 'brain_create_task',
    description: 'Create a new Company Brain task.',
    input_schema: {
      type: 'object' as const,
      properties: {
        title: { type: 'string', description: 'Task title (max 500 characters)' },
        description: { type: 'string', description: 'Optional task description' },
        priority: {
          type: 'string',
          enum: ['low', 'medium', 'high', 'urgent'],
          description: 'Task priority (default: medium)',
        },
        due_date: {
          type: 'string',
          description: 'Optional due date in ISO 8601 format (e.g. 2026-07-01)',
        },
      },
      required: ['title'],
    },
  },

  {
    name: 'brain_list_goals',
    description: 'List Company Brain goals (OKRs) with their status, owner, and target dates. Optionally filter by status.',
    input_schema: {
      type: 'object' as const,
      properties: {
        status: {
          type: 'string',
          enum: ['active', 'at_risk', 'completed', 'paused', 'cancelled'],
          description: 'Filter by goal status (omit for all)',
        },
        limit: { type: 'number', description: 'Maximum number of goals to return (default 50, max 100)' },
      },
      required: [],
    },
  },

  {
    name: 'brain_get_goal',
    description: 'Read a specific Company Brain goal by its numeric ID, including its parent initiative reference.',
    input_schema: {
      type: 'object' as const,
      properties: {
        goal_id: { type: 'number', description: 'Numeric ID of the goal to retrieve' },
      },
      required: ['goal_id'],
    },
  },

  {
    name: 'brain_list_relationships',
    description: 'List relationships tracked in the Company Brain (person-to-person and person-to-company overlays), optionally filtered by type.',
    input_schema: {
      type: 'object' as const,
      properties: {
        type: {
          type: 'string',
          description: 'Filter by relationship type (e.g. partner, vendor, investor, client)',
        },
        limit: { type: 'number', description: 'Maximum number of relationships to return (default 50, max 500)' },
      },
      required: [],
    },
  },

  {
    name: 'brain_get_relationship',
    description: 'Read a specific Company Brain relationship overlay by its numeric ID, including both parties and notes.',
    input_schema: {
      type: 'object' as const,
      properties: {
        relationship_id: { type: 'number', description: 'Numeric ID of the relationship overlay to retrieve' },
      },
      required: ['relationship_id'],
    },
  },

  {
    name: 'brain_get_topic_tree',
    description: 'Get the Company Brain topic tree (nested taxonomy of knowledge topics with entity counts). Use this to understand how company knowledge is organized.',
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },

  {
    name: 'brain_list_playbooks',
    description: 'List Company Brain playbooks (repeatable processes with step-by-step workflows), optionally filtered by status or category.',
    input_schema: {
      type: 'object' as const,
      properties: {
        status: {
          type: 'string',
          enum: ['draft', 'active', 'archived'],
          description: 'Filter by playbook status (omit for all)',
        },
        category: { type: 'string', description: 'Optional category filter' },
        limit: { type: 'number', description: 'Maximum number of playbooks to return (default 25, max 100)' },
      },
      required: [],
    },
  },

  {
    name: 'brain_get_playbook',
    description: 'Read a specific Company Brain playbook by its numeric ID, including its ordered steps and trigger kind.',
    input_schema: {
      type: 'object' as const,
      properties: {
        playbook_id: { type: 'number', description: 'Numeric ID of the playbook to retrieve' },
      },
      required: ['playbook_id'],
    },
  },

  {
    name: 'brain_list_documents',
    description: 'List Company Brain documents (SOPs, policies, guides) with their category, status, version, and acknowledgment counts.',
    input_schema: {
      type: 'object' as const,
      properties: {
        status: {
          type: 'string',
          enum: ['draft', 'published', 'archived'],
          description: 'Filter by document status (omit for all)',
        },
        category: { type: 'string', description: 'Optional category filter (e.g. policy, sop, guide)' },
        search: { type: 'string', description: 'Optional substring search across titles' },
        limit: { type: 'number', description: 'Maximum number of documents to return (default 50, max 100)' },
      },
      required: [],
    },
  },

  {
    name: 'brain_get_document',
    description: 'Read a specific Company Brain document by its numeric ID, including its current published version content.',
    input_schema: {
      type: 'object' as const,
      properties: {
        document_id: { type: 'number', description: 'Numeric ID of the document to retrieve' },
      },
      required: ['document_id'],
    },
  },

  {
    name: 'brain_get_org_chart',
    description: 'Get the Company Brain org chart: the org-unit tree with member counts and reporting structure.',
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
];

// ─── Handler type ─────────────────────────────────────────────────────────────

type BrainHandler = (
  input: Record<string, unknown>,
  clientId: number,
  userId: number,
) => Promise<unknown>;

// ─── Handlers ────────────────────────────────────────────────────────────────

const handlers: Record<string, BrainHandler> = {

  brain_search: async (input, clientId) => {
    try {
      const query = String(input.query ?? '');
      const types = Array.isArray(input.types)
        ? (input.types as string[]).filter((t) =>
            ['note', 'task', 'meeting', 'relationship', 'company', 'contact', 'deal', 'post'].includes(t),
          )
        : undefined;
      const limit = typeof input.limit === 'number' ? input.limit : undefined;
      return await searchBrain(clientId, query, {
        types: types as BrainSearchEntityType[] | undefined,
        limit,
      });
    } catch (err) {
      return { error: err instanceof Error ? err.message : String(err) };
    }
  },

  brain_dashboard_summary: async (_input, clientId) => {
    try {
      return await getDashboardSummary(clientId);
    } catch (err) {
      return { error: err instanceof Error ? err.message : String(err) };
    }
  },

  brain_get_note: async (input, clientId) => {
    try {
      const noteId = Number(input.note_id);
      if (!Number.isFinite(noteId)) return { error: 'note_id must be a number' };
      const note = await getNote(clientId, noteId);
      if (!note) return { error: `Note ${noteId} not found` };
      return note;
    } catch (err) {
      return { error: err instanceof Error ? err.message : String(err) };
    }
  },

  brain_create_note: async (input, clientId, userId) => {
    try {
      const title = String(input.title ?? '').trim();
      if (!title) return { error: 'title is required' };
      const body = input.body !== undefined ? String(input.body) : undefined;
      const tags = Array.isArray(input.tags)
        ? (input.tags as unknown[]).map(String)
        : undefined;
      const pinned = typeof input.pinned === 'boolean' ? input.pinned : undefined;
      return await createNote({
        clientId,
        title,
        body,
        tags,
        pinned,
        source: 'ai_review',
        // UAG-004: flag live agent-created notes for human review rather than
        // committing them silently as canonical truth (mirrors brain_create_task).
        needsReview: true,
        createdBy: userId,
      });
    } catch (err) {
      return { error: err instanceof Error ? err.message : String(err) };
    }
  },

  brain_list_decisions: async (input, clientId) => {
    try {
      const status = typeof input.status === 'string' ? input.status : undefined;
      const limit = typeof input.limit === 'number' ? Math.min(input.limit, 200) : 20;
      return await listDecisions(clientId, {
        status: status as ListDecisionsOpts['status'],
        limit,
      });
    } catch (err) {
      return { error: err instanceof Error ? err.message : String(err) };
    }
  },

  brain_get_decision: async (input, clientId) => {
    try {
      const decisionId = Number(input.decision_id);
      if (!Number.isFinite(decisionId)) return { error: 'decision_id must be a number' };
      const result = await getDecisionById(clientId, decisionId);
      if (!result) return { error: `Decision ${decisionId} not found` };
      return result;
    } catch (err) {
      return { error: err instanceof Error ? err.message : String(err) };
    }
  },

  brain_list_people: async (input, clientId) => {
    try {
      const search = typeof input.search === 'string' ? input.search : undefined;
      const status = typeof input.status === 'string' ? input.status : undefined;
      const limit = typeof input.limit === 'number' ? Math.min(input.limit, 100) : 50;
      return await listPeople(clientId, {
        search,
        status: status as ListPeopleOpts['status'],
        limit,
      });
    } catch (err) {
      return { error: err instanceof Error ? err.message : String(err) };
    }
  },

  brain_lookup_glossary: async (input, clientId) => {
    try {
      const query = String(input.query ?? '').trim();
      if (!query) return { matches: [] };
      const limit = typeof input.limit === 'number' ? Math.min(input.limit, 25) : 5;
      return await lookupGlossary(clientId, query, { limit });
    } catch (err) {
      return { error: err instanceof Error ? err.message : String(err) };
    }
  },

  brain_list_glossary: async (input, clientId) => {
    try {
      const search = typeof input.search === 'string' ? input.search : undefined;
      const category = typeof input.category === 'string' ? input.category : undefined;
      const limit = typeof input.limit === 'number' ? Math.min(input.limit, 100) : 50;
      return await listGlossaryTerms(clientId, { search, category, limit, status: 'active' });
    } catch (err) {
      return { error: err instanceof Error ? err.message : String(err) };
    }
  },

  brain_list_initiatives: async (input, clientId) => {
    try {
      const status = typeof input.status === 'string' ? input.status : undefined;
      const limit = typeof input.limit === 'number' ? Math.min(input.limit, 200) : 25;
      return await listInitiatives(clientId, {
        status: status as ListInitiativesOpts['status'],
        limit,
      });
    } catch (err) {
      return { error: err instanceof Error ? err.message : String(err) };
    }
  },

  brain_list_tasks: async (input, clientId) => {
    try {
      const status = typeof input.status === 'string'
        ? input.status
        : 'open';
      const limit = typeof input.limit === 'number' ? Math.min(input.limit, 200) : 50;
      return await listTasks(clientId, {
        status: status as BrainTaskStatus,
        limit,
      });
    } catch (err) {
      return { error: err instanceof Error ? err.message : String(err) };
    }
  },

  brain_create_task: async (input, clientId, userId) => {
    try {
      const title = String(input.title ?? '').trim();
      if (!title) return { error: 'title is required' };
      const description = typeof input.description === 'string' ? input.description : undefined;
      const priority =
        typeof input.priority === 'string' &&
        ['low', 'medium', 'high', 'urgent'].includes(input.priority)
          ? (input.priority as 'low' | 'medium' | 'high' | 'urgent')
          : 'medium';
      const dueDate =
        typeof input.due_date === 'string' && input.due_date
          ? new Date(input.due_date)
          : null;
      return await createTask({
        clientId,
        title,
        description,
        priority,
        dueDate,
        source: 'manual',
        createdByAi: true,
        // UAG-004: flag live agent-created tasks for human review rather than
        // committing them silently as canonical truth.
        needsReview: true,
        createdBy: userId,
      });
    } catch (err) {
      return { error: err instanceof Error ? err.message : String(err) };
    }
  },

  brain_list_goals: async (input, clientId) => {
    try {
      const status = typeof input.status === 'string' ? input.status : undefined;
      const limit = typeof input.limit === 'number' ? Math.min(input.limit, 100) : 50;
      return await listGoals(clientId, {
        status: status as ListGoalsOpts['status'],
        limit,
      });
    } catch (err) {
      return { error: err instanceof Error ? err.message : String(err) };
    }
  },

  brain_get_goal: async (input, clientId) => {
    try {
      const goalId = Number(input.goal_id);
      if (!Number.isFinite(goalId)) return { error: 'goal_id must be a number' };
      const goal = await getGoalById(clientId, goalId);
      if (!goal) return { error: `Goal ${goalId} not found` };
      return goal;
    } catch (err) {
      return { error: err instanceof Error ? err.message : String(err) };
    }
  },

  brain_list_relationships: async (input, clientId) => {
    try {
      const type = typeof input.type === 'string' ? input.type : undefined;
      const limit = typeof input.limit === 'number' ? Math.min(input.limit, 500) : 50;
      return await listRelationships(clientId, { type, limit });
    } catch (err) {
      return { error: err instanceof Error ? err.message : String(err) };
    }
  },

  brain_get_relationship: async (input, clientId) => {
    try {
      const relationshipId = Number(input.relationship_id);
      if (!Number.isFinite(relationshipId)) return { error: 'relationship_id must be a number' };
      const rel = await getRelationship(clientId, relationshipId);
      if (!rel) return { error: `Relationship ${relationshipId} not found` };
      return rel;
    } catch (err) {
      return { error: err instanceof Error ? err.message : String(err) };
    }
  },

  brain_get_topic_tree: async (_input, clientId) => {
    try {
      return await getTopicTree(clientId);
    } catch (err) {
      return { error: err instanceof Error ? err.message : String(err) };
    }
  },

  brain_list_playbooks: async (input, clientId) => {
    try {
      const status = typeof input.status === 'string' ? input.status : undefined;
      const category = typeof input.category === 'string' ? input.category : undefined;
      const limit = typeof input.limit === 'number' ? Math.min(input.limit, 100) : 25;
      return await listPlaybooks(clientId, {
        status: status as ListPlaybooksOpts['status'],
        category,
        limit,
      });
    } catch (err) {
      return { error: err instanceof Error ? err.message : String(err) };
    }
  },

  brain_get_playbook: async (input, clientId) => {
    try {
      const playbookId = Number(input.playbook_id);
      if (!Number.isFinite(playbookId)) return { error: 'playbook_id must be a number' };
      const playbook = await getPlaybookById(clientId, playbookId);
      if (!playbook) return { error: `Playbook ${playbookId} not found` };
      return playbook;
    } catch (err) {
      return { error: err instanceof Error ? err.message : String(err) };
    }
  },

  brain_list_documents: async (input, clientId) => {
    try {
      const status = typeof input.status === 'string' ? input.status : undefined;
      const category = typeof input.category === 'string' ? input.category : undefined;
      const search = typeof input.search === 'string' ? input.search : undefined;
      const limit = typeof input.limit === 'number' ? Math.min(input.limit, 100) : 50;
      return await listDocuments(clientId, {
        status: status as ListDocumentsOpts['status'],
        category: category as ListDocumentsOpts['category'],
        search,
        limit,
      });
    } catch (err) {
      return { error: err instanceof Error ? err.message : String(err) };
    }
  },

  brain_get_document: async (input, clientId) => {
    try {
      const documentId = Number(input.document_id);
      if (!Number.isFinite(documentId)) return { error: 'document_id must be a number' };
      const doc = await getDocumentById(clientId, documentId);
      if (!doc) return { error: `Document ${documentId} not found` };
      return doc;
    } catch (err) {
      return { error: err instanceof Error ? err.message : String(err) };
    }
  },

  brain_get_org_chart: async (_input, clientId) => {
    try {
      return await getOrgUnitTree(clientId);
    } catch (err) {
      return { error: err instanceof Error ? err.message : String(err) };
    }
  },
};

// ─── Public executor ──────────────────────────────────────────────────────────

/**
 * Dispatch a brain tool call from the agent's tool-use loop.
 *
 * @param name     - Tool name from the Anthropic tool_use block
 * @param input    - Parsed input object from the tool_use block
 * @param clientId - Tenant ID resolved from the authenticated session
 * @param userId   - User ID resolved from the authenticated session
 * @returns        JSON.stringify'd result (always a string)
 */
export async function executeBrainTool(
  name: string,
  input: Record<string, unknown>,
  clientId: number,
  userId: number,
): Promise<string> {
  const handler = handlers[name];
  if (!handler) {
    return JSON.stringify({ error: `Unknown brain tool: ${name}` });
  }
  const result = await handler(input, clientId, userId);
  return sanitizeToolResult(JSON.stringify(result));
}
