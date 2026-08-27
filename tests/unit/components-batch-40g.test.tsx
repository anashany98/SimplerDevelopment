/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/ban-ts-comment, react-hooks/rules-of-hooks, @typescript-eslint/no-require-imports */
// @vitest-environment jsdom
/**
 * Unit tests for small UI components (batch 40g):
 *
 *   - ThemeToggle   (components/ui/ThemeToggle.tsx)
 *   - Accordion / AccordionItem (components/ui/Accordion.tsx)
 *
 * Renders each with @testing-library/react in jsdom. We mock framer-motion,
 * next-auth/react, next/link, and the local useTheme hook so the tests stay
 * deterministic and don't pull in animation / auth runtimes.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';

// ---------------------------------------------------------------------------
// Cross-cutting mocks
// ---------------------------------------------------------------------------

// framer-motion: every motion.<tag> renders the plain tag, forwarding children
// and className so we can still inspect the DOM.
vi.mock('framer-motion', () => {
  const passthrough = (tag: string) =>
    function MotionMock({ children, className, style }: any) {
      return React.createElement(
        tag,
        { className, style, 'data-motion': tag },
        children,
      );
    };
  const motion: any = new Proxy(
    {},
    {
      get: (_target, prop: string) => passthrough(prop),
    },
  );
  return {
    motion,
    AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  };
});

// next/link → plain <a>
vi.mock('next/link', () => ({
  __esModule: true,
  default: ({
    href,
    children,
    ...rest
  }: { href: string; children: React.ReactNode } & Record<string, unknown>) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

// useTheme — fully controllable from the test side.
const themeState = {
  resolvedTheme: 'light' as 'light' | 'dark',
  toggleTheme: vi.fn(),
};
vi.mock('@/hooks/useTheme', () => ({
  useTheme: () => themeState,
}));

import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { Accordion, AccordionItem } from '@/components/ui/Accordion';

// ---------------------------------------------------------------------------
// ThemeToggle
// ---------------------------------------------------------------------------

describe('ThemeToggle', () => {
  beforeEach(() => {
    themeState.resolvedTheme = 'light';
    themeState.toggleTheme = vi.fn();
  });

  it('renders a button labelled "Toggle theme"', () => {
    render(<ThemeToggle />);
    expect(screen.getByRole('button', { name: /Toggle theme/i })).toBeTruthy();
  }, 15_000);

  it('renders the moon icon path when resolvedTheme is "light"', () => {
    themeState.resolvedTheme = 'light';
    const { container } = render(<ThemeToggle />);
    const path = container.querySelector('path');
    expect(path?.getAttribute('d') ?? '').toMatch(/M20\.354 15\.354/);
  });

  it('renders the sun icon path when resolvedTheme is "dark"', () => {
    themeState.resolvedTheme = 'dark';
    const { container } = render(<ThemeToggle />);
    const path = container.querySelector('path');
    expect(path?.getAttribute('d') ?? '').toMatch(/M12 3v1/);
  });

  it('invokes toggleTheme when the button is clicked', () => {
    render(<ThemeToggle />);
    fireEvent.click(screen.getByRole('button', { name: /Toggle theme/i }));
    expect(themeState.toggleTheme).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// Accordion / AccordionItem
// ---------------------------------------------------------------------------

describe('Accordion', () => {
  it('renders its children inside a wrapper div', () => {
    const { container } = render(
      <Accordion>
        <div data-testid="kid">child</div>
      </Accordion>,
    );
    expect(screen.getByTestId('kid')).toBeTruthy();
    expect((container.firstChild as HTMLElement).tagName).toBe('DIV');
  });

  it('merges the className prop into the wrapper', () => {
    const { container } = render(
      <Accordion className="extra-class">
        <div>child</div>
      </Accordion>,
    );
    expect((container.firstChild as HTMLElement).className).toContain('extra-class');
  });
});

describe('AccordionItem', () => {
  it('hides body content by default', () => {
    render(
      <AccordionItem title="Section 1">
        <p>Hidden body</p>
      </AccordionItem>,
    );
    expect(screen.getByText('Section 1')).toBeTruthy();
    expect(screen.queryByText('Hidden body')).toBeNull();
  });

  it('shows body content when defaultOpen is true', () => {
    render(
      <AccordionItem title="Section 2" defaultOpen>
        <p>Visible body</p>
      </AccordionItem>,
    );
    expect(screen.getByText('Visible body')).toBeTruthy();
  });

  it('toggles the body when the header button is clicked', () => {
    render(
      <AccordionItem title="Toggle me">
        <p>Body text</p>
      </AccordionItem>,
    );
    expect(screen.queryByText('Body text')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Toggle me/ }));
    expect(screen.getByText('Body text')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Toggle me/ }));
    expect(screen.queryByText('Body text')).toBeNull();
  }, 15_000);

  it('adds the rotate-180 class to the chevron when open', () => {
    const { container } = render(
      <AccordionItem title="Open" defaultOpen>
        <p>Body</p>
      </AccordionItem>,
    );
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('class') ?? '').toContain('rotate-180');
  });
});
