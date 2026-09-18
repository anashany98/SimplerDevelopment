/**
 * Brain MCP adapter — CRM reads (companies, contacts, deals, posts)
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


export function registerBrainCrmReadsTools(server: McpServer, ctx: PortalMcpContext, clientId: number) {
  // ── READ — CRM companies ────────────────────────────────────────────────

  hasScope(ctx.scopes, 'brain:read') && server.registerTool(
    'brain_list_companies',
    {
      title: 'List CRM companies',
      description: 'List CRM companies for this tenant. Optional fuzzy search on name + domain. Use brain_search for semantic matching across all entity types; this is for browsing/filtering by structured fields.',
      inputSchema: {
        search: z.string().optional().describe('ILIKE on name and domain.'),
        industry: z.string().optional(),
        limit: z.number().int().min(1).max(200).optional(),
      },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:read')) return denied('brain:read');
      const { crmCompanies } = await import('@/lib/db/schema');
      const { and, eq, sql, ilike, or } = await import('drizzle-orm');
      const conds = [eq(crmCompanies.clientId, clientId)];
      if (args.industry) conds.push(eq(crmCompanies.industry, args.industry));
      if (args.search?.trim()) {
        const q = `%${args.search.trim()}%`;
        conds.push(sql`(${crmCompanies.name} ILIKE ${q} OR ${crmCompanies.domain} ILIKE ${q})`);
      }
      const rows = await db.select().from(crmCompanies)
        .where(and(...conds))
        .orderBy(crmCompanies.name)
        .limit(Math.max(1, Math.min(args.limit ?? 50, 200)));
      return json(rows);
    },
  );

  hasScope(ctx.scopes, 'brain:read') && server.registerTool(
    'brain_get_company',
    {
      title: 'Get CRM company',
      description: 'Get a CRM company with its linked contacts and open deals.',
      inputSchema: { companyId: z.number().int().positive() },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:read')) return denied('brain:read');
      const { crmCompanies, crmContacts, crmDeals } = await import('@/lib/db/schema');
      const { and, eq } = await import('drizzle-orm');
      const [company] = await db.select().from(crmCompanies)
        .where(and(eq(crmCompanies.clientId, clientId), eq(crmCompanies.id, args.companyId)))
        .limit(1);
      if (!company) return err('Company not found.');
      const [contacts, deals] = await Promise.all([
        db.select().from(crmContacts)
          .where(and(eq(crmContacts.clientId, clientId), eq(crmContacts.companyId, company.id))),
        db.select().from(crmDeals)
          .where(and(eq(crmDeals.clientId, clientId), eq(crmDeals.companyId, company.id))),
      ]);
      return json({ ...company, contacts, deals });
    },
  );

  // ── READ — CRM contacts ─────────────────────────────────────────────────

  hasScope(ctx.scopes, 'brain:read') && server.registerTool(
    'brain_list_contacts',
    {
      title: 'List CRM contacts',
      description: 'List CRM contacts. Optional filter by companyId or fuzzy search on name + email.',
      inputSchema: {
        search: z.string().optional().describe('ILIKE on first_name, last_name, email.'),
        companyId: z.number().int().positive().optional(),
        status: z.string().optional(),
        limit: z.number().int().min(1).max(200).optional(),
      },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:read')) return denied('brain:read');
      const { crmContacts } = await import('@/lib/db/schema');
      const { and, eq, sql } = await import('drizzle-orm');
      const conds = [eq(crmContacts.clientId, clientId)];
      if (args.companyId) conds.push(eq(crmContacts.companyId, args.companyId));
      if (args.status) conds.push(eq(crmContacts.status, args.status));
      if (args.search?.trim()) {
        const q = `%${args.search.trim()}%`;
        conds.push(sql`(${crmContacts.firstName} ILIKE ${q} OR ${crmContacts.lastName} ILIKE ${q} OR ${crmContacts.email} ILIKE ${q})`);
      }
      const rows = await db.select().from(crmContacts)
        .where(and(...conds))
        .orderBy(crmContacts.firstName)
        .limit(Math.max(1, Math.min(args.limit ?? 50, 200)));
      return json(rows);
    },
  );

  hasScope(ctx.scopes, 'brain:read') && server.registerTool(
    'brain_get_contact',
    {
      title: 'Get CRM contact',
      description: 'Get a CRM contact with their linked company and any open deals they own.',
      inputSchema: { contactId: z.number().int().positive() },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:read')) return denied('brain:read');
      const { crmContacts, crmCompanies, crmDeals } = await import('@/lib/db/schema');
      const { and, eq } = await import('drizzle-orm');
      const [contact] = await db.select().from(crmContacts)
        .where(and(eq(crmContacts.clientId, clientId), eq(crmContacts.id, args.contactId)))
        .limit(1);
      if (!contact) return err('Contact not found.');
      let company = null;
      if (contact.companyId) {
        const [c] = await db.select().from(crmCompanies)
          .where(eq(crmCompanies.id, contact.companyId)).limit(1);
        company = c ?? null;
      }
      const deals = await db.select().from(crmDeals)
        .where(and(eq(crmDeals.clientId, clientId), eq(crmDeals.contactId, contact.id)));
      return json({ ...contact, company, deals });
    },
  );

  // ── READ — CRM deals ─────────────────────────────────────────────────────

  hasScope(ctx.scopes, 'brain:read') && server.registerTool(
    'brain_list_deals',
    {
      title: 'List CRM deals',
      description: 'List CRM deals. Optional filter by status (open/won/lost), priority, or stageId.',
      inputSchema: {
        status: z.enum(['open', 'won', 'lost']).optional(),
        priority: z.enum(['low', 'medium', 'high']).optional(),
        stageId: z.number().int().positive().optional(),
        companyId: z.number().int().positive().optional(),
        limit: z.number().int().min(1).max(200).optional(),
      },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:read')) return denied('brain:read');
      const { crmDeals } = await import('@/lib/db/schema');
      const { and, eq, desc } = await import('drizzle-orm');
      const conds = [eq(crmDeals.clientId, clientId)];
      if (args.status) conds.push(eq(crmDeals.status, args.status));
      if (args.priority) conds.push(eq(crmDeals.priority, args.priority));
      if (args.stageId) conds.push(eq(crmDeals.stageId, args.stageId));
      if (args.companyId) conds.push(eq(crmDeals.companyId, args.companyId));
      const rows = await db.select().from(crmDeals)
        .where(and(...conds))
        .orderBy(desc(crmDeals.value))
        .limit(Math.max(1, Math.min(args.limit ?? 50, 200)));
      return json(rows);
    },
  );

  hasScope(ctx.scopes, 'brain:read') && server.registerTool(
    'brain_get_deal',
    {
      title: 'Get CRM deal',
      description: 'Get a CRM deal with its linked company, primary contact, and stage info.',
      inputSchema: { dealId: z.number().int().positive() },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:read')) return denied('brain:read');
      const { crmDeals, crmCompanies, crmContacts, crmPipelineStages } = await import('@/lib/db/schema');
      const { and, eq } = await import('drizzle-orm');
      const [deal] = await db.select().from(crmDeals)
        .where(and(eq(crmDeals.clientId, clientId), eq(crmDeals.id, args.dealId)))
        .limit(1);
      if (!deal) return err('Deal not found.');
      const [company, contact, stage] = await Promise.all([
        deal.companyId
          ? db.select().from(crmCompanies).where(eq(crmCompanies.id, deal.companyId)).limit(1).then(r => r[0] ?? null)
          : Promise.resolve(null),
        deal.contactId
          ? db.select().from(crmContacts).where(eq(crmContacts.id, deal.contactId)).limit(1).then(r => r[0] ?? null)
          : Promise.resolve(null),
        db.select().from(crmPipelineStages).where(eq(crmPipelineStages.id, deal.stageId)).limit(1).then(r => r[0] ?? null),
      ]);
      return json({ ...deal, company, contact, stage });
    },
  );

  // ── READ — Posts (website content) ──────────────────────────────────────

  hasScope(ctx.scopes, 'brain:read') && server.registerTool(
    'brain_list_posts',
    {
      title: 'List website posts/pages',
      description: 'List posts owned by this tenant via client_websites. Optional filter by websiteId, published flag, or post_type. Bodies are returned as serialized block JSON — call brain_get_post for the full record.',
      inputSchema: {
        websiteId: z.number().int().positive().optional(),
        published: z.boolean().optional(),
        postType: z.string().optional(),
        limit: z.number().int().min(1).max(200).optional(),
      },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:read')) return denied('brain:read');
      const { posts: postsTable, clientWebsites } = await import('@/lib/db/schema');
      const { and, eq, desc, inArray } = await import('drizzle-orm');
      // Tenancy: posts.website_id -> client_websites.client_id
      const websites = await db.select({ id: clientWebsites.id }).from(clientWebsites)
        .where(eq(clientWebsites.clientId, clientId));
      const websiteIds = websites.map(w => w.id);
      if (websiteIds.length === 0) return json([]);
      const conds = [inArray(postsTable.websiteId, websiteIds)];
      if (args.websiteId) conds.push(eq(postsTable.websiteId, args.websiteId));
      if (args.published !== undefined) conds.push(eq(postsTable.published, args.published));
      if (args.postType) conds.push(eq(postsTable.postType, args.postType));
      // Avoid returning the full body JSON in list responses — that can be
      // megabytes per row. Caller can fetch the full record via brain_get_post.
      const rows = await db.select({
        id: postsTable.id,
        title: postsTable.title,
        slug: postsTable.slug,
        postType: postsTable.postType,
        excerpt: postsTable.excerpt,
        published: postsTable.published,
        publishedAt: postsTable.publishedAt,
        websiteId: postsTable.websiteId,
        updatedAt: postsTable.updatedAt,
      }).from(postsTable)
        .where(and(...conds))
        .orderBy(desc(postsTable.updatedAt))
        .limit(Math.max(1, Math.min(args.limit ?? 50, 200)));
      return json(rows);
    },
  );

  hasScope(ctx.scopes, 'brain:read') && server.registerTool(
    'brain_get_post',
    {
      title: 'Get website post/page',
      description: 'Get a post including its full block JSON (posts.content). Validates tenancy via the website ownership.',
      inputSchema: { postId: z.number().int().positive() },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:read')) return denied('brain:read');
      const { posts: postsTable, clientWebsites } = await import('@/lib/db/schema');
      const { and, eq } = await import('drizzle-orm');
      const [post] = await db.select().from(postsTable)
        .where(eq(postsTable.id, args.postId)).limit(1);
      if (!post) return err('Post not found.');
      // Tenancy check
      if (post.websiteId === null) return err('Post not found.');
      const [w] = await db.select({ clientId: clientWebsites.clientId })
        .from(clientWebsites).where(eq(clientWebsites.id, post.websiteId)).limit(1);
      if (!w || w.clientId !== clientId) return err('Post not found.');
      return json(post);
    },
  );
}
