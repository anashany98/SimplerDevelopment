/**
 * Brain MCP adapter — Topics domain.
 *
 * Extracted from lib/brain/mcp-sdk-adapter.ts (BRAIN — TOPICS section) so the
 * registrar decomposes domain by domain. Registered by the main
 * `registerBrainToolsOnSdk` — never imported by any other adapter.
 *
 * Token-budget conventions:
 *   - List/tree responses omit `description` (a free-form text field) by
 *     default — opt in via `includeDescriptions` / `includeDescription`.
 *   - Tree nodes carry `childCount` + `entityCount` for badge UIs without
 *     forcing the caller to fetch entities or descendants separately.
 *   - Write echoes return just the identity + the field(s) the helper
 *     touched (path, parentId, deleted flag, etc.).
 *   - `topics_entities` returns slim `{ entityType, entityId, title }` rows
 *     and supports limit/offset pagination (cap 100).
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { hasScope, type PortalMcpContext } from '@/lib/mcp-auth';
import { denied, json } from '@/lib/mcp/types';
import { err } from './shared';
import {
  attachTopics,
  createTopic,
  deleteTopic,
  detachTopics,
  getTopicById,
  getTopicTree,
  importTopicsFromTags,
  listEntitiesForTopic,
  listTopics,
  mergeTopic,
  moveTopic,
  updateTopic,
} from '../topics';

export function registerTopicBrainTools(server: McpServer, ctx: PortalMcpContext, clientId: number) {
  hasScope(ctx.scopes, 'brain:read') && server.registerTool(
    'brain_topics_list',
    {
      title: 'List Brain topics (flat)',
      description: 'List every topic for this tenant in path order (children sort under their parents). Slim by default — no `description`. Pass `includeEntityCounts=true` to add per-row `entityCount` (one extra group-by query).',
      inputSchema: {
        tagPrefix: z.string().optional().describe('Filter to topics whose path starts with `/<tagPrefix>` — useful after an import-from-tags run.'),
        includeEntityCounts: z.boolean().optional(),
      },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:read')) return denied('brain:read');
      const rows = await listTopics(clientId);
      let filtered = rows;
      if (args.tagPrefix?.trim()) {
        const pref = `/${args.tagPrefix.trim().replace(/^\/+/, '')}`;
        filtered = rows.filter((r) => r.path === pref || r.path.startsWith(`${pref}/`));
      }
      let countByTopic: Map<number, number> | null = null;
      if (args.includeEntityCounts) {
        const { brainEntityTopics } = await import('@/lib/db/schema');
        const counts = await db.select({
          topicId: brainEntityTopics.topicId,
          count: sql<number>`count(*)::int`,
        }).from(brainEntityTopics)
          .where(eq(brainEntityTopics.clientId, clientId))
          .groupBy(brainEntityTopics.topicId);
        countByTopic = new Map<number, number>(counts.map((r) => [r.topicId, Number(r.count)]));
      }
      const items = filtered.map((t) => ({
        id: t.id,
        name: t.name,
        slug: t.slug,
        path: t.path,
        parentId: t.parentId,
        sortOrder: t.sortOrder,
        ...(t.color ? { color: t.color } : {}),
        ...(t.icon ? { icon: t.icon } : {}),
        ...(countByTopic ? { entityCount: countByTopic.get(t.id) ?? 0 } : {}),
      }));
      return json(items);
    },
  );

  hasScope(ctx.scopes, 'brain:read') && server.registerTool(
    'brain_topics_tree',
    {
      title: 'Get Brain topics as a nested tree',
      description: 'Return the topic taxonomy as a nested tree with per-node `childCount` + `entityCount`. Descriptions are omitted by default; pass `includeDescriptions=true` to inline them (potentially multi-KB per node).',
      inputSchema: {
        includeDescriptions: z.boolean().optional(),
      },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:read')) return denied('brain:read');
      const tree = await getTopicTree(clientId);
      type SlimNode = {
        id: number;
        name: string;
        slug: string;
        path: string;
        parentId: number | null;
        sortOrder: number;
        color?: string;
        icon?: string;
        childCount: number;
        entityCount: number;
        description?: string | null;
        children: SlimNode[];
      };
      const slim = (nodes: Awaited<ReturnType<typeof getTopicTree>>): SlimNode[] =>
        nodes.map((n) => ({
          id: n.id,
          name: n.name,
          slug: n.slug,
          path: n.path,
          parentId: n.parentId,
          sortOrder: n.sortOrder,
          ...(n.color ? { color: n.color } : {}),
          ...(n.icon ? { icon: n.icon } : {}),
          childCount: n.childCount,
          entityCount: n.entityCount,
          ...(args.includeDescriptions ? { description: n.description } : {}),
          children: slim(n.children),
        }));
      return json(slim(tree));
    },
  );

  hasScope(ctx.scopes, 'brain:read') && server.registerTool(
    'brain_topics_get',
    {
      title: 'Get a Brain topic',
      description: 'Fetch a topic by id with its breadcrumb (root → immediate parent, NOT including the topic itself). `description` is opt-in.',
      inputSchema: {
        id: z.number().int().positive(),
        includeDescription: z.boolean().optional(),
      },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:read')) return denied('brain:read');
      const out = await getTopicById(clientId, args.id);
      if (!out) return err('Topic not found.');
      const slim = {
        id: out.id,
        name: out.name,
        slug: out.slug,
        path: out.path,
        parentId: out.parentId,
        sortOrder: out.sortOrder,
        ...(out.color ? { color: out.color } : {}),
        ...(out.icon ? { icon: out.icon } : {}),
        ...(args.includeDescription ? { description: out.description } : {}),
      };
      return json({
        topic: slim,
        breadcrumb: out.breadcrumb.map((b) => ({ id: b.id, name: b.name, slug: b.slug })),
      });
    },
  );

  hasScope(ctx.scopes, 'brain:read') && server.registerTool(
    'brain_topics_entities',
    {
      title: 'List entities attached to a topic',
      description: 'List the notes / meetings / tasks / decisions / relationship-overlays attached to a topic. Returns slim `{ entityType, entityId, title }` rows, a total, and a per-type tally (`byType`). Paginated; limit capped at 100.',
      inputSchema: {
        id: z.number().int().positive(),
        entityType: z.enum(['note', 'meeting', 'task', 'decision', 'relationship_overlay', 'initiative', 'person']).optional(),
        limit: z.number().int().min(1).max(100).optional(),
        offset: z.number().int().min(0).optional(),
      },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:read')) return denied('brain:read');
      const out = await listEntitiesForTopic(clientId, args.id);
      const filtered = args.entityType
        ? out.items.filter((r) => r.entityType === args.entityType)
        : out.items;
      const limit = args.limit ?? 50;
      const offset = args.offset ?? 0;
      const page = filtered.slice(offset, offset + limit);
      return json({
        items: page,
        total: filtered.length,
        byType: {
          note: out.byType.note.length,
          meeting: out.byType.meeting.length,
          task: out.byType.task.length,
          decision: out.byType.decision.length,
          relationship_overlay: out.byType.relationship_overlay.length,
        },
        limit,
        offset,
      });
    },
  );

  hasScope(ctx.scopes, 'brain:write') && server.registerTool(
    'brain_topics_create',
    {
      title: 'Create a Brain topic',
      description: 'Create a topic. Slug + path auto-derive from name; slug collisions get a `-2`, `-3`, … suffix. Echo: { id, slug, path, parentId }. AUDITED.',
      inputSchema: {
        name: z.string().min(1).max(150),
        parentId: z.number().int().positive().nullable().optional(),
        description: z.string().nullable().optional(),
        color: z.string().max(20).nullable().optional(),
        icon: z.string().max(50).nullable().optional(),
        sortOrder: z.number().int().optional(),
        derivedFromTag: z.string().max(100).nullable().optional(),
      },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:write')) return denied('brain:write');
      try {
        const created = await createTopic(clientId, ctx.userId, {
          name: args.name,
          parentId: args.parentId ?? null,
          description: args.description ?? null,
          color: args.color ?? null,
          icon: args.icon ?? null,
          sortOrder: args.sortOrder,
          derivedFromTag: args.derivedFromTag ?? null,
        });
        return json({
          id: created.id,
          slug: created.slug,
          path: created.path,
          parentId: created.parentId,
        });
      } catch (e) {
        return err(e instanceof Error ? e.message : 'Failed to create topic.');
      }
    },
  );

  hasScope(ctx.scopes, 'brain:write') && server.registerTool(
    'brain_topics_update',
    {
      title: 'Update a Brain topic',
      description: 'Patch a topic. Rename DOES NOT change slug (stable URLs); use brain_topics_move for reparenting. Echo: { id, updatedFields }. AUDITED.',
      inputSchema: {
        id: z.number().int().positive(),
        patch: z.object({
          name: z.string().min(1).max(150).optional(),
          description: z.string().nullable().optional(),
          color: z.string().max(20).nullable().optional(),
          icon: z.string().max(50).nullable().optional(),
          sortOrder: z.number().int().optional(),
        }),
      },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:write')) return denied('brain:write');
      const before = await getTopicById(clientId, args.id);
      if (!before) return err('Topic not found.');
      const updated = await updateTopic(clientId, ctx.userId, args.id, args.patch);
      if (!updated) return err('Topic not found.');
      const changed: string[] = [];
      if (args.patch.name !== undefined && updated.name !== before.name) changed.push('name');
      if (args.patch.description !== undefined && updated.description !== before.description) changed.push('description');
      if (args.patch.color !== undefined && updated.color !== before.color) changed.push('color');
      if (args.patch.icon !== undefined && updated.icon !== before.icon) changed.push('icon');
      if (args.patch.sortOrder !== undefined && updated.sortOrder !== before.sortOrder) changed.push('sortOrder');
      return json({ id: updated.id, updatedFields: changed });
    },
  );

  hasScope(ctx.scopes, 'brain:write') && server.registerTool(
    'brain_topics_move',
    {
      title: 'Reparent a Brain topic',
      description: 'Move a topic under a new parent (pass `newParentId: null` to promote to root). Recomputes the affected subtree\'s materialized `path` atomically. Echo: { id, path, descendantsRepathed }. AUDITED.',
      inputSchema: {
        id: z.number().int().positive(),
        newParentId: z.number().int().positive().nullable(),
      },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:write')) return denied('brain:write');
      try {
        const before = await getTopicById(clientId, args.id);
        if (!before) return err('Topic not found.');
        // Count descendants pre-move so we can echo how many were repathed.
        const { brainTopics } = await import('@/lib/db/schema');
        const likePattern = `${before.path}/%`;
        const [{ count }] = await db.select({ count: sql<number>`count(*)::int` })
          .from(brainTopics)
          .where(and(
            eq(brainTopics.clientId, clientId),
            sql`brain_topics.path LIKE ${likePattern}`,
          ));
        const moved = await moveTopic(clientId, ctx.userId, args.id, args.newParentId);
        if (!moved) return err('Topic not found.');
        return json({
          id: moved.id,
          path: moved.path,
          descendantsRepathed: Number(count ?? 0),
        });
      } catch (e) {
        return err(e instanceof Error ? e.message : 'Failed to move topic.');
      }
    },
  );

  hasScope(ctx.scopes, 'brain:write') && server.registerTool(
    'brain_topics_merge',
    {
      title: 'Merge two Brain topics',
      description: 'Fold `sourceId` into `targetId`: reattach all entity links (skipping dupes), reparent source\'s children under target (with full path rewrite), then delete source. Refuses to merge a topic into one of its own descendants. Echo: { sourceId, targetId, entitiesReattached, childrenReparented }. AUDITED.',
      inputSchema: {
        sourceId: z.number().int().positive(),
        targetId: z.number().int().positive(),
      },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:write')) return denied('brain:write');
      try {
        const out = await mergeTopic(clientId, ctx.userId, args.sourceId, args.targetId);
        if (!out) return err('Source or target topic not found.');
        return json({
          sourceId: args.sourceId,
          targetId: out.targetId,
          entitiesReattached: out.reattached,
          childrenReparented: out.reparented,
        });
      } catch (e) {
        return err(e instanceof Error ? e.message : 'Failed to merge topics.');
      }
    },
  );

  hasScope(ctx.scopes, 'brain:write') && server.registerTool(
    'brain_topics_delete',
    {
      title: 'Delete a Brain topic',
      description: 'Delete a topic. Refuses if the topic has children (resolve via merge or by deleting children first). Refuses if any entities are attached unless `force=true`, which also drops the join rows. AUDITED.',
      inputSchema: {
        id: z.number().int().positive(),
        force: z.boolean().optional(),
      },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:write')) return denied('brain:write');
      const out = await deleteTopic(clientId, ctx.userId, args.id, { force: args.force });
      if (!out.deleted) {
        if (out.reason === 'not_found') return err('Topic not found.');
        return json({
          error: out.reason ?? 'conflict',
          message: out.reason === 'has_children'
            ? 'Topic has child topics — delete them first or merge into another topic.'
            : 'Topic has entities attached — pass force=true to drop the join rows and delete anyway.',
        });
      }
      return json({ id: args.id, deleted: true });
    },
  );

  hasScope(ctx.scopes, 'brain:write') && server.registerTool(
    'brain_topics_attach',
    {
      title: 'Attach topics to an entity',
      description: 'Bulk-attach one or more topics to a single (entityType, entityId) target. Idempotent — rows that already exist are reported as `alreadyAttached`. Cross-tenant topic ids are silently dropped. Echo: { attached, alreadyAttached }.',
      inputSchema: {
        targetEntityType: z.enum(['note', 'meeting', 'task', 'decision', 'relationship_overlay', 'initiative', 'person']),
        targetEntityId: z.number().int().positive(),
        topicIds: z.array(z.number().int().positive()).min(1).max(50),
      },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:write')) return denied('brain:write');
      const out = await attachTopics(db, {
        clientId,
        actorId: ctx.userId,
        targetEntityType: args.targetEntityType,
        targetEntityId: args.targetEntityId,
        topicIds: args.topicIds,
      });
      return json({ attached: out.attached, alreadyAttached: out.alreadyAttached });
    },
  );

  hasScope(ctx.scopes, 'brain:write') && server.registerTool(
    'brain_topics_detach',
    {
      title: 'Detach topics from an entity',
      description: 'Bulk-detach one or more topics from a single (entityType, entityId) target. Tenant-scoped; missing rows are a no-op. Echo: { detached }.',
      inputSchema: {
        targetEntityType: z.enum(['note', 'meeting', 'task', 'decision', 'relationship_overlay', 'initiative', 'person']),
        targetEntityId: z.number().int().positive(),
        topicIds: z.array(z.number().int().positive()).min(1).max(50),
      },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:write')) return denied('brain:write');
      const out = await detachTopics(clientId, ctx.userId, {
        targetEntityType: args.targetEntityType,
        targetEntityId: args.targetEntityId,
        topicIds: args.topicIds,
      });
      return json({ detached: out.detached });
    },
  );

  hasScope(ctx.scopes, 'brain:write') && server.registerTool(
    'brain_topics_import_from_tags',
    {
      title: 'Import Brain topics from note tags',
      description: 'Walk every `brain_notes.tags` string, split `a/b/c` into a hierarchical chain of topics, find-or-create each segment, and attach every note bearing that tag to the leaf topic. Optional `tagPrefix` scopes to one branch. `dryRun=true` returns the report without writing. Idempotent — re-running adds nothing if no new tags appeared. Returns the full per-topic report (intentionally NOT slimmed — this IS the result the caller wants).',
      inputSchema: {
        tagPrefix: z.string().optional(),
        dryRun: z.boolean().optional(),
      },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:write')) return denied('brain:write');
      const report = await importTopicsFromTags(clientId, ctx.userId, {
        tagPrefix: args.tagPrefix,
        dryRun: args.dryRun,
      });
      return json({
        topicsCreated: report.topicsCreated,
        notesAttached: report.notesAttached,
        perTopic: report.perTopic.map((p) => ({
          topicId: p.topicId,
          path: p.path,
          noteCount: p.noteCount,
        })),
        dryRun: report.dryRun,
      });
    },
  );
}
