/**
 * MCP tools — crm proposals & contracts
 *
 * Split out of lib/mcp/tools/crm.ts to keep the per-domain registrar under
 * the god-file ratchet (scripts/check-file-budget.ts) and the function-size
 * budget. Behavior is unchanged from before the split.
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { and, desc, eq, ilike, inArray, isNull, or, sql, gte, lte } from 'drizzle-orm';
import crypto from 'crypto';
import { hash as hashPassword } from 'bcryptjs';
import { db } from '@/lib/db';
import {
  projects,
  kanbanCards,
  kanbanColumns,
  kanbanLabels,
  kanbanCardLabels,
  kanbanCardChecklistItems,
  kanbanCardAssignees,
  kanbanCardWatchers,
  kanbanCardDependencies,
  supportTickets,
  ticketMessages,
  crmContacts,
  crmCompanies,
  crmDeals,
  crmDealComments,
  crmPipelines,
  crmPipelineStages,
  posts,
  media,
  clientWebsites,
  emailLists,
  emailCampaigns,
  pitchDecks,
  brandingProfiles,
  emailSubscribers,
  emailCampaignSends,
  surveys,
  surveyResponses,
  bookingPages,
  bookings,
  sprints,
  crmActivities,
  categories,
  tags,
  postCategories,
  postTags,
  automationRules,
  clientMembers,
  users,
  crmProposals,
  crmContracts,
  crmContractSigners,
  invoices,
  invoiceItems,
  serviceRequests,
  suggestedProjectRequests,
  suggestedProjects,
  services,
  aiConversations,
  aiMessages,
  kanbanCardComments,
  kanbanCardTimeLogs,
  kanbanCardFiles,
  kanbanCardArtifacts,
  crmDealArtifacts,
  siteNavigation,
  postRevisions,
  blockTemplates,
  blockTemplateUsages,
  emailTemplates,
  emailSegments,
  giftCertificates,
  crmCustomFields,
  crmCustomFieldValues,
  crmSavedViews,
  crmScoringRules,
  websiteDomains,
  websiteEnvironments,
  websiteEnvVars,
  clients,
  aiCreditBalances,
  aiCreditLedger,
  hostedSites,
  googleWorkspaceUserConnections,
} from '@/lib/db/schema';
import type { SurveyFieldDef, ProposalSection, ProposalLineItem, ProposalFee, ContractClause, PitchDeckSlideV2 } from '@/lib/db/schema';
import type { PortalMcpContext } from '@/lib/mcp-auth';
import { hasScope } from '@/lib/mcp-auth';
import { logCardActivity } from '@/lib/pm-activity';
import { uploadToS3 } from '@/lib/s3/upload';
import { cleanEmbedHtml } from '@/lib/html-embed-clean';
import { importHtmlAssets } from '@/lib/html-asset-import';
import {
  renderBlocksToEmailHtml,
  resend,
  buildCampaignHtml,
  buildUnsubscribeUrl,
  generateUnsubscribeToken,
} from '@/lib/email';
import { executeCampaignSend } from '@/lib/email/campaign-send';
import { revoke as revokeGoogleToken } from '@/lib/google/oauth';
import { getTenantWorkspaceCredentialsByClientId } from '@/lib/google/tenant-credentials';
import { stageOrApply } from '../pending-changes';
import { BLOCKS_SCHEMA_REFERENCE } from '../blocks-schema';
import { extractMentions } from '@/lib/crm/extract-mentions';
import { createCrmNotification } from '@/lib/crm/notifications';
import {
  assertPipelineInClient,
  assertStageInClient,
  assertContactInClient,
  assertCompanyInClient,
  assertUserVisibleToClient,
  OwnershipError,
} from '@/lib/security/assert-owned';
import {
  json,
  serializePostContent,
  denied,
  extractRows,
  dbErrorEnvelope,
  requireScope,
  serviceDenied,
  requireService,
  assignBlockIds,
  revalidateForWrite,
} from '../types';
import {
  postProjection,
  deckProjection,
  campaignProjection,
} from '../projections';


export function registerCrmProposalsContractsTools(server: McpServer, ctx: PortalMcpContext): void {
  const clientId = ctx.client.id;

  // ── CRM PROPOSALS ──────────────────────────────────────────────────────
  // Keywords: proposal, quote, estimate, SOW, statement of work, bid.
  hasScope(ctx.scopes, 'crm:read') && server.registerTool(
    'proposals_list',
    {
      title: 'List CRM proposals / quotes',
      description: 'List proposals (quotes, estimates, SOWs) for the client. Filter by status or deal.',
      inputSchema: {
        status: z.enum(['draft', 'sent', 'viewed', 'accepted', 'declined', 'expired']).optional(),
        dealId: z.number().optional(),
        limit: z.number().min(1).max(200).default(50).optional(),
      },
    },
    async ({ status, dealId, limit = 50 }) => {
      if (!requireScope(ctx, 'crm:read')) return denied('crm:read');
      const conds = [eq(crmProposals.clientId, clientId)];
      if (status) conds.push(eq(crmProposals.status, status));
      if (dealId) conds.push(eq(crmProposals.dealId, dealId));
      const rows = await db.select({
        id: crmProposals.id,
        title: crmProposals.title,
        status: crmProposals.status,
        contactId: crmProposals.contactId,
        companyId: crmProposals.companyId,
        dealId: crmProposals.dealId,
        sentAt: crmProposals.sentAt,
        acceptedAt: crmProposals.acceptedAt,
        declinedAt: crmProposals.declinedAt,
        viewCount: crmProposals.viewCount,
        validUntil: crmProposals.validUntil,
        createdAt: crmProposals.createdAt,
        updatedAt: crmProposals.updatedAt,
      }).from(crmProposals).where(and(...conds))
        .orderBy(desc(crmProposals.updatedAt)).limit(limit);
      return json(rows);
    }
  );

  hasScope(ctx.scopes, 'crm:read') && server.registerTool(
    'proposals_get',
    {
      title: 'Get CRM proposal',
      description: 'Fetch a proposal with full sections, line items, fees, and signature status.',
      inputSchema: { id: z.number() },
    },
    async ({ id }) => {
      if (!requireScope(ctx, 'crm:read')) return denied('crm:read');
      const [row] = await db.select().from(crmProposals)
        .where(and(eq(crmProposals.id, id), eq(crmProposals.clientId, clientId))).limit(1);
      if (!row) return json({ error: 'Proposal not found' });
      return json(row);
    }
  );

  hasScope(ctx.scopes, 'crm:write') && server.registerTool(
    'proposals_create',
    {
      title: 'Create CRM proposal',
      description:
        'Create a new proposal (quote/estimate/SOW). Sections are { id, type: "text"|"heading"|"image"|"divider"|"pricing"|"terms"|"signature", title?, content?, imageUrl? }. Line items are { id, description, quantity, unitPrice (cents), optional? }. Fees are { label, type: "flat"|"percent", amount }. Starts in draft; use proposals_send to dispatch.',
      inputSchema: {
        title: z.string().min(1),
        summary: z.string().optional(),
        contactId: z.number().optional(),
        companyId: z.number().optional(),
        dealId: z.number().optional(),
        sections: z.array(z.any()).optional(),
        lineItems: z.array(z.any()).optional(),
        fees: z.array(z.any()).optional(),
        currency: z.string().optional(),
        validUntil: z.string().optional().describe('ISO date'),
        accentColor: z.string().optional(),
        logoUrl: z.string().optional(),
        coverImageUrl: z.string().optional(),
        footerText: z.string().optional(),
      },
    },
    async (args) => {
      if (!requireScope(ctx, 'crm:write')) return denied('crm:write');
      if (!(await requireService(clientId, 'crm'))) return serviceDenied('crm');
      const result = await stageOrApply({
        ctx,
        entityType: 'proposal',
        operation: 'create',
        entityId: null,
        summary: `Create proposal "${args.title}"${args.dealId ? ` (deal #${args.dealId})` : ''}`,
        payload: args,
        apply: async () => {
          const [row] = await db.insert(crmProposals).values({
            clientId,
            title: args.title.trim(),
            summary: args.summary ?? null,
            contactId: args.contactId ?? null,
            companyId: args.companyId ?? null,
            dealId: args.dealId ?? null,
            sections: (args.sections ?? []) as ProposalSection[],
            lineItems: (args.lineItems ?? []) as ProposalLineItem[],
            fees: (args.fees ?? []) as ProposalFee[],
            currency: args.currency ?? 'EUR',
            validUntil: args.validUntil ? new Date(args.validUntil) : null,
            clientToken: crypto.randomBytes(32).toString('hex'),
            accentColor: args.accentColor ?? '#2563eb',
            logoUrl: args.logoUrl ?? null,
            coverImageUrl: args.coverImageUrl ?? null,
            footerText: args.footerText ?? null,
            createdBy: ctx.userId,
          }).returning();
          return row;
        },
      });
      if (result.pending) return json({ pending: true, pendingId: result.pendingId, summary: result.summary, status: 'pending' });
      revalidateForWrite('portal');
      return json(result.data);
    }
  );

  hasScope(ctx.scopes, 'crm:write') && server.registerTool(
    'proposals_update',
    {
      title: 'Update CRM proposal',
      description: 'Update any field on a proposal. Use proposals_send to transition to sent; use status="declined"/"accepted" to record the outcome.',
      inputSchema: {
        id: z.number(),
        title: z.string().min(1).optional(),
        summary: z.string().nullable().optional(),
        status: z.enum(['draft', 'sent', 'viewed', 'accepted', 'declined', 'expired']).optional(),
        contactId: z.number().nullable().optional(),
        companyId: z.number().nullable().optional(),
        dealId: z.number().nullable().optional(),
        sections: z.array(z.any()).optional(),
        lineItems: z.array(z.any()).optional(),
        fees: z.array(z.any()).optional(),
        currency: z.string().optional(),
        validUntil: z.string().nullable().optional(),
        declineReason: z.string().nullable().optional(),
        accentColor: z.string().optional(),
        logoUrl: z.string().nullable().optional(),
        coverImageUrl: z.string().nullable().optional(),
        footerText: z.string().nullable().optional(),
      },
    },
    async ({ id, validUntil, sections, lineItems, fees, status, ...rest }) => {
      if (!requireScope(ctx, 'crm:write')) return denied('crm:write');
      if (!(await requireService(clientId, 'crm'))) return serviceDenied('crm');
      const [existing] = await db.select().from(crmProposals)
        .where(and(eq(crmProposals.id, id), eq(crmProposals.clientId, clientId))).limit(1);
      if (!existing) return json({ error: 'Proposal not found' });
      const result = await stageOrApply({
        ctx,
        entityType: 'proposal',
        operation: 'update',
        entityId: id,
        summary: `Update proposal #${id} "${existing.title}"${status ? ` → ${status}` : ''}`,
        payload: { id, validUntil, sections, lineItems, fees, status, ...rest },
        originalSnapshot: { title: existing.title, status: existing.status, summary: existing.summary },
        apply: async () => {
          const patch: Record<string, unknown> = { updatedAt: new Date() };
          for (const [k, v] of Object.entries(rest)) if (v !== undefined) patch[k] = v;
          if (sections !== undefined) patch.sections = sections as ProposalSection[];
          if (lineItems !== undefined) patch.lineItems = lineItems as ProposalLineItem[];
          if (fees !== undefined) patch.fees = fees as ProposalFee[];
          if (validUntil !== undefined) patch.validUntil = validUntil ? new Date(validUntil) : null;
          if (status !== undefined) {
            patch.status = status;
            if (status === 'accepted' && existing.status !== 'accepted') patch.acceptedAt = new Date();
            if (status === 'declined' && existing.status !== 'declined') patch.declinedAt = new Date();
          }
          const [row] = await db.update(crmProposals).set(patch)
            .where(eq(crmProposals.id, id)).returning();
          return row;
        },
      });
      if (result.pending) return json({ pending: true, pendingId: result.pendingId, summary: result.summary, status: 'pending' });
      revalidateForWrite('portal');
      return json(result.data);
    }
  );

  hasScope(ctx.scopes, 'crm:write') && server.registerTool(
    'proposals_send',
    {
      title: 'Mark proposal as sent',
      description:
        'Transition a proposal from draft to sent. Stamps sentAt. NOTE: this updates portal state only — it does NOT email the proposal. Use the portal UI for email delivery or fetch the proposal URL via get and share it manually.',
      inputSchema: { id: z.number() },
    },
    async ({ id }) => {
      if (!requireScope(ctx, 'crm:write')) return denied('crm:write');
      if (!(await requireService(clientId, 'crm'))) return serviceDenied('crm');
      const [existing] = await db.select({ id: crmProposals.id, title: crmProposals.title, status: crmProposals.status })
        .from(crmProposals)
        .where(and(eq(crmProposals.id, id), eq(crmProposals.clientId, clientId))).limit(1);
      if (!existing) return json({ error: 'Proposal not found' });
      if (existing.status !== 'draft') return json({ error: `Cannot send — current status is ${existing.status}` });
      const result = await stageOrApply({
        ctx,
        entityType: 'proposal',
        operation: 'send',
        entityId: id,
        summary: `Send proposal #${id} "${existing.title}"`,
        payload: { id },
        originalSnapshot: { status: existing.status },
        apply: async () => {
          const [row] = await db.update(crmProposals)
            .set({ status: 'sent', sentAt: new Date(), updatedAt: new Date() })
            .where(eq(crmProposals.id, id)).returning();
          return row;
        },
      });
      if (result.pending) return json({ pending: true, pendingId: result.pendingId, summary: result.summary, status: 'pending' });
      revalidateForWrite('portal');
      return json(result.data);
    }
  );


  // ── CRM CONTRACTS ──────────────────────────────────────────────────────
  // Keywords: contract, agreement, MSA, e-signature, signature, sign.
  hasScope(ctx.scopes, 'crm:read') && server.registerTool(
    'contracts_list',
    {
      title: 'List CRM contracts',
      description: 'List contracts / agreements for the client. Filter by status or linked proposal.',
      inputSchema: {
        status: z.enum(['draft', 'sent', 'partially_signed', 'fully_executed', 'voided', 'expired']).optional(),
        proposalId: z.number().optional(),
        limit: z.number().min(1).max(200).default(50).optional(),
      },
    },
    async ({ status, proposalId, limit = 50 }) => {
      if (!requireScope(ctx, 'crm:read')) return denied('crm:read');
      const conds = [eq(crmContracts.clientId, clientId)];
      if (status) conds.push(eq(crmContracts.status, status));
      if (proposalId) conds.push(eq(crmContracts.proposalId, proposalId));
      const rows = await db.select({
        id: crmContracts.id,
        title: crmContracts.title,
        status: crmContracts.status,
        proposalId: crmContracts.proposalId,
        dealId: crmContracts.dealId,
        sentAt: crmContracts.sentAt,
        fullyExecutedAt: crmContracts.fullyExecutedAt,
        voidedAt: crmContracts.voidedAt,
        validUntil: crmContracts.validUntil,
        createdAt: crmContracts.createdAt,
        updatedAt: crmContracts.updatedAt,
      }).from(crmContracts).where(and(...conds))
        .orderBy(desc(crmContracts.updatedAt)).limit(limit);
      return json(rows);
    }
  );

  hasScope(ctx.scopes, 'crm:read') && server.registerTool(
    'contracts_get',
    {
      title: 'Get CRM contract with signers',
      description: 'Fetch contract + all signer records (name, email, status, signedAt).',
      inputSchema: { id: z.number() },
    },
    async ({ id }) => {
      if (!requireScope(ctx, 'crm:read')) return denied('crm:read');
      const [contract] = await db.select().from(crmContracts)
        .where(and(eq(crmContracts.id, id), eq(crmContracts.clientId, clientId))).limit(1);
      if (!contract) return json({ error: 'Contract not found' });
      const signers = await db.select().from(crmContractSigners)
        .where(eq(crmContractSigners.contractId, id))
        .orderBy(crmContractSigners.order);
      return json({ contract, signers });
    }
  );

  hasScope(ctx.scopes, 'crm:write') && server.registerTool(
    'contracts_create',
    {
      title: 'Create CRM contract',
      description:
        'Create a contract / agreement. Clauses = { id, title, content, required }. Signers = { name, email, role?, order? } — each gets a unique signing token. Starts in draft.',
      inputSchema: {
        title: z.string().min(1),
        summary: z.string().optional(),
        proposalId: z.number().optional(),
        dealId: z.number().optional(),
        contactId: z.number().optional(),
        companyId: z.number().optional(),
        clauses: z.array(z.any()).optional(),
        lineItems: z.array(z.any()).optional(),
        fees: z.array(z.any()).optional(),
        currency: z.string().optional(),
        validUntil: z.string().optional(),
        signers: z.array(z.object({
          name: z.string().min(1),
          email: z.string().email(),
          role: z.enum(['signer', 'witness', 'approver']).optional(),
          order: z.number().optional(),
        })).optional(),
        accentColor: z.string().optional(),
        logoUrl: z.string().optional(),
        footerText: z.string().optional(),
      },
    },
    async (args) => {
      if (!requireScope(ctx, 'crm:write')) return denied('crm:write');
      if (!(await requireService(clientId, 'crm'))) return serviceDenied('crm');
      const [contract] = await db.insert(crmContracts).values({
        clientId,
        proposalId: args.proposalId ?? null,
        dealId: args.dealId ?? null,
        contactId: args.contactId ?? null,
        companyId: args.companyId ?? null,
        title: args.title.trim(),
        summary: args.summary ?? null,
        clauses: (args.clauses ?? []) as ContractClause[],
        lineItems: (args.lineItems ?? []) as ProposalLineItem[],
        fees: (args.fees ?? []) as ProposalFee[],
        currency: args.currency ?? 'EUR',
        validUntil: args.validUntil ? new Date(args.validUntil) : null,
        clientToken: crypto.randomBytes(32).toString('hex'),
        accentColor: args.accentColor ?? '#2563eb',
        logoUrl: args.logoUrl ?? null,
        footerText: args.footerText ?? null,
        createdBy: ctx.userId,
      }).returning();
      const insertedSigners = args.signers && args.signers.length > 0
        ? await db.insert(crmContractSigners).values(args.signers.map((s, i) => ({
            contractId: contract.id,
            name: s.name.trim(),
            email: s.email.trim().toLowerCase(),
            role: s.role ?? 'signer',
            order: s.order ?? i,
            token: crypto.randomBytes(32).toString('hex'),
          }))).returning()
        : [];
      revalidateForWrite('portal');
      return json({ contract, signers: insertedSigners });
    }
  );

  hasScope(ctx.scopes, 'crm:delete') && server.registerTool(
    'contracts_void',
    {
      title: 'Void contract',
      description: 'Mark a contract as voided (not executable). Stamps voidedAt + reason. Cannot be undone via MCP.',
      inputSchema: {
        id: z.number(),
        reason: z.string().optional(),
      },
    },
    async ({ id, reason }) => {
      if (!requireScope(ctx, 'crm:delete')) return denied('crm:delete');
      if (!(await requireService(clientId, 'crm'))) return serviceDenied('crm');
      const [existing] = await db.select({ id: crmContracts.id, status: crmContracts.status })
        .from(crmContracts)
        .where(and(eq(crmContracts.id, id), eq(crmContracts.clientId, clientId))).limit(1);
      if (!existing) return json({ error: 'Contract not found' });
      if (existing.status === 'voided') return json({ error: 'Already voided' });
      if (existing.status === 'fully_executed') return json({ error: 'Cannot void — already fully executed' });
      const [row] = await db.update(crmContracts)
        .set({ status: 'voided', voidedAt: new Date(), voidReason: reason ?? null, updatedAt: new Date() })
        .where(eq(crmContracts.id, id)).returning();
      revalidateForWrite('portal');
      return json(row);
    }
  );
}
