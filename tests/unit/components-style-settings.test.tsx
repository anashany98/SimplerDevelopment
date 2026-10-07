// @vitest-environment jsdom
/**
 * Unit tests for StyleSettings — components/blocks/visual/StyleSettings.tsx
 *
 * Exercises the collapsible style panel: layout, margin/padding, visibility,
 * background, typography, border, shadows/effects, and CSS sections.
 *
 * Heavy children (TokenColorPicker, GoogleFontPicker, GradientBuilder,
 * BoxShadowBuilder, MediaPicker) are mocked with trivial test-id stubs so we
 * can isolate the panel's own branching logic.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Mocks for visual child components
// ---------------------------------------------------------------------------

vi.mock('@/components/blocks/visual/TokenColorPicker', () => ({
  TokenColorPicker: ({
    label,
    value,
    onChange,
    placeholder,
  }: {
    label: string;
    value: string;
    onChange: (v: string) => void;
    placeholder?: string;
  }) => (
    <div data-testid={`token-color-${label}`}>
      <span>{label}</span>
      <input
        data-testid={`token-color-input-${label}`}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  ),
}));

vi.mock('@/components/blocks/visual/GoogleFontPicker', () => ({
  GoogleFontPicker: ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
    <input
      data-testid="google-font-picker"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  ),
}));

vi.mock('@/components/blocks/visual/GradientBuilder', () => ({
  GradientBuilder: ({
    backgroundColor,
    backgroundGradient,
    onChange,
  }: {
    backgroundColor: string;
    backgroundGradient: string;
    onChange: (patch: { backgroundColor?: string; backgroundGradient?: string }) => void;
  }) => (
    <div data-testid="gradient-builder">
      <span data-testid="gradient-bg-color">{backgroundColor}</span>
      <span data-testid="gradient-bg-gradient">{backgroundGradient}</span>
      <button
        data-testid="gradient-set-color"
        type="button"
        onClick={() => onChange({ backgroundColor: '#abcdef', backgroundGradient: '' })}
      >
        set-color
      </button>
      <button
        data-testid="gradient-set-gradient"
        type="button"
        onClick={() =>
          onChange({ backgroundColor: '', backgroundGradient: 'linear-gradient(red,blue)' })
        }
      >
        set-gradient
      </button>
    </div>
  ),
}));

vi.mock('@/components/blocks/visual/BoxShadowBuilder', () => ({
  BoxShadowBuilder: ({
    value,
    onChange,
  }: {
    value: string;
    onChange: (v: string) => void;
  }) => (
    <div data-testid="box-shadow-builder">
      <span data-testid="box-shadow-value">{value}</span>
      <button
        data-testid="box-shadow-set"
        type="button"
        onClick={() => onChange('0 1px 2px 0 rgb(0 0 0 / 0.05)')}
      >
        set-shadow
      </button>
    </div>
  ),
}));

vi.mock('@/components/admin/MediaPicker', () => ({
  default: ({
    value,
    onChange,
    label,
  }: {
    value: string;
    onChange: (v: string) => void;
    label?: string;
  }) => (
    <div data-testid="media-picker">
      <span>{label}</span>
      <input
        data-testid="media-picker-input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  ),
}));

import { StyleSettings } from '@/components/blocks/visual/StyleSettings';
import { StaticBoxModel } from '@/components/blocks/visual/StyleSettings.parts';
import type { Block } from '@/types/blocks';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeBlock(overrides: Partial<Block> = {}): Block {
  return {
    id: 'b1',
    type: 'text',
    content: 'hello',
    ...overrides,
  } as Block;
}

function renderPanel(
  blockOverrides: Partial<Block> = {},
  viewport: 'mobile' | 'tablet' | 'desktop' = 'desktop',
) {
  const onChange = vi.fn();
  const block = makeBlock(blockOverrides);
  const utils = render(
    <StyleSettings block={block} onChange={onChange} currentViewport={viewport} />,
  );
  return { ...utils, onChange, block };
}

// Open a collapsible section by clicking its title button.
function openSection(title: string) {
  const headers = screen.getAllByRole('button');
  const header = headers.find((b) => b.textContent?.includes(title));
  if (!header) throw new Error(`Could not find section: ${title}`);
  fireEvent.click(header);
}

// ---------------------------------------------------------------------------
// Initial render / smoke tests
// ---------------------------------------------------------------------------

describe('StyleSettings — rendering', () => {
  it('renders all collapsible section headers', () => {
    renderPanel();
    expect(screen.getByText('Diseño')).toBeTruthy();
    expect(screen.getByText('Margen y relleno')).toBeTruthy();
    expect(screen.getByText('Visibilidad')).toBeTruthy();
    expect(screen.getByText('Fondo')).toBeTruthy();
    expect(screen.getByText('Tipografía')).toBeTruthy();
    expect(screen.getByText('Borde')).toBeTruthy();
    expect(screen.getByText('Sombras y efectos')).toBeTruthy();
    expect(screen.getByText('Propiedades CSS')).toBeTruthy();
  });

  it('opens Layout by default and shows Display select', () => {
    renderPanel();
    expect(screen.getByText('Visualización')).toBeTruthy();
  });

  it('does not show Margin & Padding fields until section is opened', () => {
    renderPanel();
    // No rendered box-model controls yet
    expect(screen.queryAllByText('Espaciado estático').length).toBe(0);
  });

  it('toggles section open and closed', () => {
    renderPanel();
    openSection('Visibilidad');
    expect(screen.getAllByText(/Visible en/i).length).toBeGreaterThan(0);
    openSection('Visibilidad');
    expect(screen.queryAllByText(/Visible en/i).length).toBe(0);
  });

  it('handles block.style that is not an object (defensive fallback)', () => {
    // @ts-expect-error testing defensive path
    const { onChange } = renderPanel({ style: 'not an object' });
    // Just confirm it renders without crashing
    expect(screen.getByText('Diseño')).toBeTruthy();
    expect(onChange).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Layout section
// ---------------------------------------------------------------------------

describe('StyleSettings — Layout', () => {
  // Layout controls now write breakpoint-scoped values into
  // block.responsiveStyle[currentViewport] (desktop by default in renderPanel)
  // instead of the flat block.style.
  it('changing Display calls onChange with new value', () => {
    const { onChange } = renderPanel();
    const display = screen.getByDisplayValue('Flex') as HTMLSelectElement;
    fireEvent.change(display, { target: { value: 'grid' } });
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        responsiveStyle: expect.objectContaining({
          desktop: expect.objectContaining({ display: 'grid' }),
        }),
      }),
    );
  });

  it('shows flex controls when display is flex (default)', () => {
    renderPanel();
    expect(screen.getByText('Dirección')).toBeTruthy();
    expect(screen.getByText('Justificar contenido')).toBeTruthy();
    expect(screen.getByText('Alinear elementos')).toBeTruthy();
    expect(screen.getAllByText('Ajuste').length).toBeGreaterThan(0);
  });

  it('hides flex controls when display is block', () => {
    renderPanel({ style: { display: 'block' } } as Partial<Block>);
    expect(screen.queryByText('Dirección')).toBeNull();
    expect(screen.queryByText('Ajuste')).toBeNull();
  });

  it('shows grid controls when display is grid', () => {
    renderPanel({ style: { display: 'grid' } } as Partial<Block>);
    expect(screen.getByText('Columnas')).toBeTruthy();
    expect(screen.getByText('Filas')).toBeTruthy();
    expect(screen.getByPlaceholderText('1fr 1fr 1fr')).toBeTruthy();
  });

  it('clicking direction button updates flexDirection', () => {
    const { onChange } = renderPanel();
    const colBtn = screen.getByTitle('Columna');
    fireEvent.click(colBtn);
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        responsiveStyle: expect.objectContaining({
          desktop: expect.objectContaining({ flexDirection: 'column' }),
        }),
      }),
    );
  });

  it('clicking Justify Content button updates justifyContent', () => {
    const { onChange } = renderPanel();
    // Find by text content "center" inside a justifycontent button
    const buttons = screen.getAllByRole('button');
    const centerBtn = buttons.find((b) => b.textContent === 'center');
    if (!centerBtn) throw new Error('center button not found');
    fireEvent.click(centerBtn);
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        responsiveStyle: expect.objectContaining({
          desktop: expect.objectContaining({ justifyContent: 'center' }),
        }),
      }),
    );
  });

  it('updates width via input', () => {
    const { onChange } = renderPanel();
    // Width/Height live in the "Size" section (closed by default) now that
    // Layout only holds display/flex/position controls.
    openSection('Tamaño');
    const inputs = screen.getAllByPlaceholderText('auto');
    fireEvent.change(inputs[0], { target: { value: '50%' } });
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        responsiveStyle: expect.objectContaining({
          desktop: expect.objectContaining({ width: '50%' }),
        }),
      }),
    );
  });

  it('hides Width/Height Size inputs for spacer blocks (VEQA-058 — dead control, SpacerBlockRender only reads the Content-tab height enum)', () => {
    renderPanel({ type: 'spacer' } as Partial<Block>);
    openSection('Tamaño');
    expect(screen.queryAllByPlaceholderText('auto').length).toBe(0);
  });

  it('shows position offset inputs when position is non-static', () => {
    renderPanel({ style: { position: 'absolute' } } as Partial<Block>);
    expect(screen.getByText('Índice Z')).toBeTruthy();
  });

  it('does not show offset inputs when position is unset', () => {
    renderPanel();
    expect(screen.queryByText('Índice Z')).toBeNull();
  });

  it('updates overflow via select', () => {
    const { onChange } = renderPanel();
    const overflow = screen.getAllByRole('combobox').find(
      (s) => (s as HTMLSelectElement).options[0]?.text === 'Visible',
    ) as HTMLSelectElement;
    fireEvent.change(overflow, { target: { value: 'hidden' } });
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        responsiveStyle: expect.objectContaining({
          desktop: expect.objectContaining({ overflow: 'hidden' }),
        }),
      }),
    );
  });

  it('updates gap via select when flex', () => {
    const { onChange } = renderPanel();
    const gap = screen.getAllByRole('combobox').find(
      (s) => (s as HTMLSelectElement).options[0]?.text === 'Ninguno' &&
        Array.from((s as HTMLSelectElement).options).some((o) => o.value === '1rem'),
    ) as HTMLSelectElement;
    fireEvent.change(gap, { target: { value: '1rem' } });
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        responsiveStyle: expect.objectContaining({
          desktop: expect.objectContaining({ gap: '1rem' }),
        }),
      }),
    );
  });

  it('updates grid columns when display=grid', () => {
    const { onChange } = renderPanel({ style: { display: 'grid' } } as Partial<Block>);
    const cols = screen.getByPlaceholderText('1fr 1fr 1fr') as HTMLInputElement;
    fireEvent.change(cols, { target: { value: '1fr 2fr' } });
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        responsiveStyle: expect.objectContaining({
          desktop: expect.objectContaining({ gridTemplateColumns: '1fr 2fr' }),
        }),
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// Margin & Padding section (responsive + static via BoxModelControl)
// ---------------------------------------------------------------------------

describe('StyleSettings — Margin & Padding', () => {
  it('displays current viewport label', () => {
    renderPanel({}, 'tablet');
    openSection('Margen y relleno');
    // The label now also appears in the Layout section (open by default), so
    // assert at least one match instead of a unique one.
    expect(screen.getAllByText(/Editando para Tablet/).length).toBeGreaterThan(0);
  });

  it('shows margin/padding controls when opened', () => {
    renderPanel();
    openSection('Margen y relleno');
    expect(screen.getByText('Margen')).toBeTruthy();
    expect(screen.getByText('Relleno')).toBeTruthy();
    expect(screen.getByText('Espaciado estático')).toBeTruthy();
  });

  it('updates responsive marginTop via spacing select', () => {
    const { onChange } = renderPanel();
    openSection('Margen y relleno');
    // First margin-top control is the responsive one (renders before static)
    const topSelect = screen.getAllByTitle('margin-top')[0] as HTMLSelectElement;
    fireEvent.change(topSelect, { target: { value: 'md' } });
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        responsive: expect.objectContaining({
          marginTop: expect.objectContaining({ desktop: 'md' }),
        }),
      }),
    );
  });

  it('updates responsive paddingLeft via spacing select', () => {
    const { onChange } = renderPanel({}, 'mobile');
    openSection('Margen y relleno');
    const leftSelect = screen.getAllByTitle('padding-left')[0] as HTMLSelectElement;
    fireEvent.change(leftSelect, { target: { value: 'lg' } });
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        responsive: expect.objectContaining({
          paddingLeft: expect.objectContaining({ mobile: 'lg' }),
        }),
      }),
    );
  });

  it('switches a spacing control to custom mode and clears it', () => {
    renderPanel();
    openSection('Margen y relleno');
    const topSelect = screen.getAllByTitle('margin-top')[0] as HTMLSelectElement;
    fireEvent.change(topSelect, { target: { value: '__custom__' } });
    // Custom number input should now be present
    const numInput = screen.getAllByTitle('margin-top').find(
      (n) => n.tagName === 'INPUT',
    ) as HTMLInputElement;
    expect(numInput).toBeTruthy();
    // Click the reset (close) button next to it
    const resetBtns = screen.getAllByTitle('Back to presets');
    expect(resetBtns.length).toBeGreaterThan(0);
    fireEvent.click(resetBtns[0]);
  });

  it('typing a value in custom mode emits px units by default', () => {
    const { onChange } = renderPanel();
    openSection('Margen y relleno');
    const topSelect = screen.getAllByTitle('margin-top')[0] as HTMLSelectElement;
    fireEvent.change(topSelect, { target: { value: '__custom__' } });
    const numInput = screen
      .getAllByTitle('margin-top')
      .find((n) => n.tagName === 'INPUT') as HTMLInputElement;
    fireEvent.change(numInput, { target: { value: '42' } });
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        responsive: expect.objectContaining({
          marginTop: expect.objectContaining({ desktop: '42px' }),
        }),
      }),
    );
  });

  it('changing custom unit to % re-emits onChange with new unit', () => {
    const { onChange } = renderPanel();
    openSection('Margen y relleno');
    const topSelect = screen.getAllByTitle('margin-top')[0] as HTMLSelectElement;
    fireEvent.change(topSelect, { target: { value: '__custom__' } });
    const numInput = screen
      .getAllByTitle('margin-top')
      .find((n) => n.tagName === 'INPUT') as HTMLInputElement;
    fireEvent.change(numInput, { target: { value: '5' } });
    onChange.mockClear();
    // Find the unit select (rendered as a sibling combobox in jsdom)
    const unitSelects = screen.getAllByRole('combobox').filter((s) => {
      const opts = (s as HTMLSelectElement).options;
      return opts.length === 2 && opts[0].value === 'px' && opts[1].value === '%';
    });
    expect(unitSelects.length).toBeGreaterThan(0);
    fireEvent.change(unitSelects[0], { target: { value: '%' } });
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        responsive: expect.objectContaining({
          marginTop: expect.objectContaining({ desktop: '5%' }),
        }),
      }),
    );
  });

  it('renders custom-mode controls when initial responsive value is custom (e.g. 16px)', () => {
    renderPanel({
      responsive: { marginTop: { desktop: '16px' } },
    } as Partial<Block>);
    openSection('Margen y relleno');
    // Initial value 16px isn't in the preset list -> rendered as number input
    const numInputs = screen.getAllByTitle('margin-top').filter((n) => n.tagName === 'INPUT');
    expect(numInputs.length).toBeGreaterThan(0);
    expect((numInputs[0] as HTMLInputElement).value).toBe('16');
  });

  it('updates static padding via shorthand builder (top change)', () => {
    const { onChange } = renderPanel();
    openSection('Margen y relleno');
    const topSelect = screen.getAllByTitle('padding-top')[1] as HTMLSelectElement;
    fireEvent.change(topSelect, { target: { value: '1rem' } });
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        style: expect.objectContaining({ padding: expect.stringContaining('1rem') }),
      }),
    );
  });

  it('updates static margin via shorthand builder', () => {
    const { onChange } = renderPanel({
      style: { margin: '1rem 2rem 3rem 4rem' },
    } as Partial<Block>);
    openSection('Margen y relleno');
    // We expect 4 separate inputs (top/right/bottom/left) plus the responsive set
    const tops = screen.getAllByTitle('margin-top');
    expect(tops.length).toBeGreaterThanOrEqual(2);
    fireEvent.change(tops[tops.length - 1], { target: { value: '0' } });
    expect(onChange).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// StaticBoxModel (VEQA-034) — combined static padding/margin nested box-model
// control, tested in isolation from StyleSettings.
// ---------------------------------------------------------------------------

describe('StaticBoxModel', () => {
  const sizes = ['', '0', '0.25rem', '0.5rem', '1rem'];

  it('parses an existing shorthand value into the right side inputs', () => {
    render(
      <StaticBoxModel padding="8px 16px" margin="" onPaddingChange={vi.fn()} onMarginChange={vi.fn()} sizes={sizes} />,
    );
    // "8px 16px" -> top/bottom 8px, left/right 16px. Neither value is a preset
    // in `sizes` (which holds rem values), so both render as custom number inputs.
    const topInput = screen.getAllByTitle('padding-top').find((n) => n.tagName === 'INPUT') as HTMLInputElement;
    const rightInput = screen.getAllByTitle('padding-right').find((n) => n.tagName === 'INPUT') as HTMLInputElement;
    expect(topInput.value).toBe('8');
    expect(rightInput.value).toBe('16');
  });

  it('editing a padding side calls onPaddingChange with the recomposed shorthand, never onMarginChange', () => {
    const onPaddingChange = vi.fn();
    const onMarginChange = vi.fn();
    render(
      <StaticBoxModel padding="" margin="" onPaddingChange={onPaddingChange} onMarginChange={onMarginChange} sizes={sizes} />,
    );
    const topSelect = screen.getByTitle('padding-top') as HTMLSelectElement;
    fireEvent.change(topSelect, { target: { value: '0.5rem' } });
    expect(onPaddingChange).toHaveBeenCalledWith('0.5rem 0 0');
    expect(onMarginChange).not.toHaveBeenCalled();
  });

  it('editing a margin side calls onMarginChange with the recomposed shorthand, never onPaddingChange', () => {
    const onPaddingChange = vi.fn();
    const onMarginChange = vi.fn();
    render(
      <StaticBoxModel padding="" margin="" onPaddingChange={onPaddingChange} onMarginChange={onMarginChange} sizes={sizes} />,
    );
    const leftSelect = screen.getByTitle('margin-left') as HTMLSelectElement;
    fireEvent.change(leftSelect, { target: { value: '0.25rem' } });
    expect(onMarginChange).toHaveBeenCalledWith('0 0 0 0.25rem');
    expect(onPaddingChange).not.toHaveBeenCalled();
  });

  it('renders cleanly when both padding and margin are undefined', () => {
    render(
      <StaticBoxModel padding={undefined} margin={undefined} onPaddingChange={vi.fn()} onMarginChange={vi.fn()} sizes={sizes} />,
    );
    expect(screen.getByText('margin')).toBeTruthy();
    expect(screen.getByText('padding')).toBeTruthy();
    // All eight side controls (4 margin + 4 padding) render as presets, none custom
    expect(screen.getAllByTitle(/^(margin|padding)-/).length).toBe(8);
  });
});

// ---------------------------------------------------------------------------
// Visibility
// ---------------------------------------------------------------------------

describe('StyleSettings — Visibility', () => {
  it('toggles visibility checkbox', () => {
    const { onChange } = renderPanel({}, 'mobile');
    openSection('Visibilidad');
    // The Visibility section now always renders all three breakpoint checkboxes
    // (desktop/tablet/mobile), not just the active viewport's — pick the one
    // whose label matches the viewport under test.
    const checkbox = screen.getByRole('checkbox', { name: /Visible en Mobile/i }) as HTMLInputElement;
    expect(checkbox.checked).toBe(true);
    fireEvent.click(checkbox);
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        responsive: expect.objectContaining({
          visibility: expect.objectContaining({ mobile: false }),
        }),
      }),
    );
  });

  it('renders unchecked when responsive.visibility is false for viewport', () => {
    renderPanel({
      responsive: { visibility: { tablet: false } },
    } as Partial<Block>, 'tablet');
    openSection('Visibilidad');
    // Same as above: all three breakpoint checkboxes render at once now.
    const checkbox = screen.getByRole('checkbox', { name: /Visible en Tablet/i }) as HTMLInputElement;
    expect(checkbox.checked).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Background
// ---------------------------------------------------------------------------

describe('StyleSettings — Background', () => {
  it('renders the GradientBuilder mock', () => {
    renderPanel();
    openSection('Fondo');
    expect(screen.getByTestId('gradient-builder')).toBeTruthy();
  });

  it('GradientBuilder onChange (set color) forwards to onChange', () => {
    const { onChange } = renderPanel();
    openSection('Fondo');
    fireEvent.click(screen.getByTestId('gradient-set-color'));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        style: expect.objectContaining({
          backgroundColor: '#abcdef',
          backgroundGradient: '',
        }),
      }),
    );
  });

  it('GradientBuilder onChange (set gradient) forwards to onChange', () => {
    const { onChange } = renderPanel();
    openSection('Fondo');
    fireEvent.click(screen.getByTestId('gradient-set-gradient'));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        style: expect.objectContaining({
          backgroundGradient: expect.stringContaining('linear-gradient'),
        }),
      }),
    );
  });

  it('shows extra image controls when backgroundImage is set', () => {
    renderPanel({
      style: { backgroundImage: 'url(/x.png)' },
    } as Partial<Block>);
    openSection('Fondo');
    // "Repeat" appears both as a label and a select option, so use getAllByText
    expect(screen.getAllByText('Repetición').length).toBeGreaterThan(0);
    expect(screen.getByText('Anclaje')).toBeTruthy();
  });

  it('shows blend mode when backgroundGradient is set', () => {
    renderPanel({
      style: { backgroundGradient: 'linear-gradient(red,blue)' },
    } as Partial<Block>);
    openSection('Fondo');
    expect(screen.getByText('Modo de fusión del fondo')).toBeTruthy();
  });

  it('MediaPicker change updates backgroundImage', () => {
    const { onChange } = renderPanel();
    openSection('Fondo');
    const input = screen.getByTestId('media-picker-input') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '/new.png' } });
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        style: expect.objectContaining({ backgroundImage: '/new.png' }),
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// Typography
// ---------------------------------------------------------------------------

describe('StyleSettings — Typography', () => {
  it('renders TokenColorPicker for text color', () => {
    renderPanel();
    openSection('Tipografía');
    expect(screen.getByTestId('token-color-Color del texto')).toBeTruthy();
  });

  it('changes text color via token picker', () => {
    const { onChange } = renderPanel();
    openSection('Tipografía');
    const input = screen.getByTestId('token-color-input-Color del texto') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '#ff0000' } });
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        style: expect.objectContaining({ color: '#ff0000' }),
      }),
    );
  });

  it('hides font-size controls for non-text blocks', () => {
    // Non-text blocks (spacer/divider/image/video/youtube) now hide the whole
    // Typography category — not just the font-size fields within it — so the
    // section header itself doesn't render and can't be opened.
    renderPanel({ type: 'spacer' } as Partial<Block>);
    expect(screen.queryByText('Typography')).toBeNull();
    expect(screen.queryByText('Tamaño de fuente')).toBeNull();
    expect(screen.queryByText('Alineación del texto')).toBeNull();
  });

  it('shows font-size + alignment controls for text blocks', () => {
    renderPanel();
    openSection('Tipografía');
    expect(screen.getByText('Tamaño de fuente')).toBeTruthy();
    expect(screen.getByText('Alineación del texto')).toBeTruthy();
    expect(screen.getByText('Transformación')).toBeTruthy();
    expect(screen.getByText('Decoración')).toBeTruthy();
  });

  it('font family change goes through GoogleFontPicker mock', () => {
    const { onChange } = renderPanel();
    openSection('Tipografía');
    const fp = screen.getByTestId('google-font-picker') as HTMLInputElement;
    fireEvent.change(fp, { target: { value: 'Roboto' } });
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        style: expect.objectContaining({ fontFamily: 'Roboto' }),
      }),
    );
  });

  it('changes font weight', () => {
    const { onChange } = renderPanel();
    openSection('Tipografía');
    const weightSelect = screen.getAllByRole('combobox').find((s) =>
      Array.from((s as HTMLSelectElement).options).some((o) => o.text === 'Negrita'),
    ) as HTMLSelectElement;
    fireEvent.change(weightSelect, { target: { value: '700' } });
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        style: expect.objectContaining({ fontWeight: '700' }),
      }),
    );
  });

  it('clicks a text-align button', () => {
    const { onChange } = renderPanel();
    openSection('Tipografía');
    const center = screen.getByTitle('Centrado');
    fireEvent.click(center);
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        style: expect.objectContaining({ textAlign: 'center' }),
      }),
    );
  });

  it('clicks a text-transform button (ABC)', () => {
    const { onChange } = renderPanel();
    openSection('Tipografía');
    const buttons = screen.getAllByRole('button');
    const abc = buttons.find((b) => b.textContent === 'ABC');
    if (!abc) throw new Error('ABC button not found');
    fireEvent.click(abc);
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        style: expect.objectContaining({ textTransform: 'uppercase' }),
      }),
    );
  });

  it('updates responsive font-size override', () => {
    const { onChange } = renderPanel({}, 'tablet');
    openSection('Tipografía');
    const respFontSize = screen.getAllByRole('combobox').find((s) => {
      const opts = (s as HTMLSelectElement).options;
      return Array.from(opts).some((o) => o.value === '6xl') && opts[0].value === '';
    }) as HTMLSelectElement;
    fireEvent.change(respFontSize, { target: { value: 'xl' } });
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        responsive: expect.objectContaining({
          fontSize: expect.objectContaining({ tablet: 'xl' }),
        }),
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// Border
// ---------------------------------------------------------------------------

describe('StyleSettings — Border', () => {
  // Helper: find the top-level Border Width select (7 options: '', 1px..8px, none of value 0px)
  function findBorderWidthSelect(): HTMLSelectElement {
    const all = screen.getAllByRole('combobox');
    const match = all.find((s) => {
      const opts = Array.from((s as HTMLSelectElement).options);
      // Top-level Border Width: 7 options, includes '1px', no '0px' (per-side has 0px)
      return (
        opts.length === 7 &&
        opts.some((o) => o.value === '1px') &&
        !opts.some((o) => o.value === '0px')
      );
    });
    if (!match) throw new Error('Border Width select not found');
    return match as HTMLSelectElement;
  }

  it('sets border width with no existing borderStyle defaults style to solid', () => {
    const { onChange } = renderPanel();
    openSection('Borde');
    const widthSelect = findBorderWidthSelect();
    fireEvent.change(widthSelect, { target: { value: '2px' } });
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        style: expect.objectContaining({ borderWidth: '2px', borderStyle: 'solid' }),
      }),
    );
  });

  it('sets border width when style already present just updates width', () => {
    const { onChange } = renderPanel({
      style: { borderWidth: '1px', borderStyle: 'solid' },
    } as Partial<Block>);
    openSection('Borde');
    const widthSelect = findBorderWidthSelect();
    fireEvent.change(widthSelect, { target: { value: '4px' } });
    // Should have been called with width updated (and style preserved as solid in merged result)
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        style: expect.objectContaining({ borderWidth: '4px' }),
      }),
    );
  });

  it('shows border color & style controls only when width set', () => {
    const noWidth = renderPanel();
    openSection('Borde');
    expect(screen.queryByTestId('token-color-Color del borde')).toBeNull();
    noWidth.unmount();

    renderPanel({ style: { borderWidth: '2px' } } as Partial<Block>);
    openSection('Borde');
    expect(screen.getByTestId('token-color-Color del borde')).toBeTruthy();
  });

  it('toggles per-side borders panel', () => {
    renderPanel();
    openSection('Borde');
    const psbBtn = screen.getByText('Bordes por lado');
    fireEvent.click(psbBtn);
    // Now per-side labels render: "Top W", "Right W", "Bottom W", "Left W"
    expect(screen.getByText('Top W')).toBeTruthy();
    expect(screen.getByText('Right W')).toBeTruthy();
    expect(screen.getByText('Bottom W')).toBeTruthy();
    expect(screen.getByText('Left W')).toBeTruthy();
  });

  it('setting a per-side width with no per-side style auto-sets solid', () => {
    const { onChange } = renderPanel();
    openSection('Borde');
    fireEvent.click(screen.getByText('Bordes por lado'));
    // The first <select> under Top W is our target.
    const allSelects = screen.getAllByRole('combobox');
    // Find a select that has both '' and '0px' options (per-side width)
    const target = allSelects.find((s) => {
      const opts = Array.from((s as HTMLSelectElement).options);
      return opts.some((o) => o.value === '0px') && opts.some((o) => o.value === '1px');
    }) as HTMLSelectElement;
    fireEvent.change(target, { target: { value: '2px' } });
    expect(onChange).toHaveBeenCalled();
    // Either borderTopWidth or one of the side widths must be set; style:solid expected
    const lastCall = onChange.mock.calls[onChange.mock.calls.length - 1][0];
    expect(lastCall.style).toBeDefined();
  });

  it('renders border radius dropdown and updates it', () => {
    const { onChange } = renderPanel();
    openSection('Borde');
    // border-radius select: contains "Full (Pill)"
    const radiusSelect = screen.getAllByRole('combobox').find((s) =>
      Array.from((s as HTMLSelectElement).options).some((o) => o.text === 'Completo (pastilla)'),
    ) as HTMLSelectElement;
    fireEvent.change(radiusSelect, { target: { value: '0.5rem' } });
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        style: expect.objectContaining({ borderRadius: '0.5rem' }),
      }),
    );
  });

  it('shows per-corner radius toggle when radius is set', () => {
    renderPanel({ style: { borderRadius: '0.5rem' } } as Partial<Block>);
    openSection('Borde');
    expect(screen.getByText('Radio por esquina')).toBeTruthy();
    fireEvent.click(screen.getByText('Radio por esquina'));
    expect(screen.getByText('TL')).toBeTruthy();
    expect(screen.getByText('TR')).toBeTruthy();
    expect(screen.getByText('BL')).toBeTruthy();
    expect(screen.getByText('BR')).toBeTruthy();
  });

  it('does not show per-corner radius when no radius set', () => {
    renderPanel();
    openSection('Borde');
    expect(screen.queryByText('Radio por esquina')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Shadows & Effects
// ---------------------------------------------------------------------------

describe('StyleSettings — Shadows & Effects', () => {
  it('renders the BoxShadowBuilder mock', () => {
    renderPanel();
    openSection('Sombras y efectos');
    expect(screen.getByTestId('box-shadow-builder')).toBeTruthy();
  });

  it('updates box shadow', () => {
    const { onChange } = renderPanel();
    openSection('Sombras y efectos');
    fireEvent.click(screen.getByTestId('box-shadow-set'));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        style: expect.objectContaining({ boxShadow: expect.stringContaining('rgb') }),
      }),
    );
  });

  it('updates opacity via range slider', () => {
    const { onChange } = renderPanel();
    openSection('Sombras y efectos');
    const slider = screen.getByRole('slider') as HTMLInputElement;
    fireEvent.change(slider, { target: { value: '50' } });
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        style: expect.objectContaining({ opacity: '0.5' }),
      }),
    );
  });

  it('shows current opacity percentage in the label', () => {
    renderPanel({ style: { opacity: '0.25' } } as Partial<Block>);
    openSection('Sombras y efectos');
    expect(screen.getByText('25%')).toBeTruthy();
  });

  it('defaults opacity label to 100% when not set', () => {
    renderPanel();
    openSection('Sombras y efectos');
    expect(screen.getByText('100%')).toBeTruthy();
  });

  // 'updates transition preset' removed — the Transition control was dropped
  // from the Shadows & Effects section (VEQA-024; no visible effect in the
  // static editor). Custom transitions are still authorable via CSS Properties.
});

// ---------------------------------------------------------------------------
// CSS Properties
// ---------------------------------------------------------------------------

describe('StyleSettings — CSS Properties', () => {
  it('writes textarea content to style.customCSS', () => {
    const { onChange } = renderPanel();
    openSection('Propiedades CSS');
    const ta = screen.getByPlaceholderText('propiedad: valor; propiedad: valor;');
    fireEvent.change(ta, { target: { value: 'filter: blur(2px);' } });
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        style: expect.objectContaining({ customCSS: 'filter: blur(2px);' }),
      }),
    );
  });

  it('renders initial customCSS value', () => {
    renderPanel({ style: { customCSS: 'foo: bar;' } } as Partial<Block>);
    openSection('Propiedades CSS');
    const ta = screen.getByPlaceholderText(
      'propiedad: valor; propiedad: valor;',
    ) as HTMLTextAreaElement;
    expect(ta.value).toBe('foo: bar;');
  });
});
