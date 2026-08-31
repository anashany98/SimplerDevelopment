// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

// `@/lib/db` throws at module load without DATABASE_URL, and lib/ai/portal-tools
// + lib/ai/brain-tools both transitively pull it in. Stub the db and the
// side-effectful helpers so we can import the pure tool registries in isolation
// (same pattern as ai-portal-tools-registry-baseline.test.ts).
vi.mock('@/lib/db', () => ({ db: {} }));
vi.mock('@/lib/automation/event-bus', () => ({ emitEvent: vi.fn() }));
vi.mock('@/lib/crm/default-pipeline', () => ({ ensureDefaultPipeline: vi.fn() }));

import { PORTAL_AGENT_PROFILES, getPortalAgent, getPortalAgentForPathname } from '@/lib/ai/portal-agents';
import { portalAgentAllowsTool, readOnlyToolsForPortalAgent, resolvePortalAgentTools, toolsForPortalAgent } from '@/lib/ai/portal-agent-tools';
import { PORTAL_TOOLS } from '@/lib/ai/portal-tools';
import { BRAIN_TOOLS } from '@/lib/ai/brain-tools';
import { getAgentToolCoverage } from '@/lib/ai/agent-coverage';
import { agentForTool } from '@/lib/ai/agent-activity';
import { PORTAL_TOOL_SCOPES } from '@/lib/ai/portal-tools/scopes';

const TOOLS = [
  {
    name: 'navigate_to',
    description: '',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'get_dashboard_summary',
    description: '',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'get_crm_contacts',
    description: '',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'get_my_invoices',
    description: '',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'get_inbox_conversations',
    description: '',
    input_schema: { type: 'object', properties: {} },
  },
] as const;

