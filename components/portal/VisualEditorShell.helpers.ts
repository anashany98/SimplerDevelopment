// Shared helpers for VisualEditorShell.tsx — extracted so the shell component
// stays under the file-size budget. Pure functions only; no component state.

import type { Block } from '@/types/blocks';
import { insertBlockAfter } from '@/lib/utils/blockHelpers';

/** Shape of an html-render block's `values` map. */
export type BlockValues = Record<
  string,
  string | Array<Record<string, string>> | Record<string, string>
>;

/**
 * Apply a single field write into an html-render block's `values` map,
 * honoring the dotted-field conventions used by both the inline content-edit
 * channel (`onBlockContentUpdated`) and the image-picker swap flow:
 *   - `field` (no dots): top-level value write.
 *   - `groupName.subKey`: group / link sub-field write.
 *   - `arrayName.index.subKey`: array-item sub-field write (one nesting level).
 */
export function applyDottedFieldUpdate(
  existing: BlockValues,
  field: string,
  value: string,
): BlockValues {
  const parts = field.split('.');
  if (parts.length >= 3) {
    // arrayName.index.subfield  (only one nesting level supported)
    const [arrayName, idxStr, ...rest] = parts;
    const idx = parseInt(idxStr, 10);
    const subKey = rest.join('.');
    const prevArr = existing[arrayName];
    const arr = Array.isArray(prevArr) ? [...prevArr] : [];
    const item = { ...(arr[idx] || {}), [subKey]: value };
    arr[idx] = item;
    return { ...existing, [arrayName]: arr };
  } else if (parts.length === 2) {
    // groupName.subfield — group / link sub-fields. Without this branch
    // the write would land in `values["groupName.subfield"]` (a literal
    // dotted key) which the renderer never reads.
    const [groupName, subKey] = parts;
    const prev = existing[groupName];
    const obj: Record<string, string> = (prev && typeof prev === 'object' && !Array.isArray(prev))
      ? (prev as Record<string, string>) : {};
    return { ...existing, [groupName]: { ...obj, [subKey]: value } };
  }
  return { ...existing, [field]: value };
}

/**
 * Factory for the blank text block inserted by "add block after" flows (both
 * the parent-side button and the iframe's onAddBlockAfter message). `uid`
 * is injected for testability — callers pass a Date/random-derived suffix.
 */
export function createTextBlock(uid: string): Block {
  return {
    id: `block-${uid}`,
    type: 'text' as const,
    order: 0,
    content: 'New block — click to edit',
  } as Block;
}

/**
 * Insert `newBlock` right after `blockId`, handling nested blocks via the
 * recursive helper. Top-level splice first (O(n) scan, no recursion).
 */
export function insertNewBlockAfter(blocks: Block[], blockId: string, newBlock: Block): Block[] {
  const topIdx = blocks.findIndex((b) => b.id === blockId);
  if (topIdx !== -1) {
    const updated = [...blocks];
    updated.splice(topIdx + 1, 0, newBlock);
    return updated;
  }
  return insertBlockAfter(blocks, blockId, newBlock);
}

/** Default payload per array field for "__add_array_item" inserts. */
const ARRAY_ITEM_DEFAULTS: Record<string, (uid: string) => Record<string, unknown>> = {
  cards: (uid) => ({ id: uid, title: 'New card', description: '' }),
  stats: (uid) => ({ id: uid, value: '0', label: 'New stat' }),
  images: (uid) => ({ id: uid, url: '', alt: '' }),
  services: (uid) => ({ id: uid, title: 'New service', description: '' }),
  items: (uid) => ({ id: uid, title: 'New item', content: '' }),
  tabs: (uid) => ({ id: uid, label: 'New Tab', blocks: [] }),
};

/**
 * Build a new array item for `__add_array_item` inserts (cards, stats,
 * images, services, items, tabs). Unknown fields fall back to a bare `{ id }`
 * so the insert never drops the write. `uid` injected for testability.
 */
export function createArrayItem(arrayField: string, uid: string): Record<string, unknown> {
  const factory = ARRAY_ITEM_DEFAULTS[arrayField];
  return factory ? factory(uid) : { id: uid };
}
