/* eslint-disable @typescript-eslint/no-explicit-any */
// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent, screen, act } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Heavy-dep mocks
// ---------------------------------------------------------------------------

vi.mock('@/components/blocks/visual/TokenColorPicker', () => ({
  TokenColorPicker: ({ value, onChange, label, placeholder }: any) => (
    <label data-testid={`color-wrap-${label || placeholder || 'unnamed'}`}>
      <span>{label}</span>
      <input
        data-testid={`color-${label || placeholder || 'unnamed'}`}
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  ),
}));

vi.mock('@/components/blocks/visual/RichTextEditable', () => ({
  RichTextEditable: ({ html, onChange, placeholder, singleLine }: any) => (
    <textarea
      data-testid={`rte-${placeholder || 'rte'}`}
      data-single-line={singleLine ? 'true' : 'false'}
      value={html || ''}
      onChange={(e) => onChange(e.target.value)}
    />
  ),
}));

// Stub child panels that have their own test files / fetch deps
vi.mock('@/components/blocks/visual/block-settings/panels/SurveyResultsSettings', () => ({
  SurveyResultsBlockSettings: ({ block }: any) => (
    <div data-testid="survey-results-settings" data-block-id={block?.id} />
  ),
}));

vi.mock('@/components/blocks/visual/block-settings/panels/BookingSettings', () => ({
  BookingBlockSettings: ({ block }: any) => (
    <div data-testid="booking-settings" data-block-id={block?.id} />
  ),
}));

// Mock fetch globally — used by SurveyBlockSettings
const mockFetchJson = vi.fn();
global.fetch = vi.fn().mockImplementation(() =>
  Promise.resolve({
    json: mockFetchJson,
  })
) as unknown as typeof fetch;

// Lazy import after mocks
import { FormPanel } from '@/components/blocks/visual/block-settings/panels/FormPanel';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeOnChange<T = any>() {
  return vi.fn<(updates: Partial<T>) => void>();
}

function renderPanel(block: any, onChange = makeOnChange(), viewport: any = 'desktop') {
  const utils = render(
    <FormPanel block={block} onChange={onChange} currentViewport={viewport} />
  );
  return { ...utils, onChange };
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  mockFetchJson.mockResolvedValue({ success: true, data: [] });
});

// ---------------------------------------------------------------------------
// Tests — dispatcher
// ---------------------------------------------------------------------------

