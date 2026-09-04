/**
 * Shared primitives for the per-domain Brain MCP adapters
 * (lib/brain/adapters/*). Split out of lib/brain/mcp-sdk-adapter.ts so the
 * 5k-line registrar can be decomposed domain by domain without duplicating
 * helpers or creating import cycles (adapters must never import the main
 * registrar — it imports them).
 */

/** Error-shaped MCP tool result. */
export function err(message: string) {
  return { content: [{ type: 'text' as const, text: message }], isError: true };
}
