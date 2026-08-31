/**
 * The provider-agnostic LLM seam. Call sites use `complete` / `completeObject`
 * / `streamComplete` with a `task` tag; the model is resolved from the registry
 * (`lib/ai/models.ts`) so swapping a provider/model for any aspect is config,
 * not a code change. Tool-calling + streaming are normalized by the Vercel AI
 * SDK across Anthropic / Hugging Face / OpenAI.
 */

import {
  generateText,
  generateObject,
  streamText,
  type ModelMessage,
  type ToolSet,
  type ToolChoice,
} from 'ai';
import { z } from 'zod';
import { getModelForTask, type AiTask } from './models';

export interface BaseLlmOpts {
  /** Which aspect of AI use this is — selects the model via the registry. */
  task: AiTask;
  /** Tenant — drives BYOK key resolution. */
  clientId: number;
  system?: string;
  prompt?: string;
  messages?: ModelMessage[];
  maxTokens?: number;
  temperature?: number;
}

/**
 * The AI SDK types the prompt as `prompt` XOR `messages` (a union), so we must
 * include exactly one key — never both, even set to undefined.
 */
function promptPart(opts: BaseLlmOpts): { messages: ModelMessage[] } | { prompt: string } {
  return opts.messages !== undefined
    ? { messages: opts.messages }
    : { prompt: opts.prompt ?? '' };
}

/** One-shot text (optionally with tools). Mirrors Anthropic `messages.create`. */
export async function complete(
  opts: BaseLlmOpts & { tools?: ToolSet; toolChoice?: ToolChoice<ToolSet> },
) {
  const { model } = await getModelForTask(opts.task, opts.clientId);
  return generateText({
    model,
    system: opts.system,
    maxOutputTokens: opts.maxTokens,
    temperature: opts.temperature,
    tools: opts.tools,
    toolChoice: opts.toolChoice,
    ...promptPart(opts),
  });
}

/** Extract the first balanced JSON object from free-form model text. */
export function extractJsonObject(raw: string): unknown {
  const start = raw.indexOf('{');
  if (start === -1) throw new Error('AI returned no JSON object');
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < raw.length; i++) {
    const ch = raw[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === '\\') esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return JSON.parse(raw.slice(start, i + 1));
    }
  }
  throw new Error('AI returned malformed JSON (unbalanced braces)');
}

/** Forced structured output — replaces the `tool_choice`-to-get-JSON pattern.
 *
 * Provider split (2026-08-29): the AI SDK's object mode for OpenAI-compatible
 * providers sends `response_format.type='json_object'`, which local servers
 * (LM Studio, Ollama, …) reject with 400 — only 'json_schema' or 'text' are
 * accepted. Anthropic keeps generateObject (its structured output is
 * tool-based and works). Everything else gets generateText with the JSON
 * Schema embedded in the system prompt + tolerant parse + zod validation.
 */
export async function completeObject<T>(
  opts: BaseLlmOpts & { schema: z.ZodType<T> },
): Promise<{ object: T; usage: Awaited<ReturnType<typeof generateObject>>['usage'] }> {
  const { model, choice } = await getModelForTask(opts.task, opts.clientId);
  if (choice.provider === 'anthropic') {
    const result = await generateObject({
      model,
      schema: opts.schema,
      system: opts.system,
      maxOutputTokens: opts.maxTokens,
      temperature: opts.temperature,
      ...promptPart(opts),
    });
    return { object: result.object as T, usage: result.usage };
  }
  let schemaJson = '';
  try {
    schemaJson = JSON.stringify(z.toJSONSchema(opts.schema));
  } catch {
    schemaJson = '(schema not serializable — return a valid JSON object with the fields the task describes)';
  }
  const text = await generateText({
    model,
    system: [
      opts.system ?? '',
      'Respond with ONLY a single JSON object (no prose, no markdown fences) that validates against this JSON Schema:',
      schemaJson,
    ].filter(Boolean).join('\n'),
    maxOutputTokens: opts.maxTokens,
    temperature: opts.temperature,
    ...promptPart(opts),
  });
  return { object: opts.schema.parse(extractJsonObject(text.text)) as T, usage: text.usage as Awaited<ReturnType<typeof generateObject>>['usage'] };
}

/** Streaming text (optionally agentic with tools + multi-step). */
export async function streamComplete(
  opts: BaseLlmOpts & { tools?: ToolSet; toolChoice?: ToolChoice<ToolSet> },
) {
  const { model } = await getModelForTask(opts.task, opts.clientId);
  return streamText({
    model,
    system: opts.system,
    maxOutputTokens: opts.maxTokens,
    temperature: opts.temperature,
    tools: opts.tools,
    toolChoice: opts.toolChoice,
    ...promptPart(opts),
  });
}
