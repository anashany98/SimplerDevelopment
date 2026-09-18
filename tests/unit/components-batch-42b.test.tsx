// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Mocks for heavy deps (declared before imports under test)
// ---------------------------------------------------------------------------

// framer-motion -> passthrough so FadeIn/SlideIn inside ContactForm don't
// try to animate / measure DOM in jsdom.
vi.mock('framer-motion', () => {
  const passthrough = (tag: string): React.FC<{ children?: React.ReactNode; className?: string; style?: React.CSSProperties; [key: string]: unknown }> =>
    function MotionMock({ children, className, style, ...rest }: { children?: React.ReactNode; className?: string; style?: React.CSSProperties; [key: string]: unknown }) {
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
  const motion: Record<string, unknown> = new Proxy(
    {},
    { get: (_t: object, prop: string) => passthrough(prop) },
  );
  return { motion, AnimatePresence: ({ children }: { children?: React.ReactNode }) => children };
});

// Button mock — render a real <button> with passed props
vi.mock('@/components/ui/Button', () => ({
  Button: ({ children, ...rest }: { children?: React.ReactNode; [key: string]: unknown }) =>
    React.createElement('button', rest, children),
}));

// BlockRenderer mock — just print a sentinel so SlideBlockWrapper test can
// verify the props it receives without pulling in the full block registry.
vi.mock('@/components/blocks/render/BlockRenderer', () => ({
  BlockRenderer: ({ content }: { content?: string }) =>
    React.createElement('div', { 'data-testid': 'block-renderer', 'data-content': content }),
}));

// next/link -> plain anchor
vi.mock('next/link', () => ({
  __esModule: true,
  default: ({ children, href, ...rest }: { children?: React.ReactNode; href?: string; [key: string]: unknown }) =>
    React.createElement('a', { href, ...rest }, children),
}));

// ---------------------------------------------------------------------------
// Imports under test
// ---------------------------------------------------------------------------
import { SlideBlockWrapper } from '@/components/pitch-deck/SlideBlockWrapper';
import MediaDetailModal from '@/components/admin/MediaDetailModal';
import GraphHoverBacklinks from '@/components/brain/GraphHoverBacklinks';

// ---------------------------------------------------------------------------
// SlideBlockWrapper
// ---------------------------------------------------------------------------
describe('SlideBlockWrapper', () => {
  const theme = {
    textColor: '#111111',
    backgroundColor: '#ffffff',
    primaryColor: '#ff0066',
    accentColor: '#00ccff',
    headingFont: 'Inter',
    bodyFont: 'Roboto',
  } as unknown as Parameters<typeof SlideBlockWrapper>[0]['theme'];

  it('renders BlockRenderer with serialized slide content', () => {
    const slide = {
      blocks: [{ id: 'b1', type: 'text', content: { text: 'hello' } }],
      pageSettings: {},
    } as unknown as Parameters<typeof SlideBlockWrapper>[0]['slide'];

    render(<SlideBlockWrapper slide={slide} theme={theme} />);
    const renderer = screen.getByTestId('block-renderer');
    const content = renderer.getAttribute('data-content') || '';
    expect(content).toContain('"version":"1.0"');
    expect(content).toContain('"blocks"');
    expect(content).toContain('hello');
  });

  it('sets CSS custom properties from theme imperatively after mount', () => {
    const slide = { blocks: [], pageSettings: {} } as unknown as Parameters<typeof SlideBlockWrapper>[0]['slide'];
    const { container } = render(<SlideBlockWrapper slide={slide} theme={theme} />);
    const root = container.querySelector('.slide-themed') as HTMLElement;
    expect(root).toBeTruthy();
    // Verify a few of the variables landed
    expect(root.style.getPropertyValue('--foreground')).toBe('#111111');
    expect(root.style.getPropertyValue('--background')).toBe('#ffffff');
    expect(root.style.getPropertyValue('--primary')).toBe('#ff0066');
  });

  it('renders background image overlay when pageSettings.backgroundImage is set', () => {
    const slide = {
      blocks: [],
      pageSettings: { backgroundImage: 'https://example.com/bg.jpg', backgroundOpacity: 0.5 },
    } as unknown as Parameters<typeof SlideBlockWrapper>[0]['slide'];
    const { container } = render(<SlideBlockWrapper slide={slide} theme={theme} />);
    const overlay = container.querySelector('div[style*="background-image"]') as HTMLElement;
    expect(overlay).toBeTruthy();
    expect(overlay.style.opacity).toBe('0.5');
  });

  it('renders background video element when pageSettings.backgroundVideo is set', () => {
    const slide = {
      blocks: [],
      pageSettings: { backgroundVideo: 'https://example.com/bg.mp4' },
    } as unknown as Parameters<typeof SlideBlockWrapper>[0]['slide'];
    const { container } = render(<SlideBlockWrapper slide={slide} theme={theme} />);
    const video = container.querySelector('video');
    expect(video).toBeTruthy();
    expect(video?.getAttribute('src')).toBe('https://example.com/bg.mp4');
  });

  it('applies fullBleed styling when fullBleed=true (no max-width container)', () => {
    const slide = { blocks: [], pageSettings: {} } as unknown as Parameters<typeof SlideBlockWrapper>[0]['slide'];
    const { container } = render(
      <SlideBlockWrapper slide={slide} theme={theme} fullBleed />,
    );
    // fullBleed inner wrapper should be class "w-full" exactly (no max-w-6xl)
    const renderer = container.querySelector('[data-testid="block-renderer"]') as HTMLElement;
    const innerWrapper = renderer.parentElement;
    expect(innerWrapper?.className).toBe('w-full');
    expect(innerWrapper?.className).not.toContain('max-w-6xl');
  });

  it('uses 100vh min-height in presentation mode', () => {
    const slide = { blocks: [], pageSettings: {} } as unknown as Parameters<typeof SlideBlockWrapper>[0]['slide'];
    const { container } = render(
      <SlideBlockWrapper slide={slide} theme={theme} presentation />,
    );
    const root = container.querySelector('.slide-themed') as HTMLElement;
    expect(root.style.minHeight).toBe('100vh');
  });
});

// ---------------------------------------------------------------------------
// MediaDetailModal
// ---------------------------------------------------------------------------
describe('MediaDetailModal', () => {
  const baseMedia = {
    id: 42,
    filename: 'photo.jpg',
    url: 'https://cdn.example.com/photo.jpg',
    mimeType: 'image/jpeg',
    fileSize: 2048,
    width: 800,
    height: 600,
    alt: 'A photo',
    caption: 'A nice photo',
    createdAt: '2026-01-01T00:00:00.000Z',
  };

  beforeEach(() => {
    (global as Record<string, unknown>).fetch = vi.fn().mockResolvedValue({ ok: true });
    (global as Record<string, unknown>).alert = vi.fn();
    (global as Record<string, unknown>).confirm = vi.fn().mockReturnValue(true);
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders media details and image preview', () => {
    render(
      <MediaDetailModal media={baseMedia} onClose={() => {}} onUpdate={() => {}} />,
    );
    expect(screen.getByText('Detalles del archivo')).toBeTruthy();
    expect(screen.getByText('photo.jpg')).toBeTruthy();
    expect(screen.getByText('image/jpeg')).toBeTruthy();
    // 2048 bytes -> "2.0 KB"
    expect(screen.getByText(/2\.0 KB/)).toBeTruthy();
    expect(screen.getByText(/800 × 600/)).toBeTruthy();
    const img = document.querySelector('img');
    expect(img?.getAttribute('src')).toBe(baseMedia.url);
  });

  it('renders a video element when mimeType is video', () => {
    const media = { ...baseMedia, mimeType: 'video/mp4', url: 'https://cdn/example.mp4' };
    render(<MediaDetailModal media={media} onClose={() => {}} onUpdate={() => {}} />);
    const video = document.querySelector('video');
    expect(video).toBeTruthy();
    expect(video?.getAttribute('src')).toBe(media.url);
  });

  it('renders a generic placeholder for non-image, non-video mime types', () => {
    const media = { ...baseMedia, mimeType: 'application/pdf' };
    render(<MediaDetailModal media={media} onClose={() => {}} onUpdate={() => {}} />);
    expect(screen.getByText('description')).toBeTruthy();
  });

  it('calls onClose when the close icon button is clicked', () => {
    const onClose = vi.fn();
    render(<MediaDetailModal media={baseMedia} onClose={onClose} onUpdate={() => {}} />);
    // close button has only an icon span; pick by its text content
    const closeBtns = screen.getAllByText('close');
    fireEvent.click(closeBtns[0].closest('button')!);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('copies URL to clipboard and alerts', () => {
    render(
      <MediaDetailModal media={baseMedia} onClose={() => {}} onUpdate={() => {}} />,
    );
    fireEvent.click(screen.getByRole('button', { name: /copiar url/i }));
    expect((navigator.clipboard as { writeText: (text: string) => Promise<void> }).writeText).toHaveBeenCalledWith(baseMedia.url);
    expect((global as Record<string, unknown>).alert).toHaveBeenCalledWith('URL copiada al portapapeles');
  });

  it('toggles edit mode and saves metadata via PUT /api/media/:id', async () => {
    const onUpdate = vi.fn();
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    (global as Record<string, unknown>).fetch = fetchMock;

    render(
      <MediaDetailModal media={baseMedia} onClose={() => {}} onUpdate={onUpdate} />,
    );
    fireEvent.click(screen.getByRole('button', { name: /editar metadatos/i }));

    const altInput = screen.getByDisplayValue('A photo') as HTMLInputElement;
    fireEvent.change(altInput, { target: { value: 'New alt' } });

    fireEvent.click(screen.getByRole('button', { name: /^guardar$/i }));
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/media/42');
    expect(init.method).toBe('PUT');
    const body = JSON.parse(init.body);
    expect(body.alt).toBe('New alt');
    expect(body.caption).toBe('A nice photo');
    await waitFor(() => {
      expect(onUpdate).toHaveBeenCalled();
    });
  });

  it('deletes media when confirmed and calls onUpdate + onClose', async () => {
    const onUpdate = vi.fn();
    const onClose = vi.fn();
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    (global as Record<string, unknown>).fetch = fetchMock;

    render(
      <MediaDetailModal media={baseMedia} onClose={onClose} onUpdate={onUpdate} />,
    );
    fireEvent.click(screen.getByRole('button', { name: /eliminar/i }));
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
    expect(fetchMock.mock.calls[0][0]).toBe('/api/media/42');
    expect(fetchMock.mock.calls[0][1].method).toBe('DELETE');
    await waitFor(() => {
      expect(onUpdate).toHaveBeenCalled();
      expect(onClose).toHaveBeenCalled();
    });
  });

  it('does not delete when confirm returns false', () => {
    (global as Record<string, unknown>).confirm = vi.fn().mockReturnValue(false);
    const fetchMock = vi.fn();
    (global as Record<string, unknown>).fetch = fetchMock;
    render(
      <MediaDetailModal media={baseMedia} onClose={() => {}} onUpdate={() => {}} />,
    );
    fireEvent.click(screen.getByRole('button', { name: /eliminar/i }));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('formats file size — bytes, KB, MB', () => {
    const tiny = { ...baseMedia, fileSize: 500 };
    const { rerender } = render(
      <MediaDetailModal media={tiny} onClose={() => {}} onUpdate={() => {}} />,
    );
    expect(screen.getByText(/500 B/)).toBeTruthy();

    rerender(
      <MediaDetailModal
        media={{ ...baseMedia, fileSize: 2_500_000 }}
        onClose={() => {}}
        onUpdate={() => {}}
      />,
    );
    expect(screen.getByText(/2\.4 MB/)).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// GraphHoverBacklinks
// ---------------------------------------------------------------------------
describe('GraphHoverBacklinks', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders nothing when noteId is null', () => {
    const { container } = render(<GraphHoverBacklinks noteId={null} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders shell with loading state while debounce is pending', () => {
    (global as Record<string, unknown>).fetch = vi.fn().mockImplementation(
      () => new Promise(() => {}),
    );
    render(<GraphHoverBacklinks noteId={7} />);
    expect(screen.getByText(/loading…/i)).toBeTruthy();
    expect(screen.getByText(/loading backlinks/i)).toBeTruthy();
  });

  it('debounces fetch by 250ms then loads note + backlinks', async () => {
    const fetchMock = vi.fn()
      // GET /knowledge/:id
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: { id: 7, title: 'Source Note', tags: ['idea', 'project'] },
        }),
      })
      // GET /knowledge/:id/backlinks
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: {
            items: [
              { id: 11, title: 'Linker A', snippet: 'A snippet', displayText: 'alias', updatedAt: '2026-01-01' },
              { id: 12, title: 'Linker B', snippet: '', displayText: null, updatedAt: '2026-01-02' },
            ],
          },
        }),
      });
    (global as Record<string, unknown>).fetch = fetchMock;

    render(<GraphHoverBacklinks noteId={7} />);

    // Before the debounce fires, no fetch yet
    expect(fetchMock).not.toHaveBeenCalled();

    // Wait for the 250ms debounce + fetch resolution (real timers)
    await new Promise((r) => setTimeout(r, 300));

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][0]).toContain('/api/portal/brain/knowledge/7');
    expect(fetchMock.mock.calls[1][0]).toContain('/api/portal/brain/knowledge/7/backlinks');

    await waitFor(() => {
      expect(screen.getByText('Source Note')).toBeTruthy();
    });
    expect(screen.getByText('Linker A')).toBeTruthy();
    expect(screen.getByText('Linker B')).toBeTruthy();
    expect(screen.getByText(/via/)).toBeTruthy();
  });

  it('shows an empty-state message when there are zero backlinks', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: { id: 9, title: 'Lonely', tags: [] } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: { items: [] } }),
      });
    (global as Record<string, unknown>).fetch = fetchMock;
    render(<GraphHoverBacklinks noteId={9} />);
    // Wait for the 250ms debounce + fetch resolution (real timers)
    await new Promise((r) => setTimeout(r, 300));
    await waitFor(() => {
      expect(screen.getByText(/no backlinks yet/i)).toBeTruthy();
    });
  });

  it('shows error state when backlinks request fails', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: { id: 9, title: 'Borked', tags: [] } }),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({ success: false, message: 'boom' }),
      });
    (global as Record<string, unknown>).fetch = fetchMock;
    render(<GraphHoverBacklinks noteId={9} />);
    // Wait for the 250ms debounce + fetch resolution (real timers)
    await new Promise((r) => setTimeout(r, 300));
    await waitFor(() => {
      expect(screen.getByText(/failed to load backlinks: boom/i)).toBeTruthy();
    });
  });

  it('invokes onClose when the close button is clicked', async () => {
    (global as Record<string, unknown>).fetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: { id: 1, title: 'N', tags: [] } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: { items: [] } }),
      });

    const onClose = vi.fn();
    render(<GraphHoverBacklinks noteId={1} onClose={onClose} />);
    // Wait for the 250ms debounce + fetch resolution (real timers)
    await new Promise((r) => setTimeout(r, 300));
    fireEvent.click(screen.getByLabelText(/close backlinks panel/i));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onSelectNote when a backlink row is clicked', async () => {
    const onSelectNote = vi.fn();
    (global as Record<string, unknown>).fetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: { id: 1, title: 'N', tags: [] } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: {
            items: [
              { id: 99, title: 'Click me', snippet: '', displayText: null, updatedAt: '2026-01-01' },
            ],
          },
        }),
      });

    render(<GraphHoverBacklinks noteId={1} onSelectNote={onSelectNote} />);
    // Wait for the 250ms debounce + fetch resolution (real timers)
    await new Promise((r) => setTimeout(r, 300));

    await waitFor(() => {
      expect(screen.getByText('Click me')).toBeTruthy();
    });
    fireEvent.click(screen.getByText('Click me').closest('button')!);
    expect(onSelectNote).toHaveBeenCalledWith(99);
  });
});