describe('FormPanel — dispatcher', () => {
  it('renders null for unknown block type', () => {
    const { container } = renderPanel({ id: 'b0', type: 'unknown-form-type' });
    expect(container.firstChild).toBeNull();
  });

  it('dispatches booking blocks to BookingBlockSettings stub', () => {
    renderPanel({ id: 'bk1', type: 'booking', slug: 'consult' });
    expect(screen.getByTestId('booking-settings')).toBeTruthy();
    expect(screen.getByTestId('booking-settings').getAttribute('data-block-id')).toBe('bk1');
  });

  it('dispatches survey-results blocks to SurveyResultsBlockSettings stub', () => {
    renderPanel({ id: 'sr1', type: 'survey-results', surveySlug: 'nps' });
    expect(screen.getByTestId('survey-results-settings')).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Tests — ButtonBlockSettings
// ---------------------------------------------------------------------------

describe('FormPanel — ButtonBlockSettings', () => {
  const baseBtn = {
    id: 'btn1',
    type: 'button',
    text: 'Click me',
    url: 'https://example.com',
    variant: 'primary',
    size: 'md',
    alignment: 'left',
    openInNewTab: false,
    icon: '',
    iconPosition: 'left',
    hoverEffect: 'none',
  };

  it('renders Button Text input with current value', () => {
    renderPanel(baseBtn);
    const input = screen.getByPlaceholderText('Haz clic aquí') as HTMLInputElement;
    expect(input.value).toBe('Click me');
  });

  it('updates text via Button Text input', () => {
    const { onChange } = renderPanel(baseBtn);
    const input = screen.getByPlaceholderText('Haz clic aquí') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'Go Now' } });
    expect(onChange).toHaveBeenCalledWith({ text: 'Go Now' });
  });

  it('updates URL via Link URL input', () => {
    const { onChange } = renderPanel(baseBtn);
    const input = screen.getByPlaceholderText('https://...') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'https://go.com' } });
    expect(onChange).toHaveBeenCalledWith({ url: 'https://go.com' });
  });

  it('updates variant via select', () => {
    const { onChange } = renderPanel(baseBtn);
    const select = screen.getByDisplayValue('Primario') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 'outline' } });
    expect(onChange).toHaveBeenCalledWith({ variant: 'outline' });
  });

  it('updates size via select', () => {
    const { onChange } = renderPanel(baseBtn);
    const select = screen.getByDisplayValue('Media') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 'lg' } });
    expect(onChange).toHaveBeenCalledWith({ size: 'lg' });
  });

  it('updates alignment when center button clicked', () => {
    const { onChange } = renderPanel(baseBtn);
    // Alignment buttons: left, center, right
    const alignBtns = screen.getAllByRole('button');
    // center is index 1 (0=left,1=center,2=right)
    fireEvent.click(alignBtns[1]);
    expect(onChange).toHaveBeenCalledWith({ alignment: 'center' });
  });

  it('toggles openInNewTab checkbox', () => {
    const { onChange } = renderPanel(baseBtn);
    const checkbox = screen.getByRole('checkbox') as HTMLInputElement;
    fireEvent.click(checkbox);
    expect(onChange).toHaveBeenCalledWith({ openInNewTab: true });
  });

  it('updates icon field (collapses empty to undefined)', () => {
    const { onChange } = renderPanel({ ...baseBtn, icon: 'arrow_forward' });
    const iconInput = screen.getByPlaceholderText('p. ej. arrow_forward') as HTMLInputElement;
    expect(iconInput.value).toBe('arrow_forward');
    fireEvent.change(iconInput, { target: { value: '' } });
    expect(onChange).toHaveBeenCalledWith({ icon: undefined });
  });

  it('updates icon to non-empty value', () => {
    const { onChange } = renderPanel(baseBtn);
    const iconInput = screen.getByPlaceholderText('p. ej. arrow_forward') as HTMLInputElement;
    fireEvent.change(iconInput, { target: { value: 'star' } });
    expect(onChange).toHaveBeenCalledWith({ icon: 'star' });
  });

  it('updates hoverEffect via select', () => {
    const { onChange } = renderPanel(baseBtn);
    const select = screen.getByDisplayValue('Ninguno') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 'lift' } });
    expect(onChange).toHaveBeenCalledWith({ hoverEffect: 'lift' });
  });

  it('updates presetId to a non-empty value', () => {
    const { onChange } = renderPanel(baseBtn);
    const presetInput = screen.getByPlaceholderText('ID de preset de los presets de marca') as HTMLInputElement;
    fireEvent.change(presetInput, { target: { value: 'brand-blue' } });
    expect(onChange).toHaveBeenCalledWith({ presetId: 'brand-blue' });
  });

  it('collapses empty presetId to undefined', () => {
    const { onChange } = renderPanel({ ...baseBtn, presetId: 'brand-blue' });
    const presetInput = screen.getByDisplayValue('brand-blue') as HTMLInputElement;
    fireEvent.change(presetInput, { target: { value: '' } });
    expect(onChange).toHaveBeenCalledWith({ presetId: undefined });
  });

  it('iconPosition select is disabled when no icon', () => {
    renderPanel({ ...baseBtn, icon: undefined });
    const iconPos = screen.getByDisplayValue('A la izquierda del texto') as HTMLSelectElement;
    expect(iconPos.disabled).toBe(true);
  });

  it('iconPosition select is enabled when icon set', () => {
    renderPanel({ ...baseBtn, icon: 'star' });
    const iconPos = screen.getByDisplayValue('A la izquierda del texto') as HTMLSelectElement;
    expect(iconPos.disabled).toBe(false);
  });

  it('defaults variant to primary when not set', () => {
    renderPanel({ ...baseBtn, variant: undefined });
    expect(screen.getByDisplayValue('Primario')).toBeTruthy();
  });

  it('defaults size to md when not set', () => {
    renderPanel({ ...baseBtn, size: undefined });
    expect(screen.getByDisplayValue('Media')).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Tests — PopupBlockSettings
// ---------------------------------------------------------------------------

describe('FormPanel — PopupBlockSettings', () => {
  const basePopup = {
    id: 'pop1',
    type: 'popup',
    headline: 'Subscribe',
    body: 'Get updates',
    ctaLabel: 'Sign up',
    ctaUrl: 'https://sub.com',
    trigger: 'time-delay',
    delaySeconds: 5,
    frequency: 'once-per-session',
    dismissable: true,
  };

  it('renders headline RichTextEditable with value', () => {
    renderPanel(basePopup);
    const rte = screen.getByTestId('rte-Titular del modal') as HTMLTextAreaElement;
    expect(rte.value).toBe('Subscribe');
  });

  it('updates headline via RichTextEditable', () => {
    const { onChange } = renderPanel(basePopup);
    const rte = screen.getByTestId('rte-Titular del modal');
    fireEvent.change(rte, { target: { value: 'New Headline' } });
    expect(onChange).toHaveBeenCalledWith({ headline: 'New Headline' });
  });

  it('updates body via RichTextEditable (collapses empty to undefined)', () => {
    const { onChange } = renderPanel(basePopup);
    const rte = screen.getByTestId('rte-Texto del cuerpo — admite texto enriquecido');
    fireEvent.change(rte, { target: { value: '' } });
    expect(onChange).toHaveBeenCalledWith({ body: undefined });
  });

  it('updates ctaLabel input', () => {
    const { onChange } = renderPanel(basePopup);
    const input = screen.getByPlaceholderText('Quiero registrarme') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'Join Us' } });
    expect(onChange).toHaveBeenCalledWith({ ctaLabel: 'Join Us' });
  });

  it('collapses empty ctaLabel to undefined', () => {
    const { onChange } = renderPanel(basePopup);
    const input = screen.getByPlaceholderText('Quiero registrarme') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '' } });
    expect(onChange).toHaveBeenCalledWith({ ctaLabel: undefined });
  });

  it('updates ctaUrl input', () => {
    const { onChange } = renderPanel(basePopup);
    const input = screen.getByPlaceholderText('https:// o /go/<slug>') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'https://new.com' } });
    expect(onChange).toHaveBeenCalledWith({ ctaUrl: 'https://new.com' });
  });

  it('changes trigger via select', () => {
    const { onChange } = renderPanel(basePopup);
    const select = screen.getByDisplayValue('Retardo de tiempo') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 'scroll-percent' } });
    expect(onChange).toHaveBeenCalledWith({ trigger: 'scroll-percent' });
  });

  it('shows delay seconds input when trigger is time-delay', () => {
    renderPanel(basePopup);
    const delayInput = screen.getByDisplayValue('5') as HTMLInputElement;
    expect(delayInput).toBeTruthy();
  });

  it('does not show delay seconds input when trigger is page-load', () => {
    renderPanel({ ...basePopup, trigger: 'page-load' });
    expect(screen.queryByDisplayValue('5')).toBeNull();
  });

  it('updates delaySeconds', () => {
    const { onChange } = renderPanel(basePopup);
    const input = screen.getByDisplayValue('5') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '10' } });
    expect(onChange).toHaveBeenCalledWith({ delaySeconds: 10 });
  });

  it('shows scroll percent input when trigger is scroll-percent', () => {
    renderPanel({ ...basePopup, trigger: 'scroll-percent', scrollPercent: 50 });
    const input = screen.getByDisplayValue('50') as HTMLInputElement;
    expect(input).toBeTruthy();
  });

  it('clamps scrollPercent to 0-100', () => {
    const { onChange } = renderPanel({ ...basePopup, trigger: 'scroll-percent', scrollPercent: 50 });
    const input = screen.getByDisplayValue('50') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '120' } });
    expect(onChange).toHaveBeenCalledWith({ scrollPercent: 100 });
  });

  it('does not show scroll percent input when trigger is exit-intent', () => {
    renderPanel({ ...basePopup, trigger: 'exit-intent' });
    expect(screen.queryByDisplayValue('50')).toBeNull();
  });

  it('changes frequency via select', () => {
    const { onChange } = renderPanel(basePopup);
    const select = screen.getByDisplayValue('Una vez por sesión') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 'always' } });
    expect(onChange).toHaveBeenCalledWith({ frequency: 'always' });
  });

  it('toggles dismissable checkbox', () => {
    const { onChange } = renderPanel(basePopup);
    const checkbox = screen.getByRole('checkbox') as HTMLInputElement;
    fireEvent.click(checkbox);
    expect(onChange).toHaveBeenCalledWith({ dismissable: false });
  });

  it('defaults trigger to time-delay when not set', () => {
    renderPanel({ ...basePopup, trigger: undefined });
    expect(screen.getByDisplayValue('Retardo de tiempo')).toBeTruthy();
  });

  it('defaults dismissable to true when not set', () => {
    renderPanel({ ...basePopup, dismissable: undefined });
    const checkbox = screen.getByRole('checkbox') as HTMLInputElement;
    expect(checkbox.checked).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Tests — SurveyBlockSettings (fetch + combobox)
// ---------------------------------------------------------------------------

describe('FormPanel — SurveyBlockSettings', () => {
  const baseSurvey = {
    id: 'sv1',
    type: 'survey',
    slug: '',
    title: 'Take Our Survey',
    description: 'We want feedback',
    height: '700px',
    showPageTitle: true,
    showDescription: true,
    showLogo: true,
  };

  it('renders title and description inputs with values', async () => {
    await act(async () => { renderPanel(baseSurvey); });
    expect((screen.getByPlaceholderText('Responde nuestra encuesta') as HTMLInputElement).value).toBe('Take Our Survey');
    expect((screen.getByPlaceholderText("Nos encantaría conocer tu opinión") as HTMLInputElement).value).toBe('We want feedback');
  });

  it('updates title input', async () => {
    let onChange: ReturnType<typeof makeOnChange>;
    await act(async () => {
      const r = renderPanel(baseSurvey);
      onChange = r.onChange;
    });
    const title = screen.getByPlaceholderText('Responde nuestra encuesta') as HTMLInputElement;
    fireEvent.change(title, { target: { value: 'New Survey Title' } });
    expect(onChange!).toHaveBeenCalledWith({ title: 'New Survey Title' });
  });

  it('updates height input', async () => {
    let onChange: ReturnType<typeof makeOnChange>;
    await act(async () => {
      const r = renderPanel(baseSurvey);
      onChange = r.onChange;
    });
    const height = screen.getByDisplayValue('700px') as HTMLInputElement;
    fireEvent.change(height, { target: { value: '900px' } });
    expect(onChange!).toHaveBeenCalledWith({ height: '900px' });
  });

  it('toggles showPageTitle checkbox', async () => {
    let onChange: ReturnType<typeof makeOnChange>;
    await act(async () => {
      const r = renderPanel(baseSurvey);
      onChange = r.onChange;
    });
    const checkboxes = screen.getAllByRole('checkbox') as HTMLInputElement[];
    // First checkbox = Show Survey Title
    fireEvent.click(checkboxes[0]);
    expect(onChange!).toHaveBeenCalledWith({ showPageTitle: false });
  });

  it('toggles showDescription checkbox', async () => {
    let onChange: ReturnType<typeof makeOnChange>;
    await act(async () => {
      const r = renderPanel(baseSurvey);
      onChange = r.onChange;
    });
    const checkboxes = screen.getAllByRole('checkbox') as HTMLInputElement[];
    fireEvent.click(checkboxes[1]);
    expect(onChange!).toHaveBeenCalledWith({ showDescription: false });
  });

  it('toggles showLogo checkbox', async () => {
    let onChange: ReturnType<typeof makeOnChange>;
    await act(async () => {
      const r = renderPanel(baseSurvey);
      onChange = r.onChange;
    });
    const checkboxes = screen.getAllByRole('checkbox') as HTMLInputElement[];
    fireEvent.click(checkboxes[2]);
    expect(onChange!).toHaveBeenCalledWith({ showLogo: false });
  });

  it('opens dropdown on search input focus', async () => {
    await act(async () => { renderPanel(baseSurvey); });
    const searchInput = screen.getByPlaceholderText('Buscar encuestas...');
    fireEvent.focus(searchInput);
    // dropdown container appears (even empty)
    expect(screen.getByText('No se encontraron encuestas')).toBeTruthy();
  });

  it('populates dropdown with fetched surveys and allows selection', async () => {
    mockFetchJson.mockResolvedValueOnce({
      success: true,
      data: [{ id: 1, slug: 'nps-survey', title: 'NPS Survey', status: 'active', responseCount: 42 }],
    });

    let onChange: ReturnType<typeof makeOnChange>;
    await act(async () => {
      const r = renderPanel(baseSurvey);
      onChange = r.onChange;
    });

    const searchInput = screen.getByPlaceholderText('Buscar encuestas...');
    fireEvent.focus(searchInput);

    // survey item should appear
    const btn = await screen.findByText('NPS Survey');
    fireEvent.click(btn);
    expect(onChange!).toHaveBeenCalledWith({ slug: 'nps-survey' });
    // dropdown closes after selection
    expect(screen.queryByText('No se encontraron encuestas')).toBeNull();
  });

  it('shows selected survey name when slug matches a fetched survey', async () => {
    mockFetchJson.mockResolvedValueOnce({
      success: true,
      data: [{ id: 1, slug: 'feedback', title: 'Feedback Survey', status: 'active', responseCount: 5 }],
    });

    await act(async () => {
      renderPanel({ ...baseSurvey, slug: 'feedback' });
    });

    expect(screen.getByText('Feedback Survey')).toBeTruthy();
  });

  it('falls back gracefully when fetch returns success=false', async () => {
    mockFetchJson.mockResolvedValueOnce({ success: false });
    await act(async () => { renderPanel(baseSurvey); });
    // Should not throw; search input is present
    expect(screen.getByPlaceholderText('Buscar encuestas...')).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Tests — SurveyInputBlockSettings
// ---------------------------------------------------------------------------

describe('FormPanel — SurveyInputBlockSettings', () => {
  const baseSurveyInput = {
    id: 'si1',
    type: 'survey-input',
    fieldType: 'text',
    fieldLabel: 'What is your name?',
    placeholder: '',
    options: [],
  };

  it('renders fieldType select with current value', () => {
    renderPanel(baseSurveyInput);
    const select = screen.getByDisplayValue('text') as HTMLSelectElement;
    expect(select.value).toBe('text');
  });

  it('updates fieldType via select', () => {
    const { onChange } = renderPanel(baseSurveyInput);
    const select = screen.getByDisplayValue('text') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 'textarea' } });
    expect(onChange).toHaveBeenCalledWith({ fieldType: 'textarea' });
  });

  it('renders fieldLabel input and updates it', () => {
    const { onChange } = renderPanel(baseSurveyInput);
    const input = screen.getByPlaceholderText('Pregunta o etiqueta') as HTMLInputElement;
    expect(input.value).toBe('What is your name?');
    fireEvent.change(input, { target: { value: 'Your email?' } });
    expect(onChange).toHaveBeenCalledWith({ fieldLabel: 'Your email?' });
  });

  it('updates placeholder (collapses empty to undefined)', () => {
    const { onChange } = renderPanel({ ...baseSurveyInput, placeholder: 'Type here' });
    const input = screen.getByPlaceholderText('Texto del marcador de posición (opcional)') as HTMLInputElement;
    expect(input.value).toBe('Type here');
    fireEvent.change(input, { target: { value: '' } });
    expect(onChange).toHaveBeenCalledWith({ placeholder: undefined });
  });

  it('does not render options editor for text field type', () => {
    renderPanel(baseSurveyInput);
    expect(screen.queryByText('+ Añadir opción')).toBeNull();
  });

  it('shows options editor for select field type', () => {
    renderPanel({ ...baseSurveyInput, fieldType: 'select', options: ['Red', 'Blue'] });
    expect(screen.getByText('+ Añadir opción')).toBeTruthy();
    expect((screen.getAllByDisplayValue('Red')[0] as HTMLInputElement).value).toBe('Red');
  });

  it('shows options editor for radio field type', () => {
    renderPanel({ ...baseSurveyInput, fieldType: 'radio', options: [] });
    expect(screen.getByText('+ Añadir opción')).toBeTruthy();
  });

  it('adds an option when + Add Option clicked', () => {
    const { onChange } = renderPanel({ ...baseSurveyInput, fieldType: 'select', options: ['Yes'] });
    fireEvent.click(screen.getByText('+ Añadir opción'));
    expect(onChange).toHaveBeenCalledWith({ options: ['Yes', ''] });
  });

  it('removes an option via the × button', () => {
    const { onChange } = renderPanel({
      ...baseSurveyInput,
      fieldType: 'select',
      options: ['Yes', 'No'],
    });
    const removeBtns = screen.getAllByText('×');
    fireEvent.click(removeBtns[0]);
    expect(onChange).toHaveBeenCalledWith({ options: ['No'] });
  });

  it('edits an option value inline', () => {
    const { onChange } = renderPanel({
      ...baseSurveyInput,
      fieldType: 'select',
      options: ['Option A'],
    });
    const optInput = screen.getByDisplayValue('Option A') as HTMLInputElement;
    fireEvent.change(optInput, { target: { value: 'Option B' } });
    expect(onChange).toHaveBeenCalledWith({ options: ['Option B'] });
  });

  it('does not render slider config for non-slider field', () => {
    renderPanel(baseSurveyInput);
    expect(screen.queryByText('Mín')).toBeNull();
  });

  it('shows slider config for slider field type', () => {
    renderPanel({ ...baseSurveyInput, fieldType: 'slider', min: 0, max: 100, step: 1 });
    expect(screen.getByText('Mín')).toBeTruthy();
    expect(screen.getByText('Máx')).toBeTruthy();
    expect(screen.getByText('Paso')).toBeTruthy();
  });

  it('updates slider min/max/step values', () => {
    const { onChange } = renderPanel({ ...baseSurveyInput, fieldType: 'slider', min: 0, max: 100, step: 1 });
    const numberInputs = screen.getAllByRole('spinbutton') as HTMLInputElement[];
    fireEvent.change(numberInputs[0], { target: { value: '5' } });
    fireEvent.change(numberInputs[1], { target: { value: '50' } });
    fireEvent.change(numberInputs[2], { target: { value: '5' } });
    expect(onChange).toHaveBeenCalledWith({ min: 5 });
    expect(onChange).toHaveBeenCalledWith({ max: 50 });
    expect(onChange).toHaveBeenCalledWith({ step: 5 });
  });

  it('shows options editor for checkbox field type', () => {
    renderPanel({ ...baseSurveyInput, fieldType: 'checkbox', options: [] });
    expect(screen.getByText('+ Añadir opción')).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Tests — EmailHeaderBlockSettings
// ---------------------------------------------------------------------------

describe('FormPanel — EmailHeaderBlockSettings', () => {
  const baseEmailHeader = {
    id: 'eh1',
    type: 'email-header',
    logoUrl: 'https://logo.com/img.png',
    logoWidth: 180,
    alignment: 'center',
    tagline: 'Your trusted partner',
  };

  it('renders Logo URL input with value', () => {
    renderPanel(baseEmailHeader);
    const input = screen.getByDisplayValue('https://logo.com/img.png') as HTMLInputElement;
    expect(input).toBeTruthy();
  });

  it('updates logoUrl (collapses empty to undefined)', () => {
    const { onChange } = renderPanel(baseEmailHeader);
    const input = screen.getByDisplayValue('https://logo.com/img.png') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '' } });
    expect(onChange).toHaveBeenCalledWith({ logoUrl: undefined });
    fireEvent.change(input, { target: { value: 'https://new.com/logo.png' } });
    expect(onChange).toHaveBeenCalledWith({ logoUrl: 'https://new.com/logo.png' });
  });

  it('updates logoWidth via number input', () => {
    const { onChange } = renderPanel(baseEmailHeader);
    const input = screen.getByDisplayValue('180') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '240' } });
    expect(onChange).toHaveBeenCalledWith({ logoWidth: 240 });
  });

  it('collapses zero logoWidth to undefined', () => {
    const { onChange } = renderPanel(baseEmailHeader);
    const input = screen.getByDisplayValue('180') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '0' } });
    expect(onChange).toHaveBeenCalledWith({ logoWidth: undefined });
  });

  it('changes alignment via select', () => {
    const { onChange } = renderPanel(baseEmailHeader);
    const select = screen.getByDisplayValue('Centrado') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 'left' } });
    expect(onChange).toHaveBeenCalledWith({ alignment: 'left' });
  });

  it('updates tagline input', () => {
    const { onChange } = renderPanel(baseEmailHeader);
    const input = screen.getByDisplayValue('Your trusted partner') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'New tagline' } });
    expect(onChange).toHaveBeenCalledWith({ tagline: 'New tagline' });
  });

  it('collapses empty tagline to undefined', () => {
    const { onChange } = renderPanel(baseEmailHeader);
    const input = screen.getByDisplayValue('Your trusted partner') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '' } });
    expect(onChange).toHaveBeenCalledWith({ tagline: undefined });
  });
});

