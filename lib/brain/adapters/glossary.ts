/**
 * Brain MCP adapter — Glossary domain.
 *
 * Extracted from lib/brain/mcp-sdk-adapter.ts (BRAIN — GLOSSARY section) so
 * the registrar decomposes domain by domain. Registered by the main
 * `registerBrainToolsOnSdk` — never imported by any other adapter.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { hasScope, type PortalMcpContext } from '@/lib/mcp-auth';
import { denied, json } from '@/lib/mcp/types';
import { err } from './shared';
import {
  bulkImportGlossary,
  createGlossaryTerm,
  deleteGlossaryTerm,
  getGlossaryTermById,
  listGlossaryTerms,
  lookupGlossary,
  updateGlossaryTerm,
} from '../glossary';

export function registerGlossaryBrainTools(server: McpServer, ctx: PortalMcpContext, clientId: number) {
  hasScope(ctx.scopes, 'brain:read') && server.registerTool(
    'brain_glossary_list',
    {
      title: 'List Brain glossary terms',
      description: 'List tenant glossary terms (acronyms, codenames, jargon). Slim by default: returns id, term, slug, shortDefinition, status, category, ownerId, aliasCount. To receive full `definition` and full `aliases`, pass include=["definition"] / ["aliases"]. Filters: status, category, search, ownerId. Cap limit 100.',
      inputSchema: {
        status: z.enum(['active', 'deprecated']).optional(),
        category: z.string().optional(),
        search: z.string().optional().describe('Substring match on term, aliases, and definition.'),
        ownerId: z.number().int().positive().optional(),
        limit: z.number().int().min(1).max(100).optional(),
        offset: z.number().int().min(0).optional(),
        include: z.array(z.enum(['definition', 'aliases'])).optional(),
      },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:read')) return denied('brain:read');
      const slim = await listGlossaryTerms(clientId, {
        status: args.status,
        category: args.category,
        search: args.search,
        ownerId: args.ownerId,
        limit: args.limit,
        offset: args.offset,
      });
      const include = new Set(args.include ?? []);
      if (include.size === 0) {
        return json(slim);
      }
      // Heavy include: hydrate by looking up full rows for the slim page.
      // Bounded by the same limit so token cost stays predictable.
      const { db } = await import('@/lib/db');
      const { brainGlossaryTerms } = await import('@/lib/db/schema');
      const { and, eq, inArray } = await import('drizzle-orm');
      const ids = slim.items.map((r) => r.id);
      const heavy = ids.length > 0
        ? await db.select({
            id: brainGlossaryTerms.id,
            definition: brainGlossaryTerms.definition,
            aliases: brainGlossaryTerms.aliases,
          })
          .from(brainGlossaryTerms)
          .where(and(
            eq(brainGlossaryTerms.clientId, clientId),
            inArray(brainGlossaryTerms.id, ids),
          ))
        : [];
      const byId = new Map(heavy.map((h) => [h.id, h]));
      const items = slim.items.map((r) => {
        const h = byId.get(r.id);
        return {
          ...r,
          ...(include.has('definition') ? { definition: h?.definition ?? null } : {}),
          ...(include.has('aliases') ? { aliases: h?.aliases ?? [] } : {}),
        };
      });
      return json({ ...slim, items });
    },
  );

  hasScope(ctx.scopes, 'brain:read') && server.registerTool(
    'brain_glossary_get',
    {
      title: 'Get a Brain glossary term with related terms',
      description: 'Fetch a single term + its "see also" related terms (joined from the relatedTermIds JSON array, cross-tenant ids filtered out). Slim by default — omits full `definition` and `aliases` from the main term unless `include` is passed. Related terms are always slim (id/term/slug/shortDefinition).',
      inputSchema: {
        id: z.number().int().positive(),
        include: z.array(z.enum(['definition', 'aliases'])).optional(),
      },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:read')) return denied('brain:read');
      const detail = await getGlossaryTermById(clientId, args.id);
      if (!detail) return err('Glossary term not found.');
      const include = new Set(args.include ?? []);
      const t = detail.term;
      return json({
        term: {
          id: t.id,
          term: t.term,
          slug: t.slug,
          shortDefinition: t.shortDefinition,
          status: t.status,
          category: t.category,
          ownerId: t.ownerId,
          source: t.source,
          createdAt: t.createdAt,
          updatedAt: t.updatedAt,
          aliasCount: Array.isArray(t.aliases) ? t.aliases.length : 0,
          relatedTermIdCount: Array.isArray(t.relatedTermIds) ? t.relatedTermIds.length : 0,
          ...(include.has('definition') ? { definition: t.definition } : {}),
          ...(include.has('aliases') ? { aliases: t.aliases } : {}),
        },
        relatedTerms: detail.relatedTerms,
      });
    },
  );

  hasScope(ctx.scopes, 'brain:read') && server.registerTool(
    'brain_glossary_lookup',
    {
      title: 'Look up Brain glossary terms by query',
      description: 'The marquee tool: substring + alias-array match against ACTIVE glossary terms with a scored ranking (exact term 10 / exact alias 8 / term prefix 5 / alias prefix 4 / term substring 3 / alias substring 2 / definition substring 1). Use BEFORE answering any factual question that may contain tenant-specific acronyms or codenames so the workspace\'s preferred definition is used. Cap limit 25, default 10.',
      inputSchema: {
        query: z.string().min(1).max(200),
        limit: z.number().int().min(1).max(25).optional(),
      },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:read')) return denied('brain:read');
      const out = await lookupGlossary(clientId, args.query, { limit: args.limit });
      return json(out);
    },
  );

  // ── GLOSSARY — write ─────────────────────────────────────────────────────

  hasScope(ctx.scopes, 'brain:write') && server.registerTool(
    'brain_glossary_create',
    {
      title: 'Create a Brain glossary term',
      description: 'Add a new term. Slug is auto-derived from `term` (lowercase, dash-separated); collisions per tenant suffix `-2`, `-3`, …. Default status="active", source="manual", aliases=[], relatedTermIds=[]. Echoes { id, slug } only — call brain_glossary_get for the full row.',
      inputSchema: {
        term: z.string().min(1).max(200),
        definition: z.string().min(1),
        shortDefinition: z.string().max(500).optional(),
        aliases: z.array(z.string()).optional(),
        status: z.enum(['active', 'deprecated']).optional(),
        category: z.string().max(100).optional(),
        ownerId: z.number().int().positive().optional(),
        relatedTermIds: z.array(z.number().int().positive()).optional(),
        source: z.enum(['manual', 'ai_suggested']).optional(),
      },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:write')) return denied('brain:write');
      try {
        const created = await createGlossaryTerm(clientId, ctx.userId, {
          term: args.term,
          definition: args.definition,
          shortDefinition: args.shortDefinition,
          aliases: args.aliases,
          status: args.status,
          category: args.category,
          ownerId: args.ownerId,
          relatedTermIds: args.relatedTermIds,
          source: args.source,
        });
        return json({ id: created.id, slug: created.slug });
      } catch (e) {
        return err(e instanceof Error ? e.message : 'Failed to create glossary term.');
      }
    },
  );

  hasScope(ctx.scopes, 'brain:write') && server.registerTool(
    'brain_glossary_update',
    {
      title: 'Update a Brain glossary term',
      description: 'Patch any field on a glossary term EXCEPT slug (which is stable for external URLs). Echoes { id, updatedFields }.',
      inputSchema: {
        id: z.number().int().positive(),
        patch: z.object({
          term: z.string().min(1).max(200).optional(),
          definition: z.string().min(1).optional(),
          shortDefinition: z.string().max(500).nullable().optional(),
          aliases: z.array(z.string()).optional(),
          status: z.enum(['active', 'deprecated']).optional(),
          category: z.string().max(100).nullable().optional(),
          ownerId: z.number().int().positive().nullable().optional(),
          relatedTermIds: z.array(z.number().int().positive()).optional(),
        }),
      },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:write')) return denied('brain:write');
      const updated = await updateGlossaryTerm(clientId, ctx.userId, args.id, args.patch);
      if (!updated) return err('Glossary term not found.');
      return json({ id: updated.id, updatedFields: Object.keys(args.patch) });
    },
  );

  hasScope(ctx.scopes, 'brain:write') && server.registerTool(
    'brain_glossary_delete',
    {
      title: 'Delete a Brain glossary term',
      description: 'Hard delete. Also prunes this id from every OTHER term\'s relatedTermIds list. Audit row written before the delete. Echoes { id, deleted, prunedRelatedTermFromCount }.',
      inputSchema: {
        id: z.number().int().positive(),
      },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:write')) return denied('brain:write');
      const out = await deleteGlossaryTerm(clientId, ctx.userId, args.id);
      if (!out.deleted) return err('Glossary term not found.');
      return json({
        id: args.id,
        deleted: true,
        prunedRelatedTermFromCount: out.prunedRelatedTermFromCount,
      });
    },
  );

  hasScope(ctx.scopes, 'brain:write') && server.registerTool(
    'brain_glossary_bulk_import',
    {
      title: 'Bulk import / upsert Brain glossary terms',
      description: 'Insert or update up to 200 terms in one call. Upsert is per-tenant on slug (auto-derived from `term`) — existing rows have their definition/shortDefinition/aliases/category replaced; new rows are inserted with status="active" and source="manual". A single audit row is written after the batch. Echoes { created, updated, errors }.',
      inputSchema: {
        terms: z.array(z.object({
          term: z.string().min(1).max(200),
          definition: z.string().min(1),
          shortDefinition: z.string().max(500).optional(),
          aliases: z.array(z.string()).optional(),
          category: z.string().max(100).optional(),
        })).min(1).max(200),
      },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:write')) return denied('brain:write');
      try {
        const out = await bulkImportGlossary(clientId, ctx.userId, { terms: args.terms });
        return json({ created: out.created, updated: out.updated, errors: out.errors });
      } catch (e) {
        return err(e instanceof Error ? e.message : 'Bulk import failed.');
      }
    },
  );
}
