// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import React from 'react';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn() }),
}));

// fetch is assigned in beforeEach so clearAllMocks() doesn't wipe the default
const mockFetch = vi.fn();
beforeEach(() => {
  // resetAllMocks (not clearAllMocks) — clearAllMocks only wipes call history,
  // it leaves any unconsumed mockResolvedValueOnce() queued on mockFetch, which
  // then leaks into the NEXT test and desyncs its fetch responses. reset clears
  // the queued implementations too so every test starts with a clean queue.
  vi.resetAllMocks();
  global.fetch = mockFetch;
  (global.confirm as ReturnType<typeof vi.fn>) = vi.fn(() => true) as unknown as typeof confirm;
});

// ---------------------------------------------------------------------------
// Component under test
// ---------------------------------------------------------------------------

import CrmCustomFieldsAdmin from '@/components/portal/CrmCustomFieldsAdmin';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type FieldOverrides = Partial<{
  id: number;
  entityType: string;
  fieldName: string;
  fieldType: string;
  options: string[] | null;
  required: boolean;
  sortOrder: number;
  category: string | null;
}>;

function makeField(overrides: FieldOverrides = {}) {
  return {
    id: 1,
    entityType: 'contact',
    fieldName: 'Company Size',
    fieldType: 'text',
    options: null,
    required: false,
    sortOrder: 0,
    category: null,
    ...overrides,
  };
}

function mockLoadOk(fields: ReturnType<typeof makeField>[]) {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: async () => ({ success: true, data: fields }),
  });
}

// Wait for loading to finish (either field text or empty state)
async function waitForLoaded() {
  await waitFor(() => {
    expect(screen.queryByText('Cargando...')).not.toBeInTheDocument();
  });
}

