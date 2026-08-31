import type Anthropic from '@anthropic-ai/sdk';
import { getPortalAgent, type PortalAgentProfile } from './portal-agents';
import { toolsForDomains } from './portal-tools/domains';
import { PORTAL_TOOL_SCOPES } from './portal-tools/scopes';

// `pay_invoice` is deliberately scoped as `billing:read` because it only
// opens checkout; that is still financial intent, so an executive read-only
// agent must not surface it as an action it can take.
const READ_ONLY_EXCLUDED_TOOL_NAMES = new Set(['pay_invoice']);

export function toolsForPortalAgent(agent: PortalAgentProfile, allTools: Anthropic.Tool[]): Anthropic.Tool[] {
  const domainTools = agent.domains.length === 0 ? allTools : toolsForDomains(agent.domains, allTools);

  // A strategic agent can see a cross-domain snapshot without gaining an
  // accidental write capability when future tools are added to the catalog.
  // Unknown tools are deliberately excluded until their scope is registered.
  if (agent.readOnly) {
    return domainTools.filter((tool) =>
      !READ_ONLY_EXCLUDED_TOOL_NAMES.has(tool.name) && PORTAL_TOOL_SCOPES[tool.name]?.endsWith(':read'),
    );
  }

  return domainTools;
}

/**
 * Background work may inspect live tenant data, but it may never perform a
 * write merely because a specialist normally has write-capable chat tools.
 * Keep this stricter policy separate from interactive chat, where writes are
 * staged by the normal approval gate.
 */
export function readOnlyToolsForPortalAgent(agent: PortalAgentProfile, allTools: Anthropic.Tool[]): Anthropic.Tool[] {
  const domainTools = agent.domains.length === 0 ? allTools : toolsForDomains(agent.domains, allTools);
  return domainTools.filter((tool) =>
    !READ_ONLY_EXCLUDED_TOOL_NAMES.has(tool.name) && PORTAL_TOOL_SCOPES[tool.name]?.endsWith(':read'),
  );
}

export function resolvePortalAgentTools(agentId: unknown, allTools: Anthropic.Tool[]): { agent: PortalAgentProfile; tools: Anthropic.Tool[] } | null {
  const agent = getPortalAgent(agentId ?? 'general');
  if (!agent) return null;
  return { agent, tools: toolsForPortalAgent(agent, allTools) };
}

export function portalAgentAllowsTool(agentTools: readonly Anthropic.Tool[], toolName: string): boolean {
  return agentTools.some((tool) => tool.name === toolName);
}