// ---------------------------------------------------------------------------
// Tests — EmailFooterBlockSettings
// ---------------------------------------------------------------------------

describe('FormPanel — EmailFooterBlockSettings', () => {
  const baseEmailFooter = {
    id: 'ef1',
    type: 'email-footer',
    companyName: 'Acme Corp',
    address: '123 Main St',
    showUnsubscribe: true,
    showViewInBrowser: false,
    socialLinks: [{ platform: 'linkedin', url: 'https://linkedin.com/co/acme' }],
  };

  it('renders companyName input with value', () => {
    renderPanel(baseEmailFooter);
    expect((screen.getByDisplayValue('Acme Corp') as HTMLInputElement).value).toBe('Acme Corp');
  });

  it('updates companyName (collapses empty to undefined)', () => {
    const { onChange } = renderPanel(baseEmailFooter);
    const input = screen.getByDisplayValue('Acme Corp') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '' } });
    expect(onChange).toHaveBeenCalledWith({ companyName: undefined });
  });

  it('updates address textarea', () => {
    const { onChange } = renderPanel(baseEmailFooter);
    const textarea = screen.getByDisplayValue('123 Main St') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: '456 New Ave' } });
    expect(onChange).toHaveBeenCalledWith({ address: '456 New Ave' });
  });

  it('collapses empty address to undefined', () => {
    const { onChange } = renderPanel(baseEmailFooter);
    const textarea = screen.getByDisplayValue('123 Main St') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: '' } });
    expect(onChange).toHaveBeenCalledWith({ address: undefined });
  });

  it('toggles showUnsubscribe checkbox', () => {
    const { onChange } = renderPanel(baseEmailFooter);
    const checkboxes = screen.getAllByRole('checkbox') as HTMLInputElement[];
    // First checkbox = showUnsubscribe (true)
    expect(checkboxes[0].checked).toBe(true);
    fireEvent.click(checkboxes[0]);
    expect(onChange).toHaveBeenCalledWith({ showUnsubscribe: false });
  });

  it('toggles showViewInBrowser checkbox', () => {
    const { onChange } = renderPanel(baseEmailFooter);
    const checkboxes = screen.getAllByRole('checkbox') as HTMLInputElement[];
    expect(checkboxes[1].checked).toBe(false);
    fireEvent.click(checkboxes[1]);
    expect(onChange).toHaveBeenCalledWith({ showViewInBrowser: true });
  });

  it('renders existing social link platform + url inputs', () => {
    renderPanel(baseEmailFooter);
    expect((screen.getByDisplayValue('linkedin') as HTMLInputElement).value).toBe('linkedin');
    expect((screen.getByDisplayValue('https://linkedin.com/co/acme') as HTMLInputElement).value).toBe(
      'https://linkedin.com/co/acme'
    );
  });

  it('updates social link platform', () => {
    const { onChange } = renderPanel(baseEmailFooter);
    const platformInput = screen.getByDisplayValue('linkedin') as HTMLInputElement;
    fireEvent.change(platformInput, { target: { value: 'twitter' } });
    expect(onChange).toHaveBeenCalledWith({
      socialLinks: [{ platform: 'twitter', url: 'https://linkedin.com/co/acme' }],
    });
  });

  it('updates social link url', () => {
    const { onChange } = renderPanel(baseEmailFooter);
    const urlInput = screen.getByDisplayValue('https://linkedin.com/co/acme') as HTMLInputElement;
    fireEvent.change(urlInput, { target: { value: 'https://twitter.com/acme' } });
    expect(onChange).toHaveBeenCalledWith({
      socialLinks: [{ platform: 'linkedin', url: 'https://twitter.com/acme' }],
    });
  });

  it('removes a social link', () => {
    const { onChange } = renderPanel(baseEmailFooter);
    const removeBtn = screen.getByText('×');
    fireEvent.click(removeBtn);
    expect(onChange).toHaveBeenCalledWith({ socialLinks: [] });
  });

  it('adds a new social link', () => {
    const { onChange } = renderPanel({ ...baseEmailFooter, socialLinks: [] });
    fireEvent.click(screen.getByText('+ Añadir enlace social'));
    expect(onChange).toHaveBeenCalledWith({ socialLinks: [{ platform: '', url: '' }] });
  });
});

