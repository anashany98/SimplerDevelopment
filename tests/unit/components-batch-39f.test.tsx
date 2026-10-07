// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';

// ---------------------------------------------------------------------------
// HeadingBlockRender — pure heading renderer with level + alignment + html
// ---------------------------------------------------------------------------
import { HeadingBlockRender } from '@/components/blocks/render/HeadingBlockRender';

describe('HeadingBlockRender', () => {
  it('renders an h2 with the provided content text', () => {
    const block: any = { type: 'heading', level: 2, content: 'Hello World' };
    const { container } = render(<HeadingBlockRender block={block} />);
    const h2 = container.querySelector('h2');
    expect(h2).not.toBeNull();
    expect(h2?.textContent).toBe('Hello World');
  });

  it('renders the correct tag for each heading level', () => {
    for (const level of [1, 2, 3, 4, 5, 6] as const) {
      const block: any = { type: 'heading', level, content: `Level ${level}` };
      const { container } = render(<HeadingBlockRender block={block} />);
      const tag = container.querySelector(`h${level}`);
      expect(tag).not.toBeNull();
      expect(tag?.textContent).toBe(`Level ${level}`);
    }
  });

  it('applies the alignment class (text-center) when alignment="center"', () => {
    const block: any = {
      type: 'heading',
      level: 3,
      content: 'centered',
      alignment: 'center',
    };
    const { container } = render(<HeadingBlockRender block={block} />);
    const h3 = container.querySelector('h3') as HTMLElement;
    expect(h3.className).toContain('text-center');
  });

  it('defaults alignment to left', () => {
    const block: any = { type: 'heading', level: 2, content: 'default-align' };
    const { container } = render(<HeadingBlockRender block={block} />);
    const h2 = container.querySelector('h2') as HTMLElement;
    expect(h2.className).toContain('text-left');
  });

  it('accepts legacy "text" field as a fallback for "content"', () => {
    const block: any = { type: 'heading', level: 4, text: 'legacy-text' };
    const { container } = render(<HeadingBlockRender block={block} />);
    const h4 = container.querySelector('h4');
    expect(h4?.textContent).toBe('legacy-text');
  });

  it('prefers "content" over "text" when both are present', () => {
    const block: any = {
      type: 'heading',
      level: 1,
      content: 'canonical',
      text: 'legacy',
    };
    const { container } = render(<HeadingBlockRender block={block} />);
    const h1 = container.querySelector('h1');
    expect(h1?.textContent).toBe('canonical');
  });

  it('renders raw HTML via dangerouslySetInnerHTML when content contains "<"', () => {
    const block: any = {
      type: 'heading',
      level: 2,
      content: 'Hello <em>world</em>',
    };
    const { container } = render(<HeadingBlockRender block={block} />);
    const h2 = container.querySelector('h2');
    expect(h2?.querySelector('em')?.textContent).toBe('world');
  });

  it('sets the data-editable-field attribute to "content"', () => {
    const block: any = { type: 'heading', level: 2, content: 'editable' };
    const { container } = render(<HeadingBlockRender block={block} />);
    const h2 = container.querySelector('h2');
    expect(h2?.getAttribute('data-editable-field')).toBe('content');
  });

  it('omits "text-foreground" class when style.color is set', () => {
    const block: any = {
      type: 'heading',
      level: 2,
      content: 'colored',
      style: { color: '#ff0000' },
    };
    const { container } = render(<HeadingBlockRender block={block} />);
    const h2 = container.querySelector('h2') as HTMLElement;
    expect(h2.className).not.toContain('text-foreground');
  });

  it('includes "text-foreground" class when style.color is unset', () => {
    const block: any = { type: 'heading', level: 2, content: 'plain' };
    const { container } = render(<HeadingBlockRender block={block} />);
    const h2 = container.querySelector('h2') as HTMLElement;
    expect(h2.className).toContain('text-foreground');
  });
});
