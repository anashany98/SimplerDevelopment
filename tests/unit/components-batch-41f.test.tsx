// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Mocks for heavy / framer-motion / 3D / next deps
// ---------------------------------------------------------------------------

// Mock framer-motion so we don't pull in animation runtime / IntersectionObserver.
// Each motion.<tag> returns a plain element that forwards children + className + style.
vi.mock('framer-motion', () => {
  const passthrough = (tag: string) =>
    function MotionMock({ children, className, style, onClick, onMouseMove, onMouseEnter, onMouseLeave, ...rest }: any) {
      // Strip framer-motion-only props that React will warn about
      const cleanRest: Record<string, any> = {};
      for (const [k, v] of Object.entries(rest)) {
        if (
          k === 'initial' ||
          k === 'animate' ||
          k === 'exit' ||
          k === 'transition' ||
          k === 'whileHover' ||
          k === 'whileTap' ||
          k === 'whileInView' ||
          k === 'viewport' ||
          k === 'variants' ||
          k === 'suppressHydrationWarning'
        ) {
          continue;
        }
        cleanRest[k] = v;
      }
      return React.createElement(
        tag,
        {
          className,
          style,
          onClick,
          onMouseMove,
          onMouseEnter,
          onMouseLeave,
          'data-motion': tag,
          ...cleanRest,
        },
        children,
      );
    };
  const motion: any = new Proxy(
    {},
    {
      get: (_target, prop: string) => passthrough(prop),
    },
  );
  const fakeMV = () => {
    const handlers: Array<(v: number) => void> = [];
    return {
      get: () => 0,
      set: (_v: number) => {
        handlers.forEach((h) => h(_v));
      },
      on: (_evt: string, cb: (v: number) => void) => {
        handlers.push(cb);
        return () => {};
      },
    };
  };
  return {
    motion,
    AnimatePresence: ({ children }: any) => React.createElement(React.Fragment, null, children),
    useMotionValue: () => fakeMV(),
    useTransform: () => '0%',
    useSpring: (v: any) => v,
  };
});

// Mock animate.css side-effect import in SelfDestruct
vi.mock('animate.css', () => ({}));

// ---------------------------------------------------------------------------
// Imports under test (AFTER mocks)
// ---------------------------------------------------------------------------

import SelfDestruct from '@/components/easter-eggs/SelfDestruct';

// ---------------------------------------------------------------------------
// SelfDestruct
// ---------------------------------------------------------------------------

describe('SelfDestruct', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders nothing while in idle state', () => {
    const { container } = render(<SelfDestruct />);
    expect(container.firstChild).toBeNull();
  });

  it('attaches a keydown listener to the window', () => {
    const addSpy = vi.spyOn(window, 'addEventListener');
    render(<SelfDestruct />);
    const events = addSpy.mock.calls.map((c) => c[0]);
    expect(events.includes('keydown')).toBe(true);
    addSpy.mockRestore();
  });

  it('removes the keydown listener on unmount', () => {
    const removeSpy = vi.spyOn(window, 'removeEventListener');
    const { unmount } = render(<SelfDestruct />);
    unmount();
    const events = removeSpy.mock.calls.map((c) => c[0]);
    expect(events.includes('keydown')).toBe(true);
    removeSpy.mockRestore();
  });

  it('does not activate when a non-konami key is pressed', () => {
    const { container } = render(<SelfDestruct />);
    fireEvent.keyDown(window, { code: 'KeyZ' });
    // Still nothing rendered
    expect(container.firstChild).toBeNull();
  });

  it('activates the countdown when the konami sequence is entered', () => {
    render(<SelfDestruct />);
    const sequence = [
      'ArrowUp',
      'ArrowUp',
      'ArrowDown',
      'ArrowDown',
      'ArrowLeft',
      'ArrowRight',
      'ArrowLeft',
      'ArrowRight',
      'KeyB',
      'KeyA',
    ];
    for (const code of sequence) {
      fireEvent.keyDown(window, { code });
    }
    // After konami, the overlay's warning text should be in the DOM
    expect(
      screen.getByText(/WARNING: SELF-DESTRUCT SEQUENCE INITIATED/),
    ).toBeTruthy();
  });

  it('resets the konami progress when a wrong key is hit mid-sequence', () => {
    const { container } = render(<SelfDestruct />);
    // Start the sequence but then break it
    fireEvent.keyDown(window, { code: 'ArrowUp' });
    fireEvent.keyDown(window, { code: 'ArrowUp' });
    fireEvent.keyDown(window, { code: 'KeyZ' }); // wrong → reset
    // Finish original sequence — should NOT activate because state was reset
    const rest = [
      'ArrowDown',
      'ArrowDown',
      'ArrowLeft',
      'ArrowRight',
      'ArrowLeft',
      'ArrowRight',
      'KeyB',
      'KeyA',
    ];
    for (const code of rest) {
      fireEvent.keyDown(window, { code });
    }
    expect(container.firstChild).toBeNull();
  });
});
