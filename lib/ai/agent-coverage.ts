import type Anthropic from '@anthropic-ai/sdk';
import type { PortalAgentProfile } from './portal-agents';
import { toolsForPortalAgent } from './portal-agent-tools';
import { BRAIN_TOOLS } from './brain-tools';

export interface AgentToolCoverage {
  toolCount: number;
  coveragePercent: number;
  lowCoverage: boolean;
}

/**
 * The Company Brain agent is a dedicated RAG agent with its own tool registry
 * (BRAIN_TOOLS) rather than a slice of the portal tool catalog. Counting it
 * against `allTools` via its `domains` would show ~2 dashboard tools and flag
 * it as low-coverage — misleading. Measure it against its real surface instead.
 */
function toolCountForAgent(agent: PortalAgentProfile, allTools: Anthropic.Tool[]): number {
  if (agent.id === 'knowledge') return BRAIN_TOOLS.length;
  return toolsForPortalAgent(agent, allTools).length;
}

export function getAgentToolCoverage(
  agent: PortalAgentProfile,
  allTools: Anthropic.Tool[],
): AgentToolCoverage {
  const toolCount = toolCountForAgent(agent, allTools);
  const coveragePercent = allTools.length === 0 ? 0 : Math.round((toolCount / allTools.length) * 100);
  return { toolCount, coveragePercent, lowCoverage: toolCount <= 3 };
}
