import { sanitizeToolResult } from './brain-tools/sanitizer';

export interface LoggedPortalToolCall {
  name: string;
  input: Record<string, unknown>;
  result: unknown;
}

function parseToolResult(result: unknown): unknown {
  if (typeof result !== 'string') return result;

  try {
    return JSON.parse(result) as unknown;
  } catch {
    return null;
  }
}

/** Return the safe application-level error carried by a tool result, if any. */
export function getPortalToolError(result: unknown): string | null {
  const parsed = parseToolResult(result);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;

  const error = (parsed as Record<string, unknown>).error;
  if (typeof error !== 'string' || !error.trim()) return null;

  return sanitizeToolResult(error.trim()).slice(0, 500);
}

export function portalToolCallSucceeded(result: unknown): boolean {
  return getPortalToolError(result) === null;
}

/**
 * Persist only previous tool failures into later model turns. Successful tool
 * payloads stay out of history to avoid duplicating tenant data and tokens.
 * Without this record, a new HTTP turn sees only the assistant prose and can
 * repeat the same failed call indefinitely.
 */
export function enrichPortalHistoryContent(
  role: string,
  content: string,
  toolCalls: LoggedPortalToolCall[] | null | undefined,
): string {
  if (role !== 'assistant' || !Array.isArray(toolCalls)) return content;

  const failures = toolCalls.flatMap((call) => {
    const error = getPortalToolError(call.result);
    return error ? [`- ${call.name}: ${error}`] : [];
  });
  if (failures.length === 0) return content;

  return `${content}\n\n[Previous tool failures — do not repeat the same call with the same inputs]\n${failures.join('\n')}`;
}
