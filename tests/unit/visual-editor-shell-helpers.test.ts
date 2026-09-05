// @vitest-environment node
/**
 * Unit tests for components/portal/VisualEditorShell.helpers.ts.
 *
 * Pure block-operation helpers extracted from VisualEditorShell so the shell
 * stays composable: dotted field writes, text-block factory, positional
 * insert (top-level splice vs nested recursive), and array-item defaults.
 */
import { describe, it, expect } from 'vitest';
import {
  applyDottedFieldUpdate,
  createArrayItem,
  createTextBlock,
  insertNewBlockAfter,
} from '@/components/portal/VisualEditorShell.helpers';
import type { Block } from '@/types/blocks';

function textBlock(id: string, content = 'x'): Block {
  return { id, type: 'text', order: 0, content } as Block;
}

describe('applyDottedFieldUpdate', () => {
  it('writes top-level fields', () => {
    expect(applyDottedFieldUpdate({}, 'title', 'Hi')).toEqual({ title: 'Hi' });
  });
  it('writes group sub-fields without clobbering siblings', () => {
    const out = applyDottedFieldUpdate({ link: { url: 'a', label: 'b' } } as never, 'link.url', 'c');
    expect(out).toEqual({ link: { url: 'c', label: 'b' } });
  });
  it('writes array-item sub-fields at one nesting level', () => {
    const out = applyDottedFieldUpdate(
      { stats: [{ value: '1', label: 'a' }] } as never,
      'stats.0.label',
      'b',
    );
    expect(out).toEqual({ stats: [{ value: '1', label: 'b' }] });
  });
});

describe('createTextBlock', () => {
  it('builds a blank text block with a stable id suffix', () => {
    const b = createTextBlock('abc123');
    expect(b.id).toBe('block-abc123');
    expect(b.type).toBe('text');
    expect((b as { content?: string }).content).toContain('click to edit');
  });
});

describe('insertNewBlockAfter', () => {
  it('splices after top-level matches without touching the rest', () => {
    const a = textBlock('a');
    const b = textBlock('b');
    const fresh = textBlock('new');
    const out = insertNewBlockAfter([a, b], 'a', fresh);
    expect(out.map((x) => x.id)).toEqual(['a', 'new', 'b']);
    expect(out[2]).toBe(b); // untouched reference
  });
  it('falls back to recursive insert for nested targets', () => {
    const inner = textBlock('inner');
    const section = { id: 'sec', type: 'section', blocks: [inner] } as unknown as Block;
    const fresh = textBlock('new');
    const out = insertNewBlockAfter([section], 'inner', fresh);
    const kids = (out[0] as unknown as { blocks: Block[] }).blocks;
    expect(kids.map((x) => x.id)).toEqual(['inner', 'new']);
  });
});

describe('createArrayItem', () => {
  it.each([
    ['cards', { id: 'u1', title: 'New card', description: '' }],
    ['stats', { id: 'u1', value: '0', label: 'New stat' }],
    ['images', { id: 'u1', url: '', alt: '' }],
    ['services', { id: 'u1', title: 'New service', description: '' }],
    ['items', { id: 'u1', title: 'New item', content: '' }],
    ['tabs', { id: 'u1', label: 'New Tab', blocks: [] }],
  ])('builds defaults for %s', (field, expected) => {
    expect(createArrayItem(field, 'u1')).toEqual(expected);
  });
  it('falls back to a bare id for unknown fields', () => {
    expect(createArrayItem('whatever', 'u9')).toEqual({ id: 'u9' });
  });
});