// ---------------------------------------------------------------------------
// Tests — BookingMenuBlockSettings
// ---------------------------------------------------------------------------

describe('FormPanel — BookingMenuBlockSettings', () => {
  const baseBookingMenu = {
    id: 'bm1',
    type: 'booking-menu',
    title: 'Book a Session',
    description: 'Choose a service',
    columns: 3,
  };

  it('renders Section Title RichTextEditable with value', () => {
    renderPanel(baseBookingMenu);
    const rte = screen.getByTestId('rte-Título de sección opcional...') as HTMLTextAreaElement;
    expect(rte.value).toBe('Book a Session');
  });

  it('updates title via RichTextEditable (collapses empty to undefined)', () => {
    const { onChange } = renderPanel(baseBookingMenu);
    const rte = screen.getByTestId('rte-Título de sección opcional...');
    fireEvent.change(rte, { target: { value: '' } });
    expect(onChange).toHaveBeenCalledWith({ title: undefined });
    fireEvent.change(rte, { target: { value: 'New Title' } });
    expect(onChange).toHaveBeenCalledWith({ title: 'New Title' });
  });

  it('updates description via RichTextEditable (collapses empty to undefined)', () => {
    const { onChange } = renderPanel(baseBookingMenu);
    const rte = screen.getByTestId('rte-Descripción opcional...');
    fireEvent.change(rte, { target: { value: '' } });
    expect(onChange).toHaveBeenCalledWith({ description: undefined });
  });

  it('changes columns via select', () => {
    const { onChange } = renderPanel(baseBookingMenu);
    const select = screen.getByDisplayValue('3 columnas') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: '4' } });
    expect(onChange).toHaveBeenCalledWith({ columns: 4 });
  });

  it('defaults columns to 3 when not set', () => {
    renderPanel({ ...baseBookingMenu, columns: undefined });
    expect(screen.getByDisplayValue('3 columnas')).toBeTruthy();
  });
});
