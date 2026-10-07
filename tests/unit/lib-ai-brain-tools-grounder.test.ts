// @vitest-environment node
/**
 * Unit tests for lib/ai/brain-tools/grounder.ts
 *
 * The grounder is the production anti-hallucination guard. Its failure modes
 * must fail CLOSED — an unverifiable answer should surface the "I don't know"
 * disclaimer, never pass through as confidently grounded.
 */
import { describe, it, expect, vi } from 'vitest';
import type Anthropic from '@anthropic-ai/sdk';
import { checkGroundedness } from '@/lib/ai/brain-tools/grounder';

function fakeAnthropic(create: (...args: unknown[]) => unknown): Anthropic {
  return { messages: { create } } as unknown as Anthropic;
}

describe('checkGroundedness', () => {
  it('parses and normalizes the grade tool_use block', async () => {
    const create = vi.fn().mockResolvedValue({
      content: [
        {
          type: 'tool_use',
          name: 'grade',
          input: { confidence: 1.5, grounded: true, sources: ['note-1', 2], uncertain: false },
        },
      ],
    });
    const res = await checkGroundedness('q', 'a', '[]', fakeAnthropic(create));
    expect(res).toEqual({ confidence: 1, grounded: true, sources: ['note-1', '2'], uncertain: false });
  });

  it('applies field defaults when the grade block omits values', async () => {
    const create = vi.fn().mockResolvedValue({
      content: [{ type: 'tool_use', name: 'grade', input: {} }],
    });
    const res = await checkGroundedness('q', 'a', '[]', fakeAnthropic(create));
    expect(res).toEqual({ confidence: 0.8, grounded: true, sources: [], uncertain: false });
  });

  it('fails CLOSED when the API returns no grade tool_use block', async () => {
    const create = vi.fn().mockResolvedValue({
      content: [{ type: 'text', text: 'I could not grade this.' }],
    });
    const res = await checkGroundedness('q', 'a', '[]', fakeAnthropic(create));
    expect(res).toEqual({ confidence: 0, grounded: false, sources: [], uncertain: true });
  });

  it('fails CLOSED when the grade block has a different tool name', async () => {
    const create = vi.fn().mockResolvedValue({
      content: [{ type: 'tool_use', name: 'other_tool', input: { confidence: 0.99, grounded: true, sources: [], uncertain: false } }],
    });
    const res = await checkGroundedness('q', 'a', '[]', fakeAnthropic(create));
    expect(res).toEqual({ confidence: 0, grounded: false, sources: [], uncertain: true });
  });

  it('fails CLOSED when the API call throws', async () => {
    const create = vi.fn().mockRejectedValue(new Error('network down'));
    const res = await checkGroundedness('q', 'a', '[]', fakeAnthropic(create));
    expect(res).toEqual({ confidence: 0, grounded: false, sources: [], uncertain: true });
  });
});
