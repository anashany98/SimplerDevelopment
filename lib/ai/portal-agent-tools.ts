import type Anthropic from '@anthropic-ai/sdk';
import { getPortalAgent, type PortalAgentProfile } from './portal-agents';
import { toolsForDomains } from './portal-tools/domains';

export function toolsForPortalAgent(agent: PortalAgentProfile, allTools: Anthropic.Tool[]): Anthropic.Tool[] {
  return agent.domains.length === 0 ? allTools : toolsForDomains(agent.domains, allTools);
}

export function resolvePortalAgentTools(agentId: unknown, allTools: Anthropic.Tool[]): { agent: PortalAgentProfile; tools: Anthropic.Tool[] } | null {
  const agent = getPortalAgent(agentId ?? 'general');
  if (!agent) return null;
  return { agent, tools: toolsForPortalAgent(agent, allTools) };
}

export function portalAgentAllowsTool(agentTools: readonly Anthropic.Tool[], toolName: string): boolean {
  return agentTools.some((tool) => tool.name === toolName);
}
