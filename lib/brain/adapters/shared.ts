/**
 * Shared primitives for the per-domain Brain MCP adapters
 * (lib/brain/adapters/*). Split out of lib/brain/mcp-sdk-adapter.ts so the
 * 5k-line registrar can be decomposed domain by domain without duplicating
 * helpers or creating import cycles (adapters must never import the main
 * registrar — it imports them).
 */
import { z } from 'zod';

/** Error-shaped MCP tool result. */
export function err(message: string) {
  return { content: [{ type: 'text' as const, text: message }], isError: true };
}

/** Playbook link target kinds — shared by the playbooks and playbook-runs adapters. */
export const playbookLinkEntityTypeEnum = z.enum(['initiative', 'person', 'crm_company', 'crm_deal', 'meeting', 'decision']);
