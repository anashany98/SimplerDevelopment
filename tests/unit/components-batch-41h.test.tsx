// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Mocks for heavy deps
// ---------------------------------------------------------------------------

// framer-motion -> plain element passthrough
vi.mock('framer-motion', () => {
  const passthrough = (tag: string) =>
    function MotionMock({ children, className, style, ...rest }: any) {
      // Strip motion-only props so React doesn't warn about unknown DOM attrs
      const {
        whileHover: _wh,
        whileTap: _wt,
        whileInView: _wv,
        whileFocus: _wf,
        initial: _i,
        animate: _a,
        exit: _e,
        transition: _t,
        viewport: _v,
        variants: _va,
        ...domRest
      } = rest;
      return React.createElement(
        tag,
        { className, style, 'data-motion': tag, ...domRest },
        children,
      );
    };
  const motion: any = new Proxy(
    {},
    {
      get: (_target, prop: string) => passthrough(prop),
    },
  );
  return { motion };
});

// next/link -> plain anchor
vi.mock('next/link', () => ({
  __esModule: true,
  default: ({ children, href, ...rest }: any) =>
    React.createElement('a', { href, ...rest }, children),
}));

// ---------------------------------------------------------------------------
// Imports under test (after mocks)
// ---------------------------------------------------------------------------
import { Icon } from '@/components/ui/Icon';
import { Card } from '@/components/ui/Card';

// ---------------------------------------------------------------------------
// Icon
// ---------------------------------------------------------------------------
describe('Icon', () => {
  it('returns null when no name is supplied', () => {
    const { container } = render(<Icon name="" />);
    expect(container.firstChild).toBeNull();
  });

  it('renders an inline SVG for a mapped Material name', () => {
    const { container } = render(<Icon name="rocket_launch" />);
    const svg = container.querySelector('svg');
    expect(svg).toBeTruthy();
    // Icon.tsx renders its own inline SVG (path data extracted from
    // react-icons/md, not imported from it) with aria-hidden defaulted to true.
    expect(svg?.getAttribute('aria-hidden')).toBe('true');
  });

  it('applies numeric size as a px fontSize on the rendered SVG', () => {
    const { container } = render(<Icon name="home" size={24} />);
    const svg = container.querySelector('svg') as SVGElement;
    expect(svg.getAttribute('style')).toContain('font-size: 24px');
  });

  it('passes through string size verbatim', () => {
    const { container } = render(<Icon name="home" size="2rem" />);
    const svg = container.querySelector('svg') as SVGElement;
    expect(svg.getAttribute('style')).toContain('font-size: 2rem');
  });

  it('forwards className to the resolved react-icons component', () => {
    const { container } = render(<Icon name="check" className="my-icon" />);
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('class')).toContain('my-icon');
  });

  it('falls back to a material-icons span when the name is not mapped', () => {
    const { container } = render(<Icon name="not_a_real_icon_xyz" />);
    const span = container.querySelector('span.material-icons');
    expect(span).toBeTruthy();
    expect(span?.textContent).toBe('not_a_real_icon_xyz');
  });

  it('respects an explicit aria-hidden=false', () => {
    const { container } = render(<Icon name="not_mapped_icon_zzz" aria-hidden={false} />);
    const span = container.querySelector('span.material-icons');
    expect(span?.getAttribute('aria-hidden')).toBe('false');
  });
});

// ---------------------------------------------------------------------------
// Card
// ---------------------------------------------------------------------------
describe('Card', () => {
  it('renders the title and description (no link, no image, no icon)', () => {
    const { container } = render(
      <Card title="Hello" description="A short description" />,
    );
    expect(container.querySelector('h3')?.innerHTML).toBe('Hello');
    expect(container.textContent).toContain('A short description');
    // No anchor wrapper when there is no link
    expect(container.querySelector('a')).toBeNull();
  });

  it('wraps the card in a Link when link is provided and shows the Learn more affordance', () => {
    const { container } = render(
      <Card title="Cardy" description="d" link="/somewhere" />,
    );
    const a = container.querySelector('a');
    expect(a).toBeTruthy();
    expect(a?.getAttribute('href')).toBe('/somewhere');
    expect(container.textContent).toContain('Learn more');
  });

  it('renders the image when supplied', () => {
    const { container } = render(
      <Card title="t" description="d" image="https://example.com/x.jpg" />,
    );
    const img = container.querySelector('img');
    expect(img?.getAttribute('src')).toBe('https://example.com/x.jpg');
    expect(img?.getAttribute('alt')).toBe('t');
  });

  it('renders the icon (mapped) when icon prop is set', () => {
    const { container } = render(
      <Card title="t" description="d" icon="rocket_launch" iconSize="32" />,
    );
    // Mapped icon → svg, not a material-icons span
    expect(container.querySelector('svg')).toBeTruthy();
  });

  it('renders subtitle when provided', () => {
    const { container } = render(
      <Card title="t" description="d" subtitle="my subtitle" />,
    );
    expect(container.textContent).toContain('my subtitle');
  });

  it('applies the provided className to the inner motion wrapper', () => {
    const { container } = render(
      <Card title="t" description="d" className="extra-card-class" />,
    );
    const motionDiv = container.querySelector('[data-motion="div"]') as HTMLElement;
    expect(motionDiv).toBeTruthy();
    expect(motionDiv.className).toContain('extra-card-class');
  });
});


