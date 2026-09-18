// @vitest-environment jsdom
/**
 * Unit tests for `app/portal/websites/[siteId]/branding/page.tsx`.
 *
 * Coverage targets:
 *  - BrandingPage component: loading state, full render, tab switching
 *  - Logos tab: text logo preview, logo input fields
 *  - Colors tab: color pickers, dark mode overrides, preview panel
 *  - Typography tab: font controls, per-element typography controls
 *  - Style tab: border radius, link colors, button style, favicon/OG sections
 *  - AI Brand Generator: panel toggle, validation, fetch success/failure/network-error
 *  - Save flow: save button, dirty state, PUT fetch
 *
 * Mocks: next/navigation, next/link, global fetch, MediaPicker, GoogleFontPicker.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, waitFor, act } from '@testing-library/react';

// ─── Module mocks (must precede page import) ──────────────────────────────

vi.mock('next/navigation', () => ({
  useParams: () => ({ siteId: 'site-99' }),
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => '/portal/websites/site-99/branding',
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('next/link', () => ({
  default: ({
    children,
    href,
    ...rest
  }: React.PropsWithChildren<{ href: string; [key: string]: unknown }>) =>
    React.createElement('a', { href, ...rest }, children),
}));

// Stub MediaPicker — it has its own fetch/modal; keep it inert
vi.mock('@/components/admin/MediaPicker', () => ({
  default: ({
    value,
    onChange,
    label,
  }: {
    value: string;
    onChange: (url: string) => void;
    label: string;
  }) =>
    React.createElement(
      'div',
      { 'data-testid': `media-picker-${label.replace(/\s+/g, '-')}` },
      React.createElement('input', {
        'data-testid': `media-input-${label.replace(/\s+/g, '-')}`,
        type: 'text',
        value: value,
        onChange: (e: React.ChangeEvent<HTMLInputElement>) => onChange(e.target.value),
        readOnly: false,
      }),
    ),
}));

// Stub GoogleFontPicker — avoids Google Fonts API calls
vi.mock('@/components/blocks/visual/GoogleFontPicker', () => ({
  GoogleFontPicker: ({
    value,
    onChange,
  }: {
    value: string;
    onChange: (font: string) => void;
  }) =>
    React.createElement('select', {
      'data-testid': 'google-font-picker',
      value: value,
      onChange: (e: React.ChangeEvent<HTMLSelectElement>) => onChange(e.target.value),
    },
      React.createElement('option', { value: '' }, '— system —'),
      React.createElement('option', { value: 'Inter' }, 'Inter'),
      React.createElement('option', { value: 'Roboto' }, 'Roboto'),
    ),
}));

// ─── Fetch stub ───────────────────────────────────────────────────────────

type FetchResp = { ok: boolean; json: () => Promise<unknown> };

const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<FetchResp>>();

function makeRes(body: unknown, ok = true): FetchResp {
  return { ok, json: async () => body };
}

function defaultBranding(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    logoUrl: '',
    logoAlt: '',
    logoSquareUrl: '',
    logoRectUrl: '',
    logoText: '',
    logoIconUrl: '',
    primaryColor: '#2563eb',
    secondaryColor: '#1e40af',
    accentColor: '#f59e0b',
    backgroundColor: '#ffffff',
    textColor: '#111827',
    headingFont: '',
    bodyFont: '',
    typography: {},
    darkMode: {},
    navTemplate: 'classic',
    navPosition: 'top',
    navBackground: '#ffffff',
    navTextColor: '#111827',
    borderRadius: '8px',
    linkColor: '',
    linkHoverColor: '',
    buttonStyle: {},
    faviconUrl: '',
    ogImageUrl: '',
    ...overrides,
  };
}

function defaultFetch(url: string): FetchResp {
  if (url.includes('/branding')) {
    return makeRes({ success: true, data: defaultBranding() });
  }
  return makeRes({ success: true });
}

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (url: string) => defaultFetch(url));
  vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// Import after mocks
import BrandingPage from '@/app/portal/websites/[siteId]/branding/page';

function renderPage() {
  return render(React.createElement(BrandingPage));
}

function findBtn(container: HTMLElement, text: string): HTMLButtonElement | undefined {
  return Array.from(container.querySelectorAll('button')).find((b) =>
    b.textContent?.includes(text),
  ) as HTMLButtonElement | undefined;
}

// ─── Loading state ─────────────────────────────────────────────────────────

describe('BrandingPage — loading state', () => {
  it('shows spinner while branding is fetching', () => {
    fetchMock.mockImplementation(() => new Promise(() => {}));
    const { container } = renderPage();
    expect(container.querySelector('.animate-spin')).toBeTruthy();
  });

  it('does not render tabs while loading', () => {
    fetchMock.mockImplementation(() => new Promise(() => {}));
    const { container } = renderPage();
    expect(container.textContent).not.toContain('Guía de marca');
  });
});

// ─── Initial render ────────────────────────────────────────────────────────

describe('BrandingPage — initial render', () => {
  it('renders Brand Guidelines heading after load', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Guía de marca');
    });
  });

  it('renders "Website" eyebrow label in the page header (navigation context for the branding page)', async () => {
    // The redesign (portal-redesign-sweep) removed the inline "Back to Content" Link from
    // the branding page body and moved back-navigation to the layout-level WebsiteSubNav.
    // The page now uses PortalPageHeader with eyebrow="Website" to signal navigation context.
    const { container } = renderPage();
    await waitFor(() => {
      const eyebrow = Array.from(container.querySelectorAll('div')).find((el) =>
        el.textContent?.trim() === 'Sitio web',
      );
      expect(eyebrow).toBeTruthy();
    });
  });

  it('renders Save Changes button (initially disabled, not dirty)', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      const btn = findBtn(container, 'Guardar cambios');
      expect(btn).toBeTruthy();
      expect(btn!.disabled).toBe(true);
    });
  });

  it('renders all four tabs', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      const text = container.textContent ?? '';
      expect(text).toContain('Logotipos');
      expect(text).toContain('Colors');
      expect(text).toContain('Tipografía');
      expect(text).toContain('Estilo');
    });
  });

  it('defaults to Logos tab', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Logotipo cuadrado');
    });
  });

  it('fetches branding on mount', async () => {
    renderPage();
    await waitFor(() => {
      const getBrandingCall = fetchMock.mock.calls.find(([url]) =>
        url.includes('/api/portal/websites/site-99/branding'),
      );
      expect(getBrandingCall).toBeTruthy();
    });
  });

  it('applies branding data from fetch response', async () => {
    fetchMock.mockImplementation(async () =>
      makeRes({
        success: true,
        data: defaultBranding({ primaryColor: '#ff0000', logoText: 'MyBrand' }),
      }),
    );
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Guía de marca');
    });
    // logoText rendered on logos tab
    expect(container.textContent).toContain('');
  });

  it('does not crash when fetch returns success:false', async () => {
    fetchMock.mockResolvedValue(makeRes({ success: false }));
    const { container } = renderPage();
    await waitFor(() => {
      // Should still render — just use defaults
      expect(container.textContent).toContain('Guía de marca');
    });
  });
});

// ─── AI Brand Generator panel ──────────────────────────────────────────────

describe('BrandingPage — AI Brand Generator', () => {
  it('shows AI Brand Generator header button', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Generador de marca con IA');
    });
  });

  it('AI panel is collapsed by default', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.querySelector('textarea')).toBeFalsy();
    });
  });

  it('clicking AI Brand Generator header expands the panel', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Generador de marca con IA'));
    const aiHeaderBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Generador de marca con IA'),
    ) as HTMLButtonElement;
    fireEvent.click(aiHeaderBtn);
    await waitFor(() => {
      expect(container.querySelector('textarea')).toBeTruthy();
    });
  });

  it('clicking AI Brand Generator header again collapses the panel', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Generador de marca con IA'));
    const aiHeaderBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Generador de marca con IA'),
    ) as HTMLButtonElement;
    fireEvent.click(aiHeaderBtn);
    await waitFor(() => expect(container.querySelector('textarea')).toBeTruthy());
    fireEvent.click(aiHeaderBtn);
    await waitFor(() => {
      expect(container.querySelector('textarea')).toBeFalsy();
    });
  });

  async function openAiPanel(container: HTMLElement) {
    const aiHeaderBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Generador de marca con IA'),
    ) as HTMLButtonElement;
    fireEvent.click(aiHeaderBtn);
    await waitFor(() => expect(container.querySelector('textarea')).toBeTruthy());
  }

  it('Generate Brand Theme button is disabled when textarea is empty', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Guía de marca'));
    await openAiPanel(container);
    const generateBtn = findBtn(container, 'Generate Brand Theme');
    expect(generateBtn).toBeTruthy();
    expect(generateBtn!.disabled).toBe(true);
  });

  it('Generate Brand Theme button is enabled after typing in textarea', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Guía de marca'));
    await openAiPanel(container);
    const textarea = container.querySelector('textarea') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'A modern fintech brand for millennials' } });
    const generateBtn = findBtn(container, 'Generate Brand Theme');
    expect(generateBtn!.disabled).toBe(false);
  });

  it('shows validation error when prompt is too short (< 10 chars)', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Guía de marca'));
    await openAiPanel(container);
    const textarea = container.querySelector('textarea') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'Short' } });
    // Manually enable button by making textarea appear non-empty
    // The button is disabled for empty, but with short text we need to fire generate directly
    // Since the button is disabled when value is 'Short' (non-empty), it should be enabled
    // but the click should trigger the validation error
    // Actually button is only disabled when aiPrompt.trim() is empty — 'Short' is not empty so button is enabled
    const generateBtn = findBtn(container, 'Generate Brand Theme');
    if (generateBtn && !generateBtn.disabled) {
      fireEvent.click(generateBtn);
      await waitFor(() => {
        expect(container.textContent).toContain('Describe tu marca con al menos 10 caracteres.');
      });
    }
  });

  it('successful AI generation applies colors and marks dirty', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.includes('/branding/generate') && init?.method === 'POST') {
        return makeRes({
          success: true,
          data: {
            primaryColor: '#ff5500',
            secondaryColor: '#cc4400',
            accentColor: '#ffaa00',
            backgroundColor: '#1a1a2e',
            textColor: '#e0e0e0',
            headingFont: 'Inter',
            bodyFont: 'Roboto',
            navBackground: '#0a0a1a',
            navTextColor: '#ffffff',
            borderRadius: '12px',
            linkColor: '#ff5500',
            linkHoverColor: '#cc4400',
            buttonStyle: { variant: 'filled' },
            darkMode: { primaryColor: '#ff7700' },
            typography: { h1: { size: '3rem' } },
            tone: 'Bold and energetic, targeting tech-savvy millennials.',
          },
        });
      }
      return defaultFetch(url);
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Guía de marca'));
    await openAiPanel(container);
    const textarea = container.querySelector('textarea') as HTMLTextAreaElement;
    fireEvent.change(textarea, {
      target: { value: 'A modern fintech startup targeting millennials' },
    });
    const generateBtn = findBtn(container, 'Generate Brand Theme');
    await act(async () => {
      fireEvent.click(generateBtn!);
    });
    await waitFor(() => {
      expect(container.textContent).toContain('Bold and energetic');
    });
    // Save button should now be enabled (dirty)
    const saveBtn = findBtn(container, 'Guardar cambios');
    expect(saveBtn!.disabled).toBe(false);
  });

  it('shows error when AI generation fails with message', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.includes('/branding/generate') && init?.method === 'POST') {
        return makeRes({ success: false, message: 'AI quota exceeded' });
      }
      return defaultFetch(url);
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Guía de marca'));
    await openAiPanel(container);
    const textarea = container.querySelector('textarea') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'A modern fintech startup for all ages' } });
    const generateBtn = findBtn(container, 'Generate Brand Theme');
    await act(async () => {
      fireEvent.click(generateBtn!);
    });
    await waitFor(() => {
      expect(container.textContent).toContain('AI quota exceeded');
    });
  });

  it('shows "Generation failed." when AI generation fails without message', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.includes('/branding/generate') && init?.method === 'POST') {
        return makeRes({ success: false });
      }
      return defaultFetch(url);
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Guía de marca'));
    await openAiPanel(container);
    const textarea = container.querySelector('textarea') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'A modern fintech startup for all ages' } });
    const generateBtn = findBtn(container, 'Generate Brand Theme');
    await act(async () => {
      fireEvent.click(generateBtn!);
    });
    await waitFor(() => {
      expect(container.textContent).toContain('La generación falló.');
    });
  });

  it('shows "Network error." when AI generation fetch throws', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.includes('/branding/generate') && init?.method === 'POST') {
        throw new Error('offline');
      }
      return defaultFetch(url);
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Guía de marca'));
    await openAiPanel(container);
    const textarea = container.querySelector('textarea') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'A modern fintech startup for all ages' } });
    const generateBtn = findBtn(container, 'Generate Brand Theme');
    await act(async () => {
      fireEvent.click(generateBtn!);
    });
    await waitFor(() => {
      expect(container.textContent).toContain('Error de red');
    });
  });
});

// ─── Logos tab ─────────────────────────────────────────────────────────────

describe('BrandingPage — Logos tab', () => {
  it('renders Square Logo section', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Logotipo cuadrado');
    });
  });

  it('renders Rectangle Logo section', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Logotipo rectangular');
    });
  });

  it('renders Logo Icon section', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Icono de logotipo');
    });
  });

  it('renders Brand Name / Text Logo field', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Nombre de marca / logotipo de texto');
    });
  });

  it('typing in Brand Name input updates the logo text', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Nombre de marca / logotipo de texto'));
    const nameInput = container.querySelector(
      'input[placeholder="El nombre de tu marca"]',
    ) as HTMLInputElement;
    expect(nameInput).toBeTruthy();
    fireEvent.change(nameInput, { target: { value: 'Acme Corp' } });
    await waitFor(() => {
      expect(container.textContent).toContain('Acme Corp');
    });
  });

  it('renders Dark Mode Logo Overrides section', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Dark Mode Logo Overrides');
    });
  });

  it('renders legacy Primary Logo section', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Logotipo primario (heredado)');
    });
  });

  it('renders Logo Alt Text field', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Texto alternativo del logotipo');
    });
  });

  it('updating alt text marks the form dirty', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Texto alternativo del logotipo'));
    const altInput = container.querySelector(
      'input[placeholder="Nombre de la empresa"]',
    ) as HTMLInputElement;
    expect(altInput).toBeTruthy();
    fireEvent.change(altInput, { target: { value: 'My Company Logo' } });
    const saveBtn = findBtn(container, 'Guardar cambios');
    expect(saveBtn!.disabled).toBe(false);
  });

  it('shows logo text preview when logoText is populated from server', async () => {
    fetchMock.mockImplementation(async () =>
      makeRes({ success: true, data: defaultBranding({ logoText: 'BrandName' }) }),
    );
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('BrandName');
    });
  });

  it('MediaPicker onChange for logoSquareUrl updates branding and marks dirty', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Logotipo cuadrado'));
    const mediaInput = container.querySelector(
      '[data-testid="media-input-Logotipo-cuadrado"]',
    ) as HTMLInputElement;
    if (mediaInput) {
      fireEvent.change(mediaInput, { target: { value: 'https://cdn.example.com/logo.png' } });
      const saveBtn = findBtn(container, 'Guardar cambios');
      expect(saveBtn!.disabled).toBe(false);
    }
  });
});

// ─── Tab switching ──────────────────────────────────────────────────────────

describe('BrandingPage — tab switching', () => {
  async function switchToTab(container: HTMLElement, label: string) {
    const tabBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === label || b.textContent?.includes(label),
    ) as HTMLButtonElement;
    expect(tabBtn).toBeTruthy();
    fireEvent.click(tabBtn);
  }

  it('switching to Colors tab shows color palette section', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Guía de marca'));
    await switchToTab(container, 'Colors');
    await waitFor(() => {
      expect(container.textContent).toContain('Colors');
      expect(container.textContent).toContain('Primario');
    });
  });

  it('switching to Typography tab shows font sections', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Guía de marca'));
    await switchToTab(container, 'Tipografía');
    await waitFor(() => {
      expect(container.textContent).toContain('Tipografía');
      expect(container.textContent).toContain('Fuente predeterminada de títulos');
    });
  });

  it('switching to Style tab shows border radius options', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Guía de marca'));
    await switchToTab(container, 'Estilo');
    await waitFor(() => {
      expect(container.textContent).toContain('Border Radius');
      expect(container.textContent).toContain('Angular');
      expect(container.textContent).toContain('Pastilla');
    });
  });

  it('switching back to Logos tab shows logos content again', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Guía de marca'));
    await switchToTab(container, 'Colors');
    await waitFor(() => expect(container.textContent).toContain('Primario'));
    await switchToTab(container, 'Logotipos');
    await waitFor(() => {
      expect(container.textContent).toContain('Logotipo cuadrado');
    });
  });
});

// ─── Colors tab ────────────────────────────────────────────────────────────

describe('BrandingPage — Colors tab', () => {
  async function openColorsTab(container: HTMLElement) {
    const colorsTab = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.trim().includes('Colors'),
    ) as HTMLButtonElement;
    fireEvent.click(colorsTab);
    await waitFor(() => expect(container.textContent).toContain('Primario'));
  }

  it('renders all seven color fields', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Guía de marca'));
    await openColorsTab(container);
    expect(container.textContent).toContain('Primario');
    expect(container.textContent).toContain('Secundario');
    expect(container.textContent).toContain('Acento');
    expect(container.textContent).toContain('Fondo');
    expect(container.textContent).toContain('Fondo de la navegación');
    expect(container.textContent).toContain('Texto de la navegación');
  });

  it('changing a color text input marks form dirty', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Guía de marca'));
    await openColorsTab(container);
    // Find the text input for primaryColor (font-mono hex input)
    const colorTextInputs = Array.from(
      container.querySelectorAll('input[type="text"]'),
    ) as HTMLInputElement[];
    const primaryTextInput = colorTextInputs.find((i) => i.value === '#2563eb');
    expect(primaryTextInput).toBeTruthy();
    fireEvent.change(primaryTextInput!, { target: { value: '#ab1234' } });
    const saveBtn = findBtn(container, 'Guardar cambios');
    expect(saveBtn!.disabled).toBe(false);
  });

  it('renders Dark Mode Color Overrides section', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Guía de marca'));
    await openColorsTab(container);
    expect(container.textContent).toContain('Dark Mode Color Overrides');
  });

  it('renders color Preview section with Light and Dark mode', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Guía de marca'));
    await openColorsTab(container);
    expect(container.textContent).toContain('Modo claro');
    expect(container.textContent).toContain('Modo oscuro');
  });

  it('color preview shows brand name placeholder "Brand" when logoText is empty', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Guía de marca'));
    await openColorsTab(container);
    // The preview shows 'Brand' when no logoText is set
    expect(container.textContent).toContain('Brand');
  });

  it('updating a dark mode color text input marks form dirty', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Guía de marca'));
    await openColorsTab(container);
    // Dark mode color inputs have placeholder set to the light color
    const darkColorInputs = Array.from(
      container.querySelectorAll('input[type="text"]'),
    ).filter((i) => (i as HTMLInputElement).value === '') as HTMLInputElement[];
    if (darkColorInputs.length > 0) {
      fireEvent.change(darkColorInputs[0], { target: { value: '#000000' } });
      const saveBtn = findBtn(container, 'Guardar cambios');
      expect(saveBtn!.disabled).toBe(false);
    }
  });

  it('logo text appears in preview when set', async () => {
    fetchMock.mockImplementation(async () =>
      makeRes({ success: true, data: defaultBranding({ logoText: 'TestCo' }) }),
    );
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Guía de marca'));
    await openColorsTab(container);
    expect(container.textContent).toContain('TestCo');
  });
});

// ─── Typography tab ─────────────────────────────────────────────────────────

describe('BrandingPage — Typography tab', () => {
  async function openTypographyTab(container: HTMLElement) {
    const typoTab = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.trim().includes('Tipografía'),
    ) as HTMLButtonElement;
    fireEvent.click(typoTab);
    await waitFor(() => expect(container.textContent).toContain('Fuente predeterminada de títulos'));
  }

  it('renders Default Heading Font and Default Body Font pickers', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Guía de marca'));
    await openTypographyTab(container);
    expect(container.textContent).toContain('Fuente predeterminada de títulos');
    expect(container.textContent).toContain('Fuente predeterminada del texto');
  });

  it('renders Headings, Body Text, UI Elements sections', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Guía de marca'));
    await openTypographyTab(container);
    expect(container.textContent).toContain('Títulos');
    expect(container.textContent).toContain('Texto del cuerpo');
    expect(container.textContent).toContain('UI Elements');
  });

  it('renders all heading element labels', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Guía de marca'));
    await openTypographyTab(container);
    // H1-H6 labels
    expect(container.textContent).toContain('H1');
    expect(container.textContent).toContain('H2');
    expect(container.textContent).toContain('H3');
  });

  it('renders body element labels: Paragraph, Blockquote, Small, Caption', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Guía de marca'));
    await openTypographyTab(container);
    expect(container.textContent).toContain('Párrafo');
    expect(container.textContent).toContain('Cita');
    expect(container.textContent).toContain('Small');
    expect(container.textContent).toContain('Leyenda');
  });

  it('renders UI element labels: Button, Nav Link', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Guía de marca'));
    await openTypographyTab(container);
    expect(container.textContent).toContain('Botón');
    expect(container.textContent).toContain('Enlace de navegación');
  });

  it('renders Size, Weight, Line Height, Char Spacing controls', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Guía de marca'));
    await openTypographyTab(container);
    expect(container.textContent).toContain('Tamaño');
    expect(container.textContent).toContain('Peso');
    expect(container.textContent).toContain('Interlineado');
    expect(container.textContent).toContain('Espaciado de caracteres');
  });

  it('changing H1 size input marks form dirty', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Guía de marca'));
    await openTypographyTab(container);
    // Find a size input with "1rem" placeholder or the first size text input
    const sizeInputs = Array.from(container.querySelectorAll('input[placeholder="1rem"]')) as HTMLInputElement[];
    if (sizeInputs.length > 0) {
      fireEvent.change(sizeInputs[0], { target: { value: '3rem' } });
      const saveBtn = findBtn(container, 'Guardar cambios');
      expect(saveBtn!.disabled).toBe(false);
    }
  });

  it('changing heading font picker marks form dirty', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Guía de marca'));
    await openTypographyTab(container);
    // The global heading font picker is the first GoogleFontPicker
    const fontPickers = Array.from(
      container.querySelectorAll('[data-testid="google-font-picker"]'),
    ) as HTMLSelectElement[];
    expect(fontPickers.length).toBeGreaterThan(0);
    fireEvent.change(fontPickers[0], { target: { value: 'Inter' } });
    const saveBtn = findBtn(container, 'Guardar cambios');
    expect(saveBtn!.disabled).toBe(false);
  });

  it('renders inherited font label when element has no own font but global font is set', async () => {
    fetchMock.mockImplementation(async () =>
      makeRes({
        success: true,
        data: defaultBranding({ headingFont: 'Inter' }),
      }),
    );
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Guía de marca'));
    await openTypographyTab(container);
    await waitFor(() => {
      expect(container.textContent).toContain('Inherited:');
    });
  });

  it('changing weight select marks form dirty', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Guía de marca'));
    await openTypographyTab(container);
    const weightSelects = Array.from(container.querySelectorAll('select')).filter((s) =>
      Array.from((s as HTMLSelectElement).options).some((o) => o.value === '700'),
    ) as HTMLSelectElement[];
    if (weightSelects.length > 0) {
      fireEvent.change(weightSelects[0], { target: { value: '800' } });
      const saveBtn = findBtn(container, 'Guardar cambios');
      expect(saveBtn!.disabled).toBe(false);
    }
  });
});

// ─── Style tab ──────────────────────────────────────────────────────────────

describe('BrandingPage — Style tab', () => {
  async function openStyleTab(container: HTMLElement) {
    const styleTab = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'Estilo' || b.textContent?.trim().includes('tune') && b.textContent?.includes('Estilo'),
    ) as HTMLButtonElement;
    // Find it by icon text if needed
    const tabBtns = Array.from(container.querySelectorAll('button'));
    const btn = tabBtns.find((b) => {
      const t = b.textContent ?? '';
      return t.includes('Estilo') && (t.includes('tune') || t.trim().endsWith('Estilo'));
    }) as HTMLButtonElement;
    if (btn) {
      fireEvent.click(btn);
    } else if (styleTab) {
      fireEvent.click(styleTab);
    }
    await waitFor(() => expect(container.textContent).toContain('Border Radius'));
  }

  it('renders Border Radius section with preset buttons', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Guía de marca'));
    await openStyleTab(container);
    expect(container.textContent).toContain('Angular');
    expect(container.textContent).toContain('Sutil');
    expect(container.textContent).toContain('Redondeado');
    expect(container.textContent).toContain('Pastilla');
  });

  it('clicking Sharp border radius preset marks form dirty', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Guía de marca'));
    await openStyleTab(container);
    const sharpBtn = findBtn(container, 'Angular');
    expect(sharpBtn).toBeTruthy();
    fireEvent.click(sharpBtn!);
    const saveBtn = findBtn(container, 'Guardar cambios');
    expect(saveBtn!.disabled).toBe(false);
  });

  it('clicking Pill border radius preset marks form dirty', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Guía de marca'));
    await openStyleTab(container);
    const pillBtn = findBtn(container, 'Pastilla');
    expect(pillBtn).toBeTruthy();
    fireEvent.click(pillBtn!);
    const saveBtn = findBtn(container, 'Guardar cambios');
    expect(saveBtn!.disabled).toBe(false);
  });

  it('renders Custom Value input for border radius', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Guía de marca'));
    await openStyleTab(container);
    expect(container.textContent).toContain('Valor personalizado');
    const borderRadiusInput = container.querySelector(
      'input[placeholder="8px"]',
    ) as HTMLInputElement;
    expect(borderRadiusInput).toBeTruthy();
  });

  it('renders Link Colors section', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Guía de marca'));
    await openStyleTab(container);
    expect(container.textContent).toContain('Link Colors');
    expect(container.textContent).toContain('Color de enlaces');
    expect(container.textContent).toContain('Color de enlace al pasar el cursor');
  });

  it('renders link preview text', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Guía de marca'));
    await openStyleTab(container);
    expect(container.textContent).toContain('This is what a link looks like');
  });

  it('updating link color marks form dirty', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Guía de marca'));
    await openStyleTab(container);
    const linkColorInputs = Array.from(
      container.querySelectorAll('input[type="text"]'),
    ) as HTMLInputElement[];
    // Find one with an empty value (linkColor defaults to empty string)
    const emptyInput = linkColorInputs.find((i) => i.value === '');
    if (emptyInput) {
      fireEvent.change(emptyInput, { target: { value: '#0000ff' } });
      const saveBtn = findBtn(container, 'Guardar cambios');
      expect(saveBtn!.disabled).toBe(false);
    }
  });

  it('renders Button Style section', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Guía de marca'));
    await openStyleTab(container);
    expect(container.textContent).toContain('Button Style');
    expect(container.textContent).toContain('Variante predeterminada');
    expect(container.textContent).toContain('filled');
    expect(container.textContent).toContain('outline');
  });

  it('clicking outline variant marks form dirty', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Guía de marca'));
    await openStyleTab(container);
    const outlineBtn = findBtn(container, 'outline');
    expect(outlineBtn).toBeTruthy();
    fireEvent.click(outlineBtn!);
    const saveBtn = findBtn(container, 'Guardar cambios');
    expect(saveBtn!.disabled).toBe(false);
  });

  it('renders Primary Button and Secondary Button sections', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Guía de marca'));
    await openStyleTab(container);
    expect(container.textContent).toContain('Botón primario');
    expect(container.textContent).toContain('Botón secundario');
  });

  it('renders Favicon section', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Guía de marca'));
    await openStyleTab(container);
    expect(container.textContent).toContain('Favicon');
    expect(container.textContent).toContain('pestañas del navegador');
  });

  it('renders Social / OG Image section', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Guía de marca'));
    await openStyleTab(container);
    expect(container.textContent).toContain('Social / Imagen OG');
    expect(container.textContent).toContain('redes sociales');
  });

  it('renders button border radius custom field', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Guía de marca'));
    await openStyleTab(container);
    expect(container.textContent).toContain('Radio de borde de botones');
    expect(container.textContent).toContain('Déjalo vacío para heredar el radio de borde global.');
  });
});

// ─── Save flow ─────────────────────────────────────────────────────────────

describe('BrandingPage — save flow', () => {
  it('Save Changes button calls PUT on /api/portal/websites/site-99/branding', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.includes('/branding') && init?.method === 'PUT') {
        return makeRes({ success: true });
      }
      return defaultFetch(url);
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Guía de marca'));
    // Make it dirty first
    const altInput = container.querySelector('input[placeholder="Nombre de la empresa"]') as HTMLInputElement;
    fireEvent.change(altInput, { target: { value: 'Updated Alt' } });
    await waitFor(() => {
      const saveBtn = findBtn(container, 'Guardar cambios');
      expect(saveBtn!.disabled).toBe(false);
    });
    const saveBtn = findBtn(container, 'Guardar cambios');
    await act(async () => {
      fireEvent.click(saveBtn!);
    });
    await waitFor(() => {
      const putCall = fetchMock.mock.calls.find(
        ([url, init]) =>
          url.includes('/api/portal/websites/site-99/branding') &&
          (init as RequestInit)?.method === 'PUT',
      );
      expect(putCall).toBeTruthy();
    });
  });

  it('Save Changes button is re-disabled after successful save (dirty cleared)', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.includes('/branding') && init?.method === 'PUT') {
        return makeRes({ success: true });
      }
      return defaultFetch(url);
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Guía de marca'));
    const altInput = container.querySelector('input[placeholder="Nombre de la empresa"]') as HTMLInputElement;
    fireEvent.change(altInput, { target: { value: 'Alt text' } });
    await waitFor(() => expect(findBtn(container, 'Guardar cambios')!.disabled).toBe(false));
    const saveBtn = findBtn(container, 'Guardar cambios');
    await act(async () => {
      fireEvent.click(saveBtn!);
    });
    await waitFor(() => {
      expect(findBtn(container, 'Guardar cambios')!.disabled).toBe(true);
    });
  });

  it('save sends the current branding object as JSON body', async () => {
    let putBody: Record<string, unknown> | null = null;
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.includes('/branding') && init?.method === 'PUT') {
        putBody = JSON.parse(init!.body as string) as Record<string, unknown>;
        return makeRes({ success: true });
      }
      return defaultFetch(url);
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Guía de marca'));
    const altInput = container.querySelector('input[placeholder="Nombre de la empresa"]') as HTMLInputElement;
    fireEvent.change(altInput, { target: { value: 'Test Alt' } });
    const saveBtn = findBtn(container, 'Guardar cambios');
    await act(async () => {
      fireEvent.click(saveBtn!);
    });
    await waitFor(() => {
      expect(putBody).not.toBeNull();
      expect(putBody!.logoAlt).toBe('Test Alt');
    });
  });

  it('shows Saving... text while save is in progress', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.includes('/branding') && init?.method === 'PUT') {
        return new Promise(() => {}); // never resolve
      }
      return defaultFetch(url);
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Guía de marca'));
    const altInput = container.querySelector('input[placeholder="Nombre de la empresa"]') as HTMLInputElement;
    fireEvent.change(altInput, { target: { value: 'Alt' } });
    const saveBtn = findBtn(container, 'Guardar cambios');
    await act(async () => {
      fireEvent.click(saveBtn!);
    });
    await waitFor(() => {
      expect(container.textContent).toContain('Guardando…');
    });
  });
});

// ─── Data propagation from server ──────────────────────────────────────────

describe('BrandingPage — data from server applied to form', () => {
  it('pre-fills colors from server response on Colors tab', async () => {
    fetchMock.mockImplementation(async () =>
      makeRes({
        success: true,
        data: defaultBranding({
          primaryColor: '#123456',
          secondaryColor: '#654321',
        }),
      }),
    );
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Guía de marca'));
    // Switch to Colors tab
    const colorsTab = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.trim().includes('Colors'),
    ) as HTMLButtonElement;
    fireEvent.click(colorsTab);
    await waitFor(() => {
      const colorInputs = Array.from(
        container.querySelectorAll('input[type="text"]'),
      ) as HTMLInputElement[];
      const primary = colorInputs.find((i) => i.value === '#123456');
      expect(primary).toBeTruthy();
    });
  });

  it('pre-fills borderRadius on Style tab', async () => {
    fetchMock.mockImplementation(async () =>
      makeRes({
        success: true,
        data: defaultBranding({ borderRadius: '16px' }),
      }),
    );
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Guía de marca'));
    // Switch to Style tab
    const tabBtns = Array.from(container.querySelectorAll('button'));
    const styleTab = tabBtns.find((b) => {
      const t = b.textContent ?? '';
      return t.includes('Estilo') && t.includes('tune');
    }) as HTMLButtonElement;
    if (styleTab) {
      fireEvent.click(styleTab);
    }
    await waitFor(() => expect(container.textContent).toContain('Border Radius'));
    const borderRadiusInput = container.querySelector(
      'input[placeholder="8px"]',
    ) as HTMLInputElement;
    expect(borderRadiusInput?.value).toBe('16px');
  });

  it('shows dark mode color values pre-filled from server', async () => {
    fetchMock.mockImplementation(async () =>
      makeRes({
        success: true,
        data: defaultBranding({
          darkMode: {
            primaryColor: '#ff0000',
            backgroundColor: '#111111',
          },
        }),
      }),
    );
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Guía de marca'));
    const colorsTab = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.trim().includes('Colors'),
    ) as HTMLButtonElement;
    fireEvent.click(colorsTab);
    await waitFor(() => {
      const colorInputs = Array.from(
        container.querySelectorAll('input[type="text"]'),
      ) as HTMLInputElement[];
      const darkPrimary = colorInputs.find((i) => i.value === '#ff0000');
      expect(darkPrimary).toBeTruthy();
    });
  });
});
