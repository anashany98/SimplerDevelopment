/**
 * Brain MCP adapter — Decisions domain.
 *
 * Extracted from lib/brain/mcp-sdk-adapter.ts (BRAIN — DECISIONS section) so
 * the 5k-line registrar decomposes domain by domain. Registered by the main
 * `registerBrainToolsOnSdk` — never imported by any other adapter.
 *
 * Token-budget conventions enforced here:
 *   - List rows omit the heavy text fields (context / rationale / decision /
 *     alternativesConsidered) by default. Each is opt-in via `include`.
 *   - get-by-id keeps the same heavy-text gating (the helper returns the row
 *     in full but we project it down before serializing). Chain summary rows
 *     are always slim.
 *   - Write echoes return just identity + changed-field metadata.
 *   - `limit` is capped at 100 on every paginated tool.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import type { BrainDecisionReversibility, BrainDecisionStatus } from '@/lib/db/schema';
import { hasScope, type PortalMcpContext } from '@/lib/mcp-auth';
import { denied, json } from '@/lib/mcp/types';
import { err } from './shared';
import {
  createDecision,
  getDecisionById,
  listDecisions,
  softRejectDecision,
  supersedeDecision,
  updateDecision,
  type CreateDecisionInput,
  type ListDecisionsOpts,
} from '../decisions';

export function registerDecisionBrainTools(server: McpServer, ctx: PortalMcpContext, clientId: number) {
  type DecisionRow = Awaited<ReturnType<typeof listDecisions>>[number];
  const slimDecisionRow = (
    d: DecisionRow,
    include: ReadonlyArray<'context' | 'rationale' | 'decision' | 'alternatives'> | undefined,
  ) => {
    const inc = new Set(include ?? []);
    const base = {
      id: d.id,
      title: d.title,
      status: d.status as BrainDecisionStatus,
      reversibility: d.reversibility as BrainDecisionReversibility,
      decidedAt: d.decidedAt,
      supersededByDecisionId: d.supersededByDecisionId,
      anchors: {
        meetingId: d.meetingId,
        noteId: d.noteId,
        companyId: d.companyId,
        dealId: d.dealId,
      },
      decisionMakerId: d.decisionMakerId,
    };
    return {
      ...base,
      ...(inc.has('context') ? { context: d.context } : {}),
      ...(inc.has('rationale') ? { rationale: d.rationale } : {}),
      ...(inc.has('decision') ? { decision: d.decision } : {}),
      ...(inc.has('alternatives') ? { alternativesConsidered: d.alternativesConsidered } : {}),
    };
  };

  hasScope(ctx.scopes, 'brain:read') && server.registerTool(
    'brain_decisions_list',
    {
      title: 'List Brain decisions',
      description: 'List decisions with optional filters (status, reversibility, decision-maker, date range, supersededOnly, topicId). Slim by default — heavy text fields (context, rationale, decision text, alternatives) are opt-in via `include`. Paginated via { items, total, limit, offset }; limit capped at 100.',
      inputSchema: {
        status: z.enum(['proposed', 'accepted', 'superseded', 'rejected']).optional(),
        reversibility: z.enum(['one_way', 'two_way']).optional(),
        decisionMakerId: z.number().int().positive().optional(),
        dateFrom: z.string().optional().describe('ISO date — decidedAt >= this.'),
        dateTo: z.string().optional().describe('ISO date — decidedAt <= this.'),
        supersededOnly: z.boolean().optional(),
        topicId: z.number().int().positive().optional().describe('Currently a no-op pass-through; helper has a TODO to JOIN brain_entity_topics. Accepted without erroring so callers can future-proof.'),
        limit: z.number().int().min(1).max(100).optional(),
        offset: z.number().int().min(0).optional(),
        include: z.array(z.enum(['context', 'rationale', 'decision', 'alternatives'])).optional(),
      },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:read')) return denied('brain:read');
      const limit = args.limit ?? 50;
      const offset = args.offset ?? 0;
      const opts: ListDecisionsOpts = {
        status: args.status,
        reversibility: args.reversibility,
        decisionMakerId: args.decisionMakerId,
        dateFrom: args.dateFrom ? new Date(args.dateFrom) : undefined,
        dateTo: args.dateTo ? new Date(args.dateTo) : undefined,
        supersededOnly: args.supersededOnly,
        topicId: args.topicId,
        limit,
        offset,
      };
      const [rows, totalRows] = await Promise.all([
        listDecisions(clientId, opts),
        // Count is a cheap parallel query — keep it slim so list responses
        // can drive pagination UIs without a second round-trip.
        (async () => {
          const { brainDecisions } = await import('@/lib/db/schema');
          const conds = [eq(brainDecisions.clientId, clientId)];
          if (args.status) conds.push(eq(brainDecisions.status, args.status));
          if (args.reversibility) conds.push(eq(brainDecisions.reversibility, args.reversibility));
          if (args.decisionMakerId !== undefined) conds.push(eq(brainDecisions.decisionMakerId, args.decisionMakerId));
          if (args.supersededOnly) conds.push(eq(brainDecisions.status, 'superseded'));
          const [r] = await db.select({ count: sql<number>`count(*)::int` })
            .from(brainDecisions).where(and(...conds));
          return Number(r?.count ?? 0);
        })(),
      ]);
      return json({
        items: rows.map((d) => slimDecisionRow(d, args.include)),
        total: totalRows,
        limit,
        offset,
      });
    },
  );

  hasScope(ctx.scopes, 'brain:read') && server.registerTool(
    'brain_decisions_get',
    {
      title: 'Get a Brain decision',
      description: 'Fetch a decision by id with its supersedes chain (ancestors + descendants). Heavy text fields (context, rationale, decision, alternatives) are opt-in via `include` to stay token-light; chain summary rows are always slim ({ id, title, decidedAt, status }).',
      inputSchema: {
        id: z.number().int().positive(),
        include: z.array(z.enum(['context', 'rationale', 'decision', 'alternatives'])).optional(),
      },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:read')) return denied('brain:read');
      const out = await getDecisionById(clientId, args.id);
      if (!out) return err('Decision not found.');
      return json({
        decision: slimDecisionRow(out.decision, args.include),
        ancestors: out.ancestors,
        descendants: out.descendants,
      });
    },
  );

  hasScope(ctx.scopes, 'brain:write') && server.registerTool(
    'brain_decisions_create',
    {
      title: 'Create a Brain decision',
      description: 'Create a new accepted decision. Heavy text fields (decision, rationale, context, alternativesConsidered) live in the input; the echo is slim ({ id, status, decidedAt }) so the caller does not round-trip the prose it just authored. AUDITED.',
      inputSchema: {
        title: z.string().min(1).max(255),
        context: z.string().nullable().optional(),
        decision: z.string().min(1),
        rationale: z.string().min(1),
        alternativesConsidered: z.string().nullable().optional(),
        reversibility: z.enum(['one_way', 'two_way']).optional(),
        decidedAt: z.string().optional().describe('ISO timestamp; defaults to now.'),
        decisionMakerId: z.number().int().positive().nullable().optional(),
        anchors: z.object({
          meetingId: z.number().int().positive().nullable().optional(),
          noteId: z.number().int().positive().nullable().optional(),
          companyId: z.number().int().positive().nullable().optional(),
          dealId: z.number().int().positive().nullable().optional(),
        }).optional(),
        confidentialityLevel: z.enum(['standard', 'restricted', 'confidential']).optional(),
      },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:write')) return denied('brain:write');
      try {
        const input: CreateDecisionInput = {
          title: args.title,
          context: args.context ?? null,
          decision: args.decision,
          rationale: args.rationale,
          alternativesConsidered: args.alternativesConsidered ?? null,
          reversibility: args.reversibility,
          decidedAt: args.decidedAt,
          decisionMakerId: args.decisionMakerId ?? null,
          anchors: args.anchors,
          confidentialityLevel: args.confidentialityLevel,
        };
        const created = await createDecision(clientId, ctx.userId, input);
        return json({ id: created.id, status: created.status, decidedAt: created.decidedAt });
      } catch (e) {
        return err(e instanceof Error ? e.message : 'Failed to create decision.');
      }
    },
  );

  hasScope(ctx.scopes, 'brain:write') && server.registerTool(
    'brain_decisions_update',
    {
      title: 'Update a Brain decision (metadata only)',
      description: 'Patch mutable fields (title, context, decisionMakerId, anchors, confidentialityLevel, alternativesConsidered) on an existing decision. Attempts to mutate `decision`, `rationale`, or `reversibility` are REJECTED — those changes require `brain_decisions_supersede` (immutable history). Echo is { id, updatedFields }. AUDITED.',
      inputSchema: {
        id: z.number().int().positive(),
        patch: z.object({
          title: z.string().min(1).max(255).optional(),
          context: z.string().nullable().optional(),
          decisionMakerId: z.number().int().positive().nullable().optional(),
          anchors: z.object({
            meetingId: z.number().int().positive().nullable().optional(),
            noteId: z.number().int().positive().nullable().optional(),
            companyId: z.number().int().positive().nullable().optional(),
            dealId: z.number().int().positive().nullable().optional(),
          }).optional(),
          confidentialityLevel: z.enum(['standard', 'restricted', 'confidential']).optional(),
          alternativesConsidered: z.string().nullable().optional(),
        }),
      },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:write')) return denied('brain:write');
      try {
        const before = await getDecisionById(clientId, args.id);
        if (!before) return err('Decision not found.');
        const updated = await updateDecision(clientId, ctx.userId, args.id, args.patch);
        if (!updated) return err('Decision not found.');
        const changed: string[] = [];
        if (args.patch.title !== undefined && updated.title !== before.decision.title) changed.push('title');
        if (args.patch.context !== undefined && updated.context !== before.decision.context) changed.push('context');
        if (args.patch.decisionMakerId !== undefined && updated.decisionMakerId !== before.decision.decisionMakerId) changed.push('decisionMakerId');
        if (args.patch.confidentialityLevel !== undefined && updated.confidentialityLevel !== before.decision.confidentialityLevel) changed.push('confidentialityLevel');
        if (args.patch.alternativesConsidered !== undefined && updated.alternativesConsidered !== before.decision.alternativesConsidered) changed.push('alternativesConsidered');
        if (args.patch.anchors) {
          const a = args.patch.anchors;
          if (a.meetingId !== undefined && updated.meetingId !== before.decision.meetingId) changed.push('meetingId');
          if (a.noteId !== undefined && updated.noteId !== before.decision.noteId) changed.push('noteId');
          if (a.companyId !== undefined && updated.companyId !== before.decision.companyId) changed.push('companyId');
          if (a.dealId !== undefined && updated.dealId !== before.decision.dealId) changed.push('dealId');
        }
        return json({ id: updated.id, updatedFields: changed });
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Failed to update decision.';
        if (msg.includes('supersedeDecision')) {
          return json({
            error: 'use_supersede',
            message: 'Cannot mutate rationale, decision text, or reversibility in place. Call brain_decisions_supersede to create a successor decision linked to this one.',
          });
        }
        return err(msg);
      }
    },
  );

  hasScope(ctx.scopes, 'brain:write') && server.registerTool(
    'brain_decisions_supersede',
    {
      title: 'Supersede a Brain decision',
      description: 'Atomically create a successor decision and link it back to the old one (old.status → "superseded", old.supersededByDecisionId → new.id). Use this whenever you need to change rationale, decision text, or reversibility. Echo: { previous, current }. AUDITED.',
      inputSchema: {
        oldId: z.number().int().positive(),
        title: z.string().min(1).max(255),
        context: z.string().nullable().optional(),
        decision: z.string().min(1),
        rationale: z.string().min(1),
        alternativesConsidered: z.string().nullable().optional(),
        reversibility: z.enum(['one_way', 'two_way']).optional(),
        decidedAt: z.string().optional(),
        decisionMakerId: z.number().int().positive().nullable().optional(),
        anchors: z.object({
          meetingId: z.number().int().positive().nullable().optional(),
          noteId: z.number().int().positive().nullable().optional(),
          companyId: z.number().int().positive().nullable().optional(),
          dealId: z.number().int().positive().nullable().optional(),
        }).optional(),
        confidentialityLevel: z.enum(['standard', 'restricted', 'confidential']).optional(),
      },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:write')) return denied('brain:write');
      try {
        const created = await supersedeDecision(clientId, ctx.userId, args.oldId, {
          title: args.title,
          context: args.context ?? null,
          decision: args.decision,
          rationale: args.rationale,
          alternativesConsidered: args.alternativesConsidered ?? null,
          reversibility: args.reversibility,
          decidedAt: args.decidedAt,
          decisionMakerId: args.decisionMakerId ?? null,
          anchors: args.anchors,
          confidentialityLevel: args.confidentialityLevel,
        });
        return json({
          previous: { id: args.oldId, status: 'superseded' as const },
          current: { id: created.id, status: created.status, decidedAt: created.decidedAt },
        });
      } catch (e) {
        return err(e instanceof Error ? e.message : 'Failed to supersede decision.');
      }
    },
  );

  hasScope(ctx.scopes, 'brain:write') && server.registerTool(
    'brain_decisions_reject',
    {
      title: 'Soft-reject a Brain decision',
      description: 'Soft-delete by transitioning status → "rejected". Decisions are immutable history — no row is ever DELETEd. Idempotent. AUDITED.',
      inputSchema: {
        id: z.number().int().positive(),
        reason: z.string().max(500).optional(),
      },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:write')) return denied('brain:write');
      const updated = await softRejectDecision(clientId, ctx.userId, args.id, args.reason);
      if (!updated) return err('Decision not found.');
      return json({ id: updated.id, status: 'rejected' as const });
    },
  );
}