describe('portal agent profiles', () => {
  it('keeps stable unique IDs', () => {
    const ids = PORTAL_AGENT_PROFILES.map((profile) => profile.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain('ceo');
    expect(ids).toContain('general');
    expect(ids).toContain('crm');
    expect(ids).toContain('inbox');
    expect(ids).toContain('knowledge');
    expect(ids).toContain('services');
    expect(ids).toContain('retention');
    expect(ids).toContain('reputation');
    expect(ids).toContain('operations');
    expect(ids).toContain('commerce');
    expect(ids).toContain('analytics');
  });

  it.each([
    ['/portal/crm/contacts', 'crm'],
    ['/portal/inbox/42', 'inbox'],
    ['/portal/settings/channels', 'inbox'],
    ['/portal/services', 'services'],
    ['/portal/tools/booking/calendar', 'bookings'],
    ['/portal/websites/12/store/products', 'commerce'],
    ['/portal/email/campaigns', 'marketing'],
    ['/portal/projects/7', 'projects'],
    ['/portal/settings/team', 'team'],
    ['/portal/brain/knowledge', 'knowledge'],
    ['/portal/dashboard', 'general'],
  ])('maps %s to the %s specialist', (pathname, expected) => {
    expect(getPortalAgentForPathname(pathname).id).toBe(expected);
  });

  it('rejects unknown agent IDs instead of accepting client-authored roles', () => {
    expect(getPortalAgent('made-up-agent')).toBeNull();
    expect(resolvePortalAgentTools('made-up-agent', [...TOOLS])).toBeNull();
  });

  it('enforces the specialist boundary even when classifier routing fails open', () => {
    const crm = getPortalAgent('crm')!;
    const tools = toolsForPortalAgent(crm, [...TOOLS]);
    const names = tools.map((tool) => tool.name);

    expect(names).toContain('get_crm_contacts');
    expect(names).toContain('navigate_to');
    expect(names).toContain('get_dashboard_summary');
    expect(names).not.toContain('get_my_invoices');
    expect(names).not.toContain('get_inbox_conversations');
    expect(portalAgentAllowsTool(tools, 'get_my_invoices')).toBe(false);
  });

  it('keeps retention focused on customer data instead of billing', () => {
    const retention = getPortalAgent('retention')!;
    const tools = toolsForPortalAgent(retention, [...TOOLS]);
    const names = tools.map((tool) => tool.name);

    expect(names).toContain('get_crm_contacts');
    expect(names).toContain('navigate_to');
    expect(names).not.toContain('get_my_invoices');
  });

  it('attributes newly logged work to the selected specialist', () => {
    expect(agentForTool('get_crm_contacts', 'retention')).toBe('retention');
    expect(agentForTool('get_crm_contacts', 'not-an-agent')).toBe('crm');
  });

  it('keeps services separate from billing', () => {
    const services = getPortalAgent('services')!;
    const billing = getPortalAgent('billing')!;
    const serviceTools = toolsForPortalAgent(services, [...TOOLS, { name: 'get_services_catalog', description: '', input_schema: { type: 'object', properties: {}, required: [] } }]);
    const billingTools = toolsForPortalAgent(billing, [...TOOLS, { name: 'get_services_catalog', description: '', input_schema: { type: 'object', properties: {}, required: [] } }]);
    expect(serviceTools.map((tool) => tool.name)).toContain('get_services_catalog');
    expect(billingTools.map((tool) => tool.name)).not.toContain('get_services_catalog');
    expect(services.instructions).toContain('Billing');
  });

  it('gives the supervisor the full supplied surface', () => {
    const supervisor = getPortalAgent('general')!;
    expect(toolsForPortalAgent(supervisor, [...TOOLS])).toEqual(TOOLS);
  });

  it('keeps the CEO cross-domain but strictly read-only', () => {
    const ceo = getPortalAgent('ceo')!;
    const tools = toolsForPortalAgent(ceo, [...PORTAL_TOOLS]);
    const names = tools.map((tool) => tool.name);

    expect(ceo.package).toBe('complete');
    expect(ceo.readOnly).toBe(true);
    expect(ceo.delegatesTo).toContain('crm');
    expect(ceo.delegatesTo).toContain('automations');
    expect(names).toContain('get_crm_contacts');
    expect(names).toContain('get_my_invoices');
    expect(names).toContain('get_my_websites');
    expect(names).not.toContain('create_crm_contact');
    expect(names).not.toContain('create_website');
    expect(names).not.toContain('create_automation');
    expect(names).not.toContain('pay_invoice');
    expect(tools.every((tool) => PORTAL_TOOL_SCOPES[tool.name]?.endsWith(':read'))).toBe(true);
  });

  it('gives a background specialist no write-capable tools even when its chat profile normally has them', () => {
    const crm = getPortalAgent('crm')!;
    const tools = readOnlyToolsForPortalAgent(crm, [...PORTAL_TOOLS]);
    const names = tools.map((tool) => tool.name);

    expect(names).toContain('get_crm_contacts');
    expect(names).not.toContain('create_crm_contact');
    expect(names).not.toContain('update_crm_contact');
    expect(tools.every((tool) => PORTAL_TOOL_SCOPES[tool.name]?.endsWith(':read'))).toBe(true);
  });

  it('measures the Company Brain agent coverage against its own BRAIN_TOOLS registry, not its dashboard-only widget slice', () => {
    const knowledge = getPortalAgent('knowledge')!;
    // The widget slice (domains: ['dashboard']) only yields the baseline tools —
    // that is a handoff surface, not the agent's real capability.
    expect(toolsForPortalAgent(knowledge, [...PORTAL_TOOLS]).length).toBeLessThan(4);

    const coverage = getAgentToolCoverage(knowledge, PORTAL_TOOLS);
    expect(coverage.toolCount).toBe(BRAIN_TOOLS.length);
    expect(BRAIN_TOOLS.length).toBeGreaterThan(10);
    expect(coverage.lowCoverage).toBe(false);
  });

  it('exposes every brain surface as an executable tool (goals, relationships, topics, playbooks, documents, org chart)', () => {
    const toolNames = new Set(BRAIN_TOOLS.map((tool) => tool.name));
    for (const name of [
      'brain_list_goals',
      'brain_get_goal',
      'brain_list_relationships',
      'brain_get_relationship',
      'brain_get_topic_tree',
      'brain_list_playbooks',
      'brain_get_playbook',
      'brain_list_documents',
      'brain_get_document',
      'brain_get_org_chart',
    ]) {
      expect(toolNames.has(name), `missing tool ${name}`).toBe(true);
    }
  });
});