// The field-type <select> in the create form. The "Category" <input list=...>
// bound to a <datalist> also carries an implicit combobox role, so a bare
// getByRole('combobox') is ambiguous — disambiguate by element tag.
function getTypeSelect() {
  return screen.getAllByRole('combobox').find(el => el.tagName === 'SELECT')!;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CrmCustomFieldsAdmin', () => {
  // -------------------------------------------------------------------------
  // Initial render
  // -------------------------------------------------------------------------

  describe('initial render', () => {
    it('shows loading spinner then renders field list', async () => {
      mockLoadOk([makeField({ fieldName: 'Revenue' })]);

      render(<CrmCustomFieldsAdmin />);

      expect(screen.getByText('Cargando...')).toBeInTheDocument();

      await waitFor(() => {
        expect(screen.getByText('Revenue')).toBeInTheDocument();
      });
    });

    it('shows empty state when no fields', async () => {
      mockLoadOk([]);

      render(<CrmCustomFieldsAdmin />);

      await waitFor(() => {
        expect(screen.getByText(/Aún no hay campos personalizados para contactos/i)).toBeInTheDocument();
      });
    });

    it('renders entity tabs: Contacts, Companies, Deals', async () => {
      mockLoadOk([]);

      render(<CrmCustomFieldsAdmin />);

      // Tabs are rendered immediately (no async needed)
      expect(screen.getByText('Contactos')).toBeInTheDocument();
      expect(screen.getByText('Empresas')).toBeInTheDocument();
      expect(screen.getByText('Negocios')).toBeInTheDocument();
    });

    it('renders the create form', async () => {
      mockLoadOk([]);

      render(<CrmCustomFieldsAdmin />);

      expect(screen.getByText('Añadir un campo')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Añadir campo/i })).toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // Entity tab switching
  // -------------------------------------------------------------------------

  describe('entity tab switching', () => {
    it('loads fields for company when Companies tab clicked', async () => {
      mockLoadOk([]); // initial contact load
      mockLoadOk([makeField({ entityType: 'company', fieldName: 'Industry' })]); // company load

      render(<CrmCustomFieldsAdmin />);
      await waitForLoaded();

      await act(async () => {
        fireEvent.click(screen.getByText('Empresas'));
      });

      await waitFor(() => {
        expect(screen.getByText('Industry')).toBeInTheDocument();
      });

      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(mockFetch).toHaveBeenLastCalledWith(
        expect.stringContaining('entityType=company'),
      );
    });

    it('resets error when switching tabs', async () => {
      mockLoadOk([]); // initial
      mockLoadOk([]); // after tab switch

      render(<CrmCustomFieldsAdmin />);
      await waitForLoaded();

      // Trigger a validation error
      const nameInput = screen.getByPlaceholderText('Nombre del campo');
      fireEvent.change(nameInput, { target: { value: 'Priority' } });

      const typeSelect = getTypeSelect();
      fireEvent.change(typeSelect, { target: { value: 'select' } });

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /Añadir campo/i }));
      });

      await waitFor(() => {
        expect(screen.getByText(/requiere al menos una opción/i)).toBeInTheDocument();
      });

      await act(async () => {
        fireEvent.click(screen.getByText('Negocios'));
      });

      await waitFor(() => {
        expect(screen.queryByText(/requiere al menos una opción/i)).not.toBeInTheDocument();
      });
    });
  });

  // -------------------------------------------------------------------------
  // Field list display
  // -------------------------------------------------------------------------

  describe('field list display', () => {
    it('renders field name, type badge, category badge, required badge', async () => {
      mockLoadOk([
        makeField({
          fieldName: 'Annual Revenue',
          fieldType: 'number',
          category: 'Finance',
          required: true,
        }),
      ]);

      render(<CrmCustomFieldsAdmin />);

      await waitFor(() => {
        expect(screen.getByText('Annual Revenue')).toBeInTheDocument();
        expect(screen.getAllByText('Número')[0]).toBeInTheDocument();
        expect(screen.getByText('Finance')).toBeInTheDocument();
        expect(screen.getByText('obligatorio')).toBeInTheDocument();
      });
    });

    it('renders select field options as comma-separated list', async () => {
      mockLoadOk([
        makeField({
          fieldType: 'select',
          fieldName: 'Priority',
          options: ['Low', 'Medium', 'High'],
        }),
      ]);

      render(<CrmCustomFieldsAdmin />);

      await waitFor(() => {
        expect(screen.getByText('Low, Medium, High')).toBeInTheDocument();
      });
    });

    it('does not render options row when options is null', async () => {
      mockLoadOk([makeField({ fieldName: 'Notes Field', options: null })]);

      render(<CrmCustomFieldsAdmin />);

      await waitFor(() => {
        expect(screen.getByText('Notes Field')).toBeInTheDocument();
      });

      expect(screen.queryByText(/Low.*Medium/)).not.toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // Create field
  // -------------------------------------------------------------------------

  describe('create field', () => {
    it('adds a text field successfully', async () => {
      const newField = makeField({ id: 99, fieldName: 'Website URL', fieldType: 'text' });
      mockLoadOk([]);
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: newField }),
      });

      render(<CrmCustomFieldsAdmin />);
      await waitForLoaded();

      fireEvent.change(screen.getByPlaceholderText('Nombre del campo'), {
        target: { value: 'Website URL' },
      });

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /Añadir campo/i }));
      });

      await waitFor(() => {
        expect(screen.getByText('Website URL')).toBeInTheDocument();
      });

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/portal/crm/custom-fields',
        expect.objectContaining({ method: 'POST' }),
      );
    });

    it('disables submit button when field name is empty', async () => {
      mockLoadOk([]);

      render(<CrmCustomFieldsAdmin />);

      const addBtn = screen.getByRole('button', { name: /Añadir campo/i });
      expect(addBtn).toBeDisabled();
    });

    it('shows options input for select type', async () => {
      mockLoadOk([]);

      render(<CrmCustomFieldsAdmin />);

      fireEvent.change(getTypeSelect(), { target: { value: 'select' } });

      expect(screen.getByPlaceholderText(/Opciones \(separadas por comas/i)).toBeInTheDocument();
    });

    it('shows options input for multiselect type', async () => {
      mockLoadOk([]);

      render(<CrmCustomFieldsAdmin />);

      fireEvent.change(getTypeSelect(), { target: { value: 'multiselect' } });

      expect(screen.getByPlaceholderText(/Opciones \(separadas por comas/i)).toBeInTheDocument();
    });

    it('does NOT show options input for text type', async () => {
      mockLoadOk([]);

      render(<CrmCustomFieldsAdmin />);

      // text is default — options input should not appear
      expect(screen.queryByPlaceholderText(/Opciones \(separadas por comas/i)).not.toBeInTheDocument();
    });

    it('validates select type requires at least one option', async () => {
      mockLoadOk([]);

      render(<CrmCustomFieldsAdmin />);

      fireEvent.change(screen.getByPlaceholderText('Nombre del campo'), {
        target: { value: 'Status' },
      });
      fireEvent.change(getTypeSelect(), { target: { value: 'select' } });
      // Leave options blank

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /Añadir campo/i }));
      });

      expect(
        screen.getByText(/requiere al menos una opción/i),
      ).toBeInTheDocument();
    });

    it('creates select field with options successfully', async () => {
      const newField = makeField({
        id: 5,
        fieldName: 'Status',
        fieldType: 'select',
        options: ['Open', 'Closed'],
      });
      mockLoadOk([]);
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: newField }),
      });

      render(<CrmCustomFieldsAdmin />);
      await waitForLoaded();

      fireEvent.change(screen.getByPlaceholderText('Nombre del campo'), {
        target: { value: 'Status' },
      });
      fireEvent.change(getTypeSelect(), { target: { value: 'select' } });
      fireEvent.change(screen.getByPlaceholderText(/Opciones \(separadas por comas/i), {
        target: { value: 'Open, Closed' },
      });

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /Añadir campo/i }));
      });

      await waitFor(() => {
        expect(screen.getByText('Status')).toBeInTheDocument();
      });
    });

    it('shows error message when create fails', async () => {
      mockLoadOk([]);
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: async () => ({ success: false, message: 'Duplicate field name' }),
      });

      render(<CrmCustomFieldsAdmin />);
      await waitForLoaded();

      fireEvent.change(screen.getByPlaceholderText('Nombre del campo'), {
        target: { value: 'Email' },
      });

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /Añadir campo/i }));
      });

      await waitFor(() => {
        expect(screen.getByText('Duplicate field name')).toBeInTheDocument();
      });
    });

    it('uses fallback error message when message is missing', async () => {
      mockLoadOk([]);
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: async () => ({ success: false }),
      });

      render(<CrmCustomFieldsAdmin />);
      await waitForLoaded();

      fireEvent.change(screen.getByPlaceholderText('Nombre del campo'), {
        target: { value: 'Notes' },
      });

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /Añadir campo/i }));
      });

      await waitFor(() => {
        expect(screen.getByText('No se pudo crear el campo')).toBeInTheDocument();
      });
    });

    it('toggles required checkbox', async () => {
      mockLoadOk([]);

      render(<CrmCustomFieldsAdmin />);

      const requiredCheckbox = screen.getByRole('checkbox');
      expect(requiredCheckbox).not.toBeChecked();
      fireEvent.click(requiredCheckbox);
      expect(requiredCheckbox).toBeChecked();
    });

    it('sends category in POST body', async () => {
      const newField = makeField({ id: 10, fieldName: 'Region', category: 'Location' });
      mockLoadOk([]);
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: newField }),
      });

      render(<CrmCustomFieldsAdmin />);
      await waitForLoaded();

      fireEvent.change(screen.getByPlaceholderText('Nombre del campo'), {
        target: { value: 'Region' },
      });
      fireEvent.change(screen.getByPlaceholderText('Categoría (opcional)'), {
        target: { value: 'Location' },
      });

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /Añadir campo/i }));
      });

      await waitFor(() => {
        expect(screen.getByText('Region')).toBeInTheDocument();
      });

      const body = JSON.parse((mockFetch.mock.calls[1][1] as RequestInit).body as string);
      expect(body.category).toBe('Location');
    });
  });

  // -------------------------------------------------------------------------
  // Edit field
  // -------------------------------------------------------------------------

  describe('edit field', () => {
    it('clicking edit button enters edit mode', async () => {
      mockLoadOk([makeField({ fieldName: 'MyTextField' })]);

      render(<CrmCustomFieldsAdmin />);
      await waitFor(() => screen.getByText('MyTextField'));

      fireEvent.click(screen.getByTitle('Editar'));

      // Edit form shows Save/Cancel
      expect(screen.getByRole('button', { name: 'Guardar' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Cancelar' })).toBeInTheDocument();
    });

    it('cancel button exits edit mode', async () => {
      mockLoadOk([makeField({ fieldName: 'MyField2' })]);

      render(<CrmCustomFieldsAdmin />);
      await waitFor(() => screen.getByText('MyField2'));

      fireEvent.click(screen.getByTitle('Editar'));
      expect(screen.getByRole('button', { name: 'Cancelar' })).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

      await waitFor(() => {
        expect(screen.queryByRole('button', { name: 'Guardar' })).not.toBeInTheDocument();
      });
    });

    it('save button sends PUT request and updates field in list', async () => {
      const original = makeField({ id: 7, fieldName: 'MyRegion' });
      const updated = { ...original, fieldName: 'Territory' };
      mockLoadOk([original]);
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: updated }),
      });

      render(<CrmCustomFieldsAdmin />);
      await waitFor(() => screen.getByText('MyRegion'));

      fireEvent.click(screen.getByTitle('Editar'));

      // The edit name input is the one inside the edit form (inside the field card)
      // Use getAllByPlaceholderText and pick the first (in-card edit input)
      const nameInputs = screen.getAllByPlaceholderText('Nombre del campo');
      fireEvent.change(nameInputs[0], { target: { value: 'Territory' } });

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
      });

      await waitFor(() => {
        expect(screen.getByText('Territory')).toBeInTheDocument();
      });

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/portal/crm/custom-fields/7',
        expect.objectContaining({ method: 'PUT' }),
      );
    });

    it('save edit shows error when update fails', async () => {
      mockLoadOk([makeField({ id: 3, fieldName: 'MyPhone' })]);
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: async () => ({ success: false, message: 'Server error' }),
      });

      render(<CrmCustomFieldsAdmin />);
      await waitFor(() => screen.getByText('MyPhone'));

      fireEvent.click(screen.getByTitle('Editar'));

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
      });

      await waitFor(() => {
        expect(screen.getByText('Server error')).toBeInTheDocument();
      });
    });

    it('save edit validates options for select field type', async () => {
      mockLoadOk([makeField({ id: 4, fieldName: 'SelectField', fieldType: 'select', options: ['Low'] })]);

      render(<CrmCustomFieldsAdmin />);
      await waitFor(() => screen.getByText('SelectField'));

      fireEvent.click(screen.getByTitle('Editar'));

      const optionsInput = screen.getByPlaceholderText('Opciones (separadas por comas)');
      fireEvent.change(optionsInput, { target: { value: '' } });

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
      });

      expect(
        screen.getByText(/requiere al menos una opción/i),
      ).toBeInTheDocument();
    });

    it('edit form shows options input for select field type', async () => {
      mockLoadOk([makeField({ fieldName: 'SelectStatus', fieldType: 'select', options: ['Open', 'Closed'] })]);

      render(<CrmCustomFieldsAdmin />);
      await waitFor(() => screen.getByText('SelectStatus'));

      fireEvent.click(screen.getByTitle('Editar'));

      expect(screen.getByPlaceholderText('Opciones (separadas por comas)')).toBeInTheDocument();
    });

    it('edit form does NOT show options input for text field type', async () => {
      mockLoadOk([makeField({ fieldName: 'TextOnlyField', fieldType: 'text' })]);

      render(<CrmCustomFieldsAdmin />);
      await waitFor(() => screen.getByText('TextOnlyField'));

      fireEvent.click(screen.getByTitle('Editar'));

      expect(screen.queryByPlaceholderText('Opciones (separadas por comas)')).not.toBeInTheDocument();
    });

    it('edit form pre-populates category', async () => {
      mockLoadOk([makeField({ fieldName: 'CityField', category: 'Location' })]);

      render(<CrmCustomFieldsAdmin />);
      await waitFor(() => screen.getByText('CityField'));

      fireEvent.click(screen.getByTitle('Editar'));

      const catInput = screen.getByPlaceholderText('Categoría (p. ej. Tecnología, Ubicación)');
      expect((catInput as HTMLInputElement).value).toBe('Location');
    });

    it('edit required checkbox is checked when field is required', async () => {
      mockLoadOk([makeField({ fieldName: 'EmailReq', required: true })]);

      render(<CrmCustomFieldsAdmin />);
      await waitFor(() => screen.getByText('EmailReq'));

      fireEvent.click(screen.getByTitle('Editar'));

      // Both edit form and create form have a checkbox.
      // The edit form checkbox appears first in DOM order.
      const checkboxes = screen.getAllByRole('checkbox');
      const editCheckbox = checkboxes[0];
      expect(editCheckbox).toBeChecked();
    });
  });

  // -------------------------------------------------------------------------
  // Delete field
  // -------------------------------------------------------------------------

  describe('delete field', () => {
    it('calls DELETE when confirmed and removes field from list', async () => {
      mockLoadOk([makeField({ id: 11, fieldName: 'LinkedInField' })]);
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      });

      render(<CrmCustomFieldsAdmin />);
      await waitFor(() => screen.getByText('LinkedInField'));

      await act(async () => {
        fireEvent.click(screen.getByTitle('Eliminar'));
      });

      await waitFor(() => {
        expect(screen.queryByText('LinkedInField')).not.toBeInTheDocument();
      });

      expect(global.confirm).toHaveBeenCalledWith(
        '¿Eliminar este campo? Se eliminarán todos los valores guardados en él.',
      );
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/portal/crm/custom-fields/11',
        expect.objectContaining({ method: 'DELETE' }),
      );
    });

    it('does not call DELETE when user cancels confirm dialog', async () => {
      (global.confirm as ReturnType<typeof vi.fn>).mockReturnValueOnce(false);
      mockLoadOk([makeField({ id: 12, fieldName: 'TwitterField' })]);

      render(<CrmCustomFieldsAdmin />);
      await waitFor(() => screen.getByText('TwitterField'));

      fireEvent.click(screen.getByTitle('Eliminar'));

      // Only initial load fetch — no DELETE call
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(screen.getByText('TwitterField')).toBeInTheDocument();
    });

    it('shows error when delete fails', async () => {
      mockLoadOk([makeField({ id: 13, fieldName: 'FaxField' })]);
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: async () => ({ success: false, message: 'Cannot delete' }),
      });

      render(<CrmCustomFieldsAdmin />);
      await waitFor(() => screen.getByText('FaxField'));

      await act(async () => {
        fireEvent.click(screen.getByTitle('Eliminar'));
      });

      await waitFor(() => {
        expect(screen.getByText('Cannot delete')).toBeInTheDocument();
      });
    });

    it('uses fallback message when delete error has no message', async () => {
      mockLoadOk([makeField({ id: 14, fieldName: 'FaxField2' })]);
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: async () => ({ success: false }),
      });

      render(<CrmCustomFieldsAdmin />);
      await waitFor(() => screen.getByText('FaxField2'));

      await act(async () => {
        fireEvent.click(screen.getByTitle('Eliminar'));
      });

      await waitFor(() => {
        expect(screen.getByText('No se pudo eliminar el campo')).toBeInTheDocument();
      });
    });
  });

  // -------------------------------------------------------------------------
  // Field types coverage
  // -------------------------------------------------------------------------

  describe('field types display', () => {
    it('renders multiple fields of different types', async () => {
      mockLoadOk([
        makeField({ id: 1, fieldName: 'NameField', fieldType: 'text' }),
        makeField({ id: 2, fieldName: 'RevenueField', fieldType: 'number' }),
        makeField({ id: 3, fieldName: 'FoundedField', fieldType: 'date' }),
        makeField({ id: 4, fieldName: 'WebsiteField', fieldType: 'url' }),
        makeField({ id: 5, fieldName: 'ActiveField', fieldType: 'boolean' }),
      ]);

      render(<CrmCustomFieldsAdmin />);

      await waitFor(() => {
        expect(screen.getByText('NameField')).toBeInTheDocument();
        expect(screen.getByText('RevenueField')).toBeInTheDocument();
        expect(screen.getByText('FoundedField')).toBeInTheDocument();
        expect(screen.getByText('WebsiteField')).toBeInTheDocument();
        expect(screen.getByText('ActiveField')).toBeInTheDocument();
      });
    });
  });
});
