/**
 * Brain MCP adapter — People, org units & expertise domain.
 *
 * Extracted from lib/brain/mcp-sdk-adapter.ts (BRAIN — PEOPLE section) so the
 * registrar decomposes domain by domain. Registered by the main
 * `registerBrainToolsOnSdk` — never imported by any other adapter.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  brainOrgUnits,
  brainPeople,
  brainPersonOrgUnits,
  type BrainOrgUnitTreeNode,
  type BrainPersonStatus,
} from '@/lib/db/schema';
import { hasScope, type PortalMcpContext } from '@/lib/mcp-auth';
import { denied, json } from '@/lib/mcp/types';
import { err } from './shared';
import {
  attachExpertise,
  createExpertiseTag,
  createPerson,
  deleteExpertiseTag,
  deletePerson,
  detachExpertise,
  getPersonById,
  listExpertiseTags,
  listPeople,
  mergeExpertiseTags,
  updateExpertiseTag,
  updatePerson,
  whoKnows,
} from '../people';
import {
  addMember,
  createOrgUnit,
  deleteOrgUnit,
  getOrgUnitById,
  getOrgUnitTree,
  listOrgUnits,
  mergeOrgUnits,
  moveOrgUnit,
  removeMember,
  setPrimaryUnit,
  updateOrgUnit,
} from '../org-units';

export function registerPeopleBrainTools(server: McpServer, ctx: PortalMcpContext, clientId: number) {
  const personIncludeEnum = z.enum(['notes', 'profileUrls']);
  const orgUnitIncludeEnum = z.enum(['descriptions']);

  hasScope(ctx.scopes, 'brain:read') && server.registerTool(
    'brain_people_list',
    {
      title: 'List Brain people',
      description: 'List internal people (employees / advisors / contractors). Slim row by default — pass `include: ["notes", "profileUrls"]` to opt into heavy fields. Filter by status / orgUnitId / expertiseTagId / managerId / search.',
      inputSchema: {
        status: z.enum(['active', 'inactive', 'departed']).optional(),
        orgUnitId: z.number().int().positive().optional(),
        expertiseTagId: z.number().int().positive().optional(),
        managerId: z.number().int().positive().optional(),
        search: z.string().max(200).optional(),
        limit: z.number().int().min(1).max(100).optional(),
        offset: z.number().int().min(0).optional(),
        include: z.array(personIncludeEnum).optional(),
      },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:read')) return denied('brain:read');
      const include = new Set(args.include ?? []);
      const rows = await listPeople(clientId, {
        status: args.status as BrainPersonStatus | undefined,
        orgUnitId: args.orgUnitId,
        expertiseTagId: args.expertiseTagId,
        managerId: args.managerId,
        search: args.search,
        limit: args.limit,
        offset: args.offset,
      });
      // listPeople already returns the slim shape. Hydrate heavy fields only
      // when the caller opted in.
      if (include.size === 0 || rows.length === 0) {
        return json({ items: rows, limit: args.limit ?? 50, offset: args.offset ?? 0 });
      }
      const ids = rows.map((r) => r.id);
      const heavyRows = await db
        .select({
          id: brainPeople.id,
          notes: brainPeople.notes,
          profileUrls: brainPeople.profileUrls,
        })
        .from(brainPeople)
        .where(and(eq(brainPeople.clientId, clientId), inArray(brainPeople.id, ids)));
      const heavyById = new Map(heavyRows.map((r) => [r.id, r]));
      const items = rows.map((r) => {
        const h = heavyById.get(r.id);
        return {
          ...r,
          ...(include.has('notes') ? { notes: h?.notes ?? null } : {}),
          ...(include.has('profileUrls') ? { profileUrls: h?.profileUrls ?? [] } : {}),
        };
      });
      return json({ items, limit: args.limit ?? 50, offset: args.offset ?? 0 });
    },
  );

  hasScope(ctx.scopes, 'brain:read') && server.registerTool(
    'brain_people_get',
    {
      title: 'Get Brain person',
      description: 'Fetch a person with manager, direct reports, org-unit memberships, and expertise tags. Slim person fields by default — pass `include: ["notes", "profileUrls"]` to opt into heavy fields.',
      inputSchema: {
        id: z.number().int().positive(),
        include: z.array(personIncludeEnum).optional(),
      },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:read')) return denied('brain:read');
      const detail = await getPersonById(clientId, args.id);
      if (!detail) return err('Person not found.');
      const include = new Set(args.include ?? []);
      const p = detail.person;
      const slimPerson: Record<string, unknown> = {
        id: p.id,
        clientId: p.clientId,
        userId: p.userId,
        fullName: p.fullName,
        email: p.email,
        managerId: p.managerId,
        title: p.title,
        startDate: p.startDate,
        endDate: p.endDate,
        status: p.status,
        source: p.source,
        createdBy: p.createdBy,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
      };
      if (include.has('notes')) slimPerson.notes = p.notes;
      if (include.has('profileUrls')) slimPerson.profileUrls = p.profileUrls;
      return json({
        person: slimPerson,
        manager: detail.manager,
        directReports: detail.directReports,
        orgUnits: detail.orgUnits,
        expertise: detail.expertise,
      });
    },
  );

  hasScope(ctx.scopes, 'brain:read') && server.registerTool(
    'brain_org_units_list',
    {
      title: 'List Brain org units (flat)',
      description: 'Flat list of org units for this tenant, ordered by path. Slim row by default (no description) — pass `include: ["descriptions"]` to inline the description text. `memberCount` is always populated.',
      inputSchema: {
        include: z.array(orgUnitIncludeEnum).optional(),
      },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:read')) return denied('brain:read');
      const include = new Set(args.include ?? []);
      const units = await listOrgUnits(clientId);
      // memberCount in one batch — same pattern as getOrgUnitTree.
      const memberRows = units.length === 0 ? [] : await db
        .select({
          orgUnitId: brainPersonOrgUnits.orgUnitId,
          count: sql<number>`count(*)::int`,
        })
        .from(brainPersonOrgUnits)
        .where(and(
          eq(brainPersonOrgUnits.clientId, clientId),
          inArray(brainPersonOrgUnits.orgUnitId, units.map((u) => u.id)),
        ))
        .groupBy(brainPersonOrgUnits.orgUnitId);
      const countByUnit = new Map<number, number>();
      for (const r of memberRows) countByUnit.set(r.orgUnitId, Number(r.count));
      const items = units.map((u) => ({
        id: u.id,
        name: u.name,
        slug: u.slug,
        path: u.path,
        parentId: u.parentId,
        leadPersonId: u.leadPersonId,
        sortOrder: u.sortOrder,
        color: u.color,
        icon: u.icon,
        memberCount: countByUnit.get(u.id) ?? 0,
        ...(include.has('descriptions') ? { description: u.description } : {}),
      }));
      return json({ items });
    },
  );

  hasScope(ctx.scopes, 'brain:read') && server.registerTool(
    'brain_org_units_tree',
    {
      title: 'Get Brain org-unit tree',
      description: 'Nested tree of org units for this tenant. Each node carries `childCount` and `memberCount`. Slim by default (no description) — pass `include: ["descriptions"]` to inline.',
      inputSchema: {
        include: z.array(orgUnitIncludeEnum).optional(),
      },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:read')) return denied('brain:read');
      const include = new Set(args.include ?? []);
      const roots = await getOrgUnitTree(clientId);
      const shape = (node: BrainOrgUnitTreeNode): Record<string, unknown> => ({
        id: node.id,
        name: node.name,
        slug: node.slug,
        path: node.path,
        parentId: node.parentId,
        leadPersonId: node.leadPersonId,
        sortOrder: node.sortOrder,
        color: node.color,
        icon: node.icon,
        memberCount: node.memberCount,
        childCount: node.children.length,
        ...(include.has('descriptions') ? { description: node.description } : {}),
        children: node.children.map(shape),
      });
      return json({ items: roots.map(shape) });
    },
  );

  hasScope(ctx.scopes, 'brain:read') && server.registerTool(
    'brain_org_units_get',
    {
      title: 'Get Brain org unit',
      description: 'Fetch an org unit with its ancestor chain and members (personId / fullName / title / primary / roleInUnit).',
      inputSchema: { id: z.number().int().positive() },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:read')) return denied('brain:read');
      const detail = await getOrgUnitById(clientId, args.id);
      if (!detail) return err('Org unit not found.');
      return json({
        unit: detail.unit,
        ancestors: detail.ancestors,
        members: detail.members,
      });
    },
  );

  hasScope(ctx.scopes, 'brain:read') && server.registerTool(
    'brain_who_knows',
    {
      title: 'Who knows X? — expertise search',
      description: 'Resolve a free-text query to expertise tags (substring match on tag name + description), then rank people by matched-tag count, level bonus, and primary-org-unit bonus. The marquee tool — use this when the user asks "who knows about X" or "who should I talk to about Y".',
      inputSchema: {
        query: z.string().min(1).max(200),
        limit: z.number().int().min(1).max(25).optional(),
      },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:read')) return denied('brain:read');
      const out = await whoKnows(clientId, args.query, { limit: args.limit });
      return json(out);
    },
  );

  // ── PEOPLE — writes ──────────────────────────────────────────────────────

  hasScope(ctx.scopes, 'brain:write') && server.registerTool(
    'brain_people_create',
    {
      title: 'Create a Brain person',
      description: 'Add an internal person (employee / advisor / contractor). Echoes only `{ id, status }` — re-fetch via brain_people_get for the full record.',
      inputSchema: {
        fullName: z.string().min(1).max(200),
        email: z.string().email().max(255).nullable().optional(),
        userId: z.number().int().positive().nullable().optional(),
        managerId: z.number().int().positive().nullable().optional(),
        title: z.string().max(200).nullable().optional(),
        startDate: z.string().nullable().optional(),
        endDate: z.string().nullable().optional(),
        status: z.enum(['active', 'inactive', 'departed']).optional(),
        notes: z.string().nullable().optional(),
        profileUrls: z.array(z.object({ label: z.string(), url: z.string().url() })).optional(),
      },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:write')) return denied('brain:write');
      try {
        const created = await createPerson(clientId, ctx.userId, {
          fullName: args.fullName,
          email: args.email ?? null,
          userId: args.userId ?? null,
          managerId: args.managerId ?? null,
          title: args.title ?? null,
          startDate: args.startDate ? new Date(args.startDate) : null,
          endDate: args.endDate ? new Date(args.endDate) : null,
          status: args.status,
          notes: args.notes ?? null,
          profileUrls: args.profileUrls,
        });
        return json({ id: created.id, status: created.status });
      } catch (e) {
        return err(e instanceof Error ? e.message : 'Failed to create person.');
      }
    },
  );

  hasScope(ctx.scopes, 'brain:write') && server.registerTool(
    'brain_people_update',
    {
      title: 'Update a Brain person',
      description: 'Patch fields on a person. Manager change is cycle-guarded — assigning a descendant as the manager returns `{ error: "manager_cycle" }`. Echoes only `{ id, updatedFields }`.',
      inputSchema: {
        id: z.number().int().positive(),
        patch: z.object({
          fullName: z.string().min(1).max(200).optional(),
          email: z.string().email().max(255).nullable().optional(),
          managerId: z.number().int().positive().nullable().optional(),
          title: z.string().max(200).nullable().optional(),
          startDate: z.string().nullable().optional(),
          endDate: z.string().nullable().optional(),
          status: z.enum(['active', 'inactive', 'departed']).optional(),
          notes: z.string().nullable().optional(),
          profileUrls: z.array(z.object({ label: z.string(), url: z.string().url() })).optional(),
        }),
      },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:write')) return denied('brain:write');
      const p = args.patch;
      const patch: Parameters<typeof updatePerson>[3] = {};
      if (p.fullName !== undefined) patch.fullName = p.fullName;
      if (p.email !== undefined) patch.email = p.email;
      if (p.managerId !== undefined) patch.managerId = p.managerId;
      if (p.title !== undefined) patch.title = p.title;
      if (p.startDate !== undefined) patch.startDate = p.startDate ? new Date(p.startDate) : null;
      if (p.endDate !== undefined) patch.endDate = p.endDate ? new Date(p.endDate) : null;
      if (p.status !== undefined) patch.status = p.status;
      if (p.notes !== undefined) patch.notes = p.notes;
      if (p.profileUrls !== undefined) patch.profileUrls = p.profileUrls;
      try {
        const updated = await updatePerson(clientId, ctx.userId, args.id, patch);
        if (!updated) return err('Person not found.');
        return json({ id: updated.id, updatedFields: Object.keys(p) });
      } catch (e) {
        const message = e instanceof Error ? e.message : 'Failed to update person.';
        if (/cycle/i.test(message)) {
          return json({ error: 'manager_cycle', message });
        }
        return err(message);
      }
    },
  );

  hasScope(ctx.scopes, 'brain:write') && server.registerTool(
    'brain_people_delete',
    {
      title: 'Delete a Brain person',
      description: 'Delete a person. Cascades org-unit memberships and expertise junctions; reports-to chains pointing at this person are nulled out.',
      inputSchema: { id: z.number().int().positive() },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:write')) return denied('brain:write');
      const ok = await deletePerson(clientId, ctx.userId, args.id);
      if (!ok) return err('Person not found.');
      return json({ id: args.id, deleted: true });
    },
  );

  hasScope(ctx.scopes, 'brain:write') && server.registerTool(
    'brain_people_attach_expertise',
    {
      title: 'Attach an expertise tag to a person',
      description: 'Attach an expertise tag with an optional 1–4 proficiency level. Idempotent — `alreadyAttached: true` means the row already existed (level may have been updated).',
      inputSchema: {
        personId: z.number().int().positive(),
        expertiseTagId: z.number().int().positive(),
        level: z.number().int().min(1).max(4).nullable().optional(),
      },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:write')) return denied('brain:write');
      try {
        const out = await attachExpertise(clientId, ctx.userId, args.personId, {
          expertiseTagId: args.expertiseTagId,
          level: args.level ?? null,
        });
        return json({ alreadyAttached: out.alreadyAttached, level: args.level ?? null });
      } catch (e) {
        return err(e instanceof Error ? e.message : 'Failed to attach expertise.');
      }
    },
  );

  hasScope(ctx.scopes, 'brain:write') && server.registerTool(
    'brain_people_detach_expertise',
    {
      title: 'Detach an expertise tag from a person',
      description: 'Remove an expertise tag from a person. `detached: false` means the row did not exist.',
      inputSchema: {
        personId: z.number().int().positive(),
        expertiseTagId: z.number().int().positive(),
      },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:write')) return denied('brain:write');
      const detached = await detachExpertise(clientId, ctx.userId, args.personId, args.expertiseTagId);
      return json({ detached });
    },
  );

  // ── EXPERTISE TAGS — reads ───────────────────────────────────────────────

  const expertiseTagIncludeEnum = z.enum(['description']);

  hasScope(ctx.scopes, 'brain:read') && server.registerTool(
    'brain_expertise_tags_list',
    {
      title: 'List Brain expertise tags',
      description: 'List per-tenant expertise tags. Slim row by default — pass `include: ["description"]` to inline the description text. `peopleCount` is always populated. Filter by `search` (ILIKE on name + description) or `source` ("manual" | "ai_suggested").',
      inputSchema: {
        search: z.string().max(200).optional(),
        source: z.enum(['manual', 'ai_suggested']).optional(),
        limit: z.number().int().min(1).max(100).optional(),
        offset: z.number().int().min(0).optional(),
        include: z.array(expertiseTagIncludeEnum).optional(),
      },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:read')) return denied('brain:read');
      const include = new Set(args.include ?? []);
      const rows = await listExpertiseTags(clientId, {
        search: args.search,
        source: args.source,
        limit: args.limit,
        offset: args.offset,
      });
      const items = rows.map((r) => ({
        id: r.id,
        name: r.name,
        slug: r.slug,
        source: r.source,
        createdAt: r.createdAt,
        peopleCount: r.peopleCount,
        ...(include.has('description') ? { description: r.description } : {}),
      }));
      return json({ items, limit: args.limit ?? 50, offset: args.offset ?? 0 });
    },
  );

  // ── EXPERTISE TAGS — writes ──────────────────────────────────────────────

  hasScope(ctx.scopes, 'brain:write') && server.registerTool(
    'brain_expertise_tags_create',
    {
      title: 'Create an expertise tag',
      description: 'Create a per-tenant expertise tag. Slug is auto-derived from name; collisions get a `-2`, `-3` suffix. Echoes `{ id, slug }`.',
      inputSchema: {
        name: z.string().min(1).max(100),
        description: z.string().nullable().optional(),
        source: z.enum(['manual', 'ai_suggested']).optional(),
      },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:write')) return denied('brain:write');
      try {
        const created = await createExpertiseTag(clientId, ctx.userId, {
          name: args.name,
          description: args.description ?? null,
          source: args.source,
        });
        return json({ id: created.id, slug: created.slug });
      } catch (e) {
        return err(e instanceof Error ? e.message : 'Failed to create expertise tag.');
      }
    },
  );

  hasScope(ctx.scopes, 'brain:write') && server.registerTool(
    'brain_expertise_tags_update',
    {
      title: 'Update an expertise tag',
      description: 'Patch name or description on an expertise tag. Slug stays stable (renames do not change the URL). Echoes `{ id, updatedFields }`.',
      inputSchema: {
        id: z.number().int().positive(),
        patch: z.object({
          name: z.string().min(1).max(100).optional(),
          description: z.string().nullable().optional(),
        }),
      },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:write')) return denied('brain:write');
      const updated = await updateExpertiseTag(clientId, ctx.userId, args.id, args.patch);
      if (!updated) return err('Expertise tag not found.');
      return json({ id: updated.id, updatedFields: Object.keys(args.patch) });
    },
  );

  hasScope(ctx.scopes, 'brain:write') && server.registerTool(
    'brain_expertise_tags_delete',
    {
      title: 'Delete an expertise tag',
      description: 'Delete an expertise tag. Default refuses if any person still holds it — pass `force: true` to cascade-detach. Returns a structured `{ error: "in_use", peopleAttached }` shape on conflict.',
      inputSchema: {
        id: z.number().int().positive(),
        force: z.boolean().optional(),
      },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:write')) return denied('brain:write');
      const out = await deleteExpertiseTag(clientId, ctx.userId, args.id, { force: args.force });
      if (!out.deleted) {
        if (out.reason === 'not_found') return err('Expertise tag not found.');
        if (out.reason === 'in_use') {
          return json({
            error: 'in_use',
            message: 'Expertise tag is still attached to one or more people. Pass force=true to cascade.',
          });
        }
      }
      return json({ id: args.id, deleted: true });
    },
  );

  hasScope(ctx.scopes, 'brain:write') && server.registerTool(
    'brain_expertise_tags_merge',
    {
      title: 'Merge two expertise tags',
      description: 'Re-attach every brain_person_expertise row from `sourceTagId` to `targetTagId`, then delete the source tag. Levels on target are preserved; if target has no level but source had one, source\'s level is copied. Echoes `{ peopleReattached, sourceDeleted: true }`.',
      inputSchema: {
        sourceTagId: z.number().int().positive(),
        targetTagId: z.number().int().positive(),
      },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:write')) return denied('brain:write');
      try {
        const out = await mergeExpertiseTags(clientId, ctx.userId, args.sourceTagId, args.targetTagId);
        return json({ peopleReattached: out.reattached, sourceDeleted: true });
      } catch (e) {
        return err(e instanceof Error ? e.message : 'Failed to merge expertise tags.');
      }
    },
  );

  // ── ORG UNITS — writes ───────────────────────────────────────────────────

  hasScope(ctx.scopes, 'brain:write') && server.registerTool(
    'brain_org_units_create',
    {
      title: 'Create an org unit',
      description: 'Create a hierarchical org unit. Slug auto-derived; path computed from parent. Echoes `{ id, slug, path }`.',
      inputSchema: {
        name: z.string().min(1).max(150),
        parentId: z.number().int().positive().nullable().optional(),
        description: z.string().nullable().optional(),
        leadPersonId: z.number().int().positive().nullable().optional(),
        color: z.string().max(20).nullable().optional(),
        icon: z.string().max(50).nullable().optional(),
        sortOrder: z.number().int().optional(),
      },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:write')) return denied('brain:write');
      try {
        const created = await createOrgUnit(clientId, ctx.userId, {
          name: args.name,
          parentId: args.parentId ?? null,
          description: args.description ?? null,
          leadPersonId: args.leadPersonId ?? null,
          color: args.color ?? null,
          icon: args.icon ?? null,
          sortOrder: args.sortOrder,
        });
        return json({ id: created.id, slug: created.slug, path: created.path });
      } catch (e) {
        return err(e instanceof Error ? e.message : 'Failed to create org unit.');
      }
    },
  );

  hasScope(ctx.scopes, 'brain:write') && server.registerTool(
    'brain_org_units_update',
    {
      title: 'Update an org unit',
      description: 'Patch fields on an org unit. Slug + path stay stable on rename. Echoes `{ id, updatedFields }`. Use brain_org_units_move to re-parent.',
      inputSchema: {
        id: z.number().int().positive(),
        patch: z.object({
          name: z.string().min(1).max(150).optional(),
          description: z.string().nullable().optional(),
          leadPersonId: z.number().int().positive().nullable().optional(),
          color: z.string().max(20).nullable().optional(),
          icon: z.string().max(50).nullable().optional(),
          sortOrder: z.number().int().optional(),
        }),
      },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:write')) return denied('brain:write');
      try {
        const updated = await updateOrgUnit(clientId, ctx.userId, args.id, args.patch);
        if (!updated) return err('Org unit not found.');
        return json({ id: updated.id, updatedFields: Object.keys(args.patch) });
      } catch (e) {
        return err(e instanceof Error ? e.message : 'Failed to update org unit.');
      }
    },
  );

  hasScope(ctx.scopes, 'brain:write') && server.registerTool(
    'brain_org_units_move',
    {
      title: 'Re-parent an org unit',
      description: 'Move an org unit under a new parent (or to root with `newParentId: null`). Rewrites the path prefix for the moved unit AND every descendant. Cycle-guarded. Echoes `{ id, path, descendantsRepathed }`.',
      inputSchema: {
        id: z.number().int().positive(),
        newParentId: z.number().int().positive().nullable(),
      },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:write')) return denied('brain:write');
      try {
        const before = await getOrgUnitById(clientId, args.id);
        if (!before) return err('Org unit not found.');
        // Count descendants (path LIKE 'before.path/%') for the echo.
        const descendantRows = await db
          .select({ id: brainOrgUnits.id })
          .from(brainOrgUnits)
          .where(and(
            eq(brainOrgUnits.clientId, clientId),
            sql`${brainOrgUnits.path} LIKE ${`${before.unit.path}/%`}`,
          ));
        const descendantsRepathed = descendantRows.length;
        const moved = await moveOrgUnit(clientId, ctx.userId, args.id, args.newParentId);
        if (!moved) return err('Org unit not found.');
        return json({ id: moved.id, path: moved.path, descendantsRepathed });
      } catch (e) {
        return err(e instanceof Error ? e.message : 'Failed to move org unit.');
      }
    },
  );

  hasScope(ctx.scopes, 'brain:write') && server.registerTool(
    'brain_org_units_merge',
    {
      title: 'Merge two org units',
      description: 'Re-parent `sourceId`\'s children under `targetId`, re-attach `sourceId`\'s members to `targetId` (dedup-safe), then delete `sourceId`. Echoes `{ sourceId, targetId, membersReattached, childrenReparented }`.',
      inputSchema: {
        sourceId: z.number().int().positive(),
        targetId: z.number().int().positive(),
      },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:write')) return denied('brain:write');
      try {
        // Capture counts BEFORE the merge so we can echo them — mergeOrgUnits
        // returns the target unit, not a stats payload.
        const sourceDetail = await getOrgUnitById(clientId, args.sourceId);
        if (!sourceDetail) return err('Source org unit not found.');
        const membersReattached = sourceDetail.members.length;
        const childrenRows = await db
          .select({ id: brainOrgUnits.id })
          .from(brainOrgUnits)
          .where(and(
            eq(brainOrgUnits.clientId, clientId),
            eq(brainOrgUnits.parentId, args.sourceId),
          ));
        const childrenReparented = childrenRows.length;
        const merged = await mergeOrgUnits(clientId, ctx.userId, args.sourceId, args.targetId);
        if (!merged) return err('Source org unit not found.');
        return json({
          sourceId: args.sourceId,
          targetId: args.targetId,
          membersReattached,
          childrenReparented,
        });
      } catch (e) {
        return err(e instanceof Error ? e.message : 'Failed to merge org units.');
      }
    },
  );

  hasScope(ctx.scopes, 'brain:write') && server.registerTool(
    'brain_org_units_delete',
    {
      title: 'Delete an org unit',
      description: 'Delete an org unit. Default refuses if it has members or children — pass `force: true` to detach members and re-parent children up one level. Returns structured `{ error: "in_use", memberCount, childCount }` on conflict.',
      inputSchema: {
        id: z.number().int().positive(),
        force: z.boolean().optional(),
      },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:write')) return denied('brain:write');
      try {
        const ok = await deleteOrgUnit(clientId, ctx.userId, args.id, { force: args.force });
        if (!ok) return err('Org unit not found.');
        return json({ id: args.id, deleted: true });
      } catch (e) {
        const message = e instanceof Error ? e.message : 'Failed to delete org unit.';
        // Helper throws "Org unit has N member(s) and M child unit(s). Pass force=true to cascade."
        const match = message.match(/has\s+(\d+)\s+member.*\s+(\d+)\s+child/i);
        if (match) {
          return json({
            error: 'in_use',
            message,
            memberCount: Number(match[1]),
            childCount: Number(match[2]),
          });
        }
        return err(message);
      }
    },
  );

  hasScope(ctx.scopes, 'brain:write') && server.registerTool(
    'brain_org_units_add_member',
    {
      title: 'Add a person to an org unit',
      description: 'Attach a person to an org unit. Idempotent — re-attaching updates `primary` and `roleInUnit`. Marking primary flips primary=false on the person\'s other memberships. Echoes `{ alreadyMember, primary }`.',
      inputSchema: {
        orgUnitId: z.number().int().positive(),
        personId: z.number().int().positive(),
        primary: z.boolean().optional(),
        roleInUnit: z.string().max(150).nullable().optional(),
      },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:write')) return denied('brain:write');
      try {
        // Check pre-existing membership for the echo flag.
        const [existing] = await db
          .select({ id: brainPersonOrgUnits.id })
          .from(brainPersonOrgUnits)
          .where(and(
            eq(brainPersonOrgUnits.clientId, clientId),
            eq(brainPersonOrgUnits.orgUnitId, args.orgUnitId),
            eq(brainPersonOrgUnits.personId, args.personId),
          ))
          .limit(1);
        const alreadyMember = Boolean(existing);
        const row = await addMember(clientId, ctx.userId, {
          orgUnitId: args.orgUnitId,
          personId: args.personId,
          primary: args.primary,
          roleInUnit: args.roleInUnit ?? null,
        });
        return json({ alreadyMember, primary: row.primary });
      } catch (e) {
        return err(e instanceof Error ? e.message : 'Failed to add member.');
      }
    },
  );

  hasScope(ctx.scopes, 'brain:write') && server.registerTool(
    'brain_org_units_remove_member',
    {
      title: 'Remove a person from an org unit',
      description: 'Detach a person from an org unit. `removed: false` means the membership row did not exist.',
      inputSchema: {
        orgUnitId: z.number().int().positive(),
        personId: z.number().int().positive(),
      },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:write')) return denied('brain:write');
      const removed = await removeMember(clientId, ctx.userId, {
        orgUnitId: args.orgUnitId,
        personId: args.personId,
      });
      return json({ removed });
    },
  );

  hasScope(ctx.scopes, 'brain:write') && server.registerTool(
    'brain_org_units_set_primary',
    {
      title: 'Set a person\'s primary org unit',
      description: 'Mark `orgUnitId` as the primary membership for `personId`. Flips primary=false on the person\'s other memberships in the same transaction. Requires the membership to already exist — call brain_org_units_add_member first if not.',
      inputSchema: {
        personId: z.number().int().positive(),
        orgUnitId: z.number().int().positive(),
      },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:write')) return denied('brain:write');
      const ok = await setPrimaryUnit(clientId, ctx.userId, args.personId, args.orgUnitId);
      if (!ok) return err('Membership not found. Call brain_org_units_add_member first.');
      return json({ personId: args.personId, orgUnitId: args.orgUnitId, primary: true });
    },
  );
}
