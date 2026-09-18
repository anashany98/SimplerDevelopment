// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act, cleanup } from '@testing-library/react';
import React from 'react';

// ---------------------------------------------------------------------------
// CustomFieldsManager has no external lib imports — just React hooks.
// We only need to mock global fetch and window.confirm.
// ---------------------------------------------------------------------------

import { CustomFieldsManager } from '@/components/portal/CustomFieldsManager';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeFetchOk(body: unknown) {
  return Promise.resolve({
    ok: true,
    json: () => Promise.resolve(body),
  });
}

function makeFetchFail(body: unknown) {
  return Promise.resolve({
    ok: false,
    json: () => Promise.resolve(body),
  });
}

const COLLECTION = '/api/portal/cms/sites/1/content-types/1/fields';
const ITEM = '/api/portal/cms/sites/1/content-types/1/fields';

const FIELD_TEXT = {
  id: 1,
  postTypeId: 1,
  parentId: null,
  name: 'Author',
  slug: 'author',
  fieldType: 'text',
  options: null,
  required: false,
  defaultValue: null,
  helpText: null,
  order: 0,
};

const FIELD_SELECT = {
  id: 2,
  postTypeId: 1,
  parentId: null,
  name: 'Status',
  slug: 'status',
  fieldType: 'select',
  options: ['Draft', 'Published'],
  required: true,
  defaultValue: 'Draft',
  helpText: 'Pick one',
  order: 1,
};

const FIELD_REPEATER = {
  id: 3,
  postTypeId: 1,
  parentId: null,
  name: 'Links',
  slug: 'links',
  fieldType: 'repeater',
  options: null,
  required: false,
  defaultValue: null,
  helpText: null,
  order: 2,
};

const FIELD_GROUP = {
  id: 4,
  postTypeId: 1,
  parentId: null,
  name: 'Meta',
  slug: 'meta',
  fieldType: 'group',
  options: null,
  required: false,
  defaultValue: null,
  helpText: null,
  order: 3,
};

const CHILD_FIELD = {
  id: 10,
  postTypeId: 1,
  parentId: 3,
  name: 'URL',
  slug: 'url',
  fieldType: 'url',
  options: null,
  required: false,
  defaultValue: null,
  helpText: null,
  order: 0,
};

function setupFetch(fields: unknown[] = []) {
  global.fetch = vi.fn((url: string) => {
    if (url === COLLECTION) {
      return makeFetchOk({ success: true, data: fields });
    }
    return makeFetchOk({ success: true, data: fields });
  }) as typeof global.fetch;
}

beforeEach(() => {
  vi.clearAllMocks();
  // Default: empty field list
  setupFetch([]);
  // confirm defaults to true (user accepts delete)
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Initial load
// ---------------------------------------------------------------------------

describe('CustomFieldsManager — initial load', () => {
  it('shows loading spinner while fetching', async () => {
    let resolveLoad: (v: unknown) => void;
    const pending = new Promise((res) => { resolveLoad = res; });
    global.fetch = vi.fn(() => pending) as typeof global.fetch;

    render(<CustomFieldsManager collectionEndpoint={COLLECTION} itemEndpoint={ITEM} />);

    // Spinner uses material-icon text "progress_activity"
    expect(screen.getByText('progress_activity')).toBeTruthy();

    // Resolve so component can clean up
    act(() => {
      resolveLoad!({ ok: true, json: () => Promise.resolve({ success: true, data: [] }) });
    });
  });

  it('fetches the collectionEndpoint on mount', async () => {
    render(<CustomFieldsManager collectionEndpoint={COLLECTION} itemEndpoint={ITEM} />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(COLLECTION));
  });

  it('renders empty-state message when no fields returned', async () => {
    render(<CustomFieldsManager collectionEndpoint={COLLECTION} itemEndpoint={ITEM} />);
    await waitFor(() =>
      expect(screen.getByText(/Aún no hay campos definidos para este tipo de contenido/i)).toBeTruthy(),
    );
  });

  it('renders field list when fields are returned', async () => {
    setupFetch([FIELD_TEXT]);
    render(<CustomFieldsManager collectionEndpoint={COLLECTION} itemEndpoint={ITEM} />);
    await waitFor(() => expect(screen.getByText('Author')).toBeTruthy());
    expect(screen.getByText('author')).toBeTruthy();
    expect(screen.getByText('text')).toBeTruthy();
  });

  it('handles load failure (success:false with message) without crashing', async () => {
    // NOTE: The component sets error state but only renders it inside the form.
    // resetForm() clears error when "Add Field" is clicked, so load errors are
    // never visually surfaced. We verify the component finishes loading gracefully.
    global.fetch = vi.fn(() =>
      makeFetchOk({ success: false, message: 'Forbidden' }),
    ) as typeof global.fetch;

    render(<CustomFieldsManager collectionEndpoint={COLLECTION} itemEndpoint={ITEM} />);
    await waitFor(() =>
      expect(screen.getByText(/Aún no hay campos definidos para este tipo de contenido/i)).toBeTruthy(),
    );
    // Loading spinner is gone — component handled the error without crashing
    expect(screen.queryByText('progress_activity')).toBeNull();
  });

  it('handles load failure (success:false with no message) without crashing', async () => {
    global.fetch = vi.fn(() =>
      makeFetchOk({ success: false }),
    ) as typeof global.fetch;

    render(<CustomFieldsManager collectionEndpoint={COLLECTION} itemEndpoint={ITEM} />);
    await waitFor(() =>
      expect(screen.getByText(/Aún no hay campos definidos para este tipo de contenido/i)).toBeTruthy(),
    );
    expect(screen.queryByText('progress_activity')).toBeNull();
  });

  it('handles network error during load without crashing', async () => {
    global.fetch = vi.fn(() => Promise.reject(new Error('Network down'))) as typeof global.fetch;

    render(<CustomFieldsManager collectionEndpoint={COLLECTION} itemEndpoint={ITEM} />);
    await waitFor(() =>
      expect(screen.getByText(/Aún no hay campos definidos para este tipo de contenido/i)).toBeTruthy(),
    );
    expect(screen.queryByText('progress_activity')).toBeNull();
  });

  it('handles non-Error thrown value during load without crashing', async () => {
    global.fetch = vi.fn(() => Promise.reject('boom')) as typeof global.fetch;

    render(<CustomFieldsManager collectionEndpoint={COLLECTION} itemEndpoint={ITEM} />);
    await waitFor(() =>
      expect(screen.getByText(/Aún no hay campos definidos para este tipo de contenido/i)).toBeTruthy(),
    );
    expect(screen.queryByText('progress_activity')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Add Field form
// ---------------------------------------------------------------------------

describe('CustomFieldsManager — Add Field form', () => {
  it('shows "Add Field" button when form is hidden', async () => {
    render(<CustomFieldsManager collectionEndpoint={COLLECTION} itemEndpoint={ITEM} />);
    await waitFor(() => expect(screen.getByText('Añadir campo')).toBeTruthy());
  });

  it('opens form when "Add Field" button is clicked', async () => {
    render(<CustomFieldsManager collectionEndpoint={COLLECTION} itemEndpoint={ITEM} />);
    await waitFor(() => screen.getByText('Añadir campo'));
    fireEvent.click(screen.getByText('Añadir campo'));
    expect(screen.getByText('Nuevo campo')).toBeTruthy();
  });

  it('auto-generates slug from name in add mode', async () => {
    render(<CustomFieldsManager collectionEndpoint={COLLECTION} itemEndpoint={ITEM} />);
    await waitFor(() => screen.getByText('Añadir campo'));
    fireEvent.click(screen.getByText('Añadir campo'));

    const nameInput = screen.getByPlaceholderText('p. ej. Nombre del autor');
    fireEvent.change(nameInput, { target: { value: 'My Field Name!' } });

    const slugInput = screen.getByPlaceholderText('author_name');
    expect((slugInput as HTMLInputElement).value).toBe('my_field_name');
  });

  it('allows manual slug override', async () => {
    render(<CustomFieldsManager collectionEndpoint={COLLECTION} itemEndpoint={ITEM} />);
    await waitFor(() => screen.getByText('Añadir campo'));
    fireEvent.click(screen.getByText('Añadir campo'));

    const slugInput = screen.getByPlaceholderText('author_name');
    fireEvent.change(slugInput, { target: { value: 'custom_slug' } });
    expect((slugInput as HTMLInputElement).value).toBe('custom_slug');
  });

  it('shows Options textarea only when fieldType is select', async () => {
    render(<CustomFieldsManager collectionEndpoint={COLLECTION} itemEndpoint={ITEM} />);
    await waitFor(() => screen.getByText('Añadir campo'));
    fireEvent.click(screen.getByText('Añadir campo'));

    // Not visible with default 'text' type
    expect(screen.queryByText('Opciones (una por línea)')).toBeNull();

    // Change to 'select'
    const typeSelect = screen.getByRole('combobox');
    fireEvent.change(typeSelect, { target: { value: 'select' } });

    expect(screen.getByText('Opciones (una por línea)')).toBeTruthy();
  });

  it('hides Options textarea when fieldType changes away from select', async () => {
    render(<CustomFieldsManager collectionEndpoint={COLLECTION} itemEndpoint={ITEM} />);
    await waitFor(() => screen.getByText('Añadir campo'));
    fireEvent.click(screen.getByText('Añadir campo'));

    const typeSelect = screen.getByRole('combobox');
    fireEvent.change(typeSelect, { target: { value: 'select' } });
    expect(screen.getByText('Opciones (una por línea)')).toBeTruthy();

    fireEvent.change(typeSelect, { target: { value: 'text' } });
    expect(screen.queryByText('Opciones (una por línea)')).toBeNull();
  });

  it('cancels form and returns to list view', async () => {
    render(<CustomFieldsManager collectionEndpoint={COLLECTION} itemEndpoint={ITEM} />);
    await waitFor(() => screen.getByText('Añadir campo'));
    fireEvent.click(screen.getByText('Añadir campo'));
    expect(screen.getByText('Nuevo campo')).toBeTruthy();

    fireEvent.click(screen.getByText('Cancelar'));
    await waitFor(() => expect(screen.queryByText('Nuevo campo')).toBeNull());
    expect(screen.getByText('Añadir campo')).toBeTruthy();
  });

  it('toggles the Required checkbox', async () => {
    render(<CustomFieldsManager collectionEndpoint={COLLECTION} itemEndpoint={ITEM} />);
    await waitFor(() => screen.getByText('Añadir campo'));
    fireEvent.click(screen.getByText('Añadir campo'));

    const checkbox = screen.getByRole('checkbox');
    expect((checkbox as HTMLInputElement).checked).toBe(false);
    fireEvent.click(checkbox);
    expect((checkbox as HTMLInputElement).checked).toBe(true);
  });

  it('submits POST to collectionEndpoint and refetches on success', async () => {
    let callCount = 0;
    global.fetch = vi.fn((url: string, init?: RequestInit) => {
      if (!init || init.method !== 'POST') {
        callCount++;
        return makeFetchOk({ success: true, data: callCount === 1 ? [] : [FIELD_TEXT] });
      }
      return makeFetchOk({ success: true });
    }) as typeof global.fetch;

    render(<CustomFieldsManager collectionEndpoint={COLLECTION} itemEndpoint={ITEM} />);
    await waitFor(() => screen.getByText('Añadir campo'));
    fireEvent.click(screen.getByText('Añadir campo'));

    fireEvent.change(screen.getByPlaceholderText('p. ej. Nombre del autor'), {
      target: { value: 'Author' },
    });

    await act(async () => {
      fireEvent.submit(document.querySelector('form')!);
    });

    await waitFor(() => {
      const postCall = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.find(
        (c: unknown[]) => (c[1] as RequestInit | undefined)?.method === 'POST',
      );
      expect(postCall).toBeTruthy();
    });
  });

  it('calls onChanged after successful add', async () => {
    const onChanged = vi.fn();
    global.fetch = vi.fn((url: string, init?: RequestInit) => {
      if (init?.method === 'POST') return makeFetchOk({ success: true });
      return makeFetchOk({ success: true, data: [FIELD_TEXT] });
    }) as typeof global.fetch;

    render(
      <CustomFieldsManager
        collectionEndpoint={COLLECTION}
        itemEndpoint={ITEM}
        onChanged={onChanged}
      />,
    );
    await waitFor(() => screen.getByText('Añadir campo'));
    fireEvent.click(screen.getByText('Añadir campo'));
    fireEvent.change(screen.getByPlaceholderText('p. ej. Nombre del autor'), {
      target: { value: 'Author' },
    });

    await act(async () => {
      fireEvent.submit(document.querySelector('form')!);
    });

    await waitFor(() => expect(onChanged).toHaveBeenCalled());
  });

  it('shows error message from server on failed add', async () => {
    global.fetch = vi.fn((url: string, init?: RequestInit) => {
      if (init?.method === 'POST')
        return makeFetchFail({ message: 'Slug already taken' });
      return makeFetchOk({ success: true, data: [] });
    }) as typeof global.fetch;

    render(<CustomFieldsManager collectionEndpoint={COLLECTION} itemEndpoint={ITEM} />);
    await waitFor(() => screen.getByText('Añadir campo'));
    fireEvent.click(screen.getByText('Añadir campo'));
    fireEvent.change(screen.getByPlaceholderText('p. ej. Nombre del autor'), {
      target: { value: 'Author' },
    });

    await act(async () => {
      fireEvent.submit(document.querySelector('form')!);
    });

    await waitFor(() => expect(screen.getByText('Slug already taken')).toBeTruthy());
  });

  it('shows fallback "Failed to save custom field" when server returns no message', async () => {
    global.fetch = vi.fn((url: string, init?: RequestInit) => {
      if (init?.method === 'POST') return makeFetchFail({});
      return makeFetchOk({ success: true, data: [] });
    }) as typeof global.fetch;

    render(<CustomFieldsManager collectionEndpoint={COLLECTION} itemEndpoint={ITEM} />);
    await waitFor(() => screen.getByText('Añadir campo'));
    fireEvent.click(screen.getByText('Añadir campo'));
    fireEvent.change(screen.getByPlaceholderText('p. ej. Nombre del autor'), {
      target: { value: 'Author' },
    });

    await act(async () => {
      fireEvent.submit(document.querySelector('form')!);
    });

    await waitFor(() =>
      expect(screen.getByText('No se pudo guardar el campo personalizado')).toBeTruthy(),
    );
  });

  it('shows "Network error" when fetch throws during submit', async () => {
    global.fetch = vi.fn((url: string, init?: RequestInit) => {
      if (init?.method === 'POST') return Promise.reject(new Error('timeout'));
      return makeFetchOk({ success: true, data: [] });
    }) as typeof global.fetch;

    render(<CustomFieldsManager collectionEndpoint={COLLECTION} itemEndpoint={ITEM} />);
    await waitFor(() => screen.getByText('Añadir campo'));
    fireEvent.click(screen.getByText('Añadir campo'));
    fireEvent.change(screen.getByPlaceholderText('p. ej. Nombre del autor'), {
      target: { value: 'Author' },
    });

    await act(async () => {
      fireEvent.submit(document.querySelector('form')!);
    });

    await waitFor(() => expect(screen.getByText('Error de red')).toBeTruthy());
  });

  it('submits select field with parsed options', async () => {
    let capturedBody: Record<string, unknown> | null = null;
    global.fetch = vi.fn((url: string, init?: RequestInit) => {
      if (init?.method === 'POST') {
        capturedBody = JSON.parse(init.body as string) as Record<string, unknown>;
        return makeFetchOk({ success: true });
      }
      return makeFetchOk({ success: true, data: [] });
    }) as typeof global.fetch;

    render(<CustomFieldsManager collectionEndpoint={COLLECTION} itemEndpoint={ITEM} />);
    await waitFor(() => screen.getByText('Añadir campo'));
    fireEvent.click(screen.getByText('Añadir campo'));

    fireEvent.change(screen.getByPlaceholderText('p. ej. Nombre del autor'), {
      target: { value: 'Status' },
    });

    const typeSelect = screen.getByRole('combobox');
    fireEvent.change(typeSelect, { target: { value: 'select' } });

    fireEvent.change(screen.getByPlaceholderText(/Opción 1/), {
      target: { value: 'Draft\nPublished\n' },
    });

    await act(async () => {
      fireEvent.submit(document.querySelector('form')!);
    });

    await waitFor(() => {
      expect(capturedBody).not.toBeNull();
      expect(capturedBody!.options).toEqual(['Draft', 'Published']);
    });
  });

  it('submits null options for non-select field types', async () => {
    let capturedBody: Record<string, unknown> | null = null;
    global.fetch = vi.fn((url: string, init?: RequestInit) => {
      if (init?.method === 'POST') {
        capturedBody = JSON.parse(init.body as string) as Record<string, unknown>;
        return makeFetchOk({ success: true });
      }
      return makeFetchOk({ success: true, data: [] });
    }) as typeof global.fetch;

    render(<CustomFieldsManager collectionEndpoint={COLLECTION} itemEndpoint={ITEM} />);
    await waitFor(() => screen.getByText('Añadir campo'));
    fireEvent.click(screen.getByText('Añadir campo'));

    fireEvent.change(screen.getByPlaceholderText('p. ej. Nombre del autor'), {
      target: { value: 'Author' },
    });

    await act(async () => {
      fireEvent.submit(document.querySelector('form')!);
    });

    await waitFor(() => {
      expect(capturedBody).not.toBeNull();
      expect(capturedBody!.options).toBeNull();
    });
  });

  it('shows "Saving…" label while submit is in-flight', async () => {
    let resolvePost: (v: unknown) => void;
    const pending = new Promise((res) => { resolvePost = res; });

    global.fetch = vi.fn((url: string, init?: RequestInit) => {
      if (init?.method === 'POST') return pending;
      return makeFetchOk({ success: true, data: [] });
    }) as typeof global.fetch;

    render(<CustomFieldsManager collectionEndpoint={COLLECTION} itemEndpoint={ITEM} />);
    await waitFor(() => screen.getByText('Añadir campo'));
    fireEvent.click(screen.getByText('Añadir campo'));
    fireEvent.change(screen.getByPlaceholderText('p. ej. Nombre del autor'), {
      target: { value: 'Author' },
    });

    act(() => { fireEvent.submit(document.querySelector('form')!); });

    await waitFor(() => expect(screen.getByText('Guardando…')).toBeTruthy());

    act(() => {
      resolvePost!({ ok: true, json: () => Promise.resolve({ success: true }) });
    });
  });
});

// ---------------------------------------------------------------------------
// Edit Field form
// ---------------------------------------------------------------------------

describe('CustomFieldsManager — Edit Field form', () => {
  it('opens edit form with field values pre-populated', async () => {
    setupFetch([FIELD_TEXT]);
    render(<CustomFieldsManager collectionEndpoint={COLLECTION} itemEndpoint={ITEM} />);
    await waitFor(() => screen.getByText('Author'));

    const editBtn = screen.getByTitle('Editar');
    fireEvent.click(editBtn);

    expect(screen.getByText('Editar campo')).toBeTruthy();
    expect((screen.getByPlaceholderText('p. ej. Nombre del autor') as HTMLInputElement).value).toBe('Author');
    expect((screen.getByPlaceholderText('author_name') as HTMLInputElement).value).toBe('author');
  });

  it('does not auto-generate slug when editing', async () => {
    setupFetch([FIELD_TEXT]);
    render(<CustomFieldsManager collectionEndpoint={COLLECTION} itemEndpoint={ITEM} />);
    await waitFor(() => screen.getByText('Author'));

    fireEvent.click(screen.getByTitle('Editar'));
    await waitFor(() => screen.getByText('Editar campo'));

    const nameInput = screen.getByPlaceholderText('p. ej. Nombre del autor');
    const slugInput = screen.getByPlaceholderText('author_name');
    fireEvent.change(nameInput, { target: { value: 'New Name Here' } });

    // Slug should NOT be regenerated in edit mode
    expect((slugInput as HTMLInputElement).value).toBe('author');
  });

  it('pre-populates options text for select fields', async () => {
    setupFetch([FIELD_SELECT]);
    render(<CustomFieldsManager collectionEndpoint={COLLECTION} itemEndpoint={ITEM} />);
    await waitFor(() => screen.getByText('Status'));

    fireEvent.click(screen.getByTitle('Editar'));
    await waitFor(() => screen.getByText('Editar campo'));

    // The <label> has no htmlFor, so query by placeholder text
    const optionsTextarea = screen.getByPlaceholderText(/Opción 1/);
    expect((optionsTextarea as HTMLTextAreaElement).value).toBe('Draft\nPublished');
  });

  it('submits PUT to itemEndpoint/<id> on update', async () => {
    setupFetch([FIELD_TEXT]);
    let putUrl: string | null = null;
    global.fetch = vi.fn((url: string, init?: RequestInit) => {
      if (init?.method === 'PUT') {
        putUrl = url;
        return makeFetchOk({ success: true });
      }
      return makeFetchOk({ success: true, data: [FIELD_TEXT] });
    }) as typeof global.fetch;

    render(<CustomFieldsManager collectionEndpoint={COLLECTION} itemEndpoint={ITEM} />);
    await waitFor(() => screen.getByText('Author'));

    fireEvent.click(screen.getByTitle('Editar'));
    await waitFor(() => screen.getByText('Editar campo'));

    await act(async () => {
      fireEvent.submit(document.querySelector('form')!);
    });

    await waitFor(() => {
      expect(putUrl).toBe(`${ITEM}/${FIELD_TEXT.id}`);
    });
  });

  it('shows "Update Field" submit label in edit mode', async () => {
    setupFetch([FIELD_TEXT]);
    render(<CustomFieldsManager collectionEndpoint={COLLECTION} itemEndpoint={ITEM} />);
    await waitFor(() => screen.getByText('Author'));

    fireEvent.click(screen.getByTitle('Editar'));
    await waitFor(() => expect(screen.getByText('Actualizar campo')).toBeTruthy());
  });

  it('calls onChanged after successful update', async () => {
    const onChanged = vi.fn();
    setupFetch([FIELD_TEXT]);
    global.fetch = vi.fn((url: string, init?: RequestInit) => {
      if (init?.method === 'PUT') return makeFetchOk({ success: true });
      return makeFetchOk({ success: true, data: [FIELD_TEXT] });
    }) as typeof global.fetch;

    render(
      <CustomFieldsManager
        collectionEndpoint={COLLECTION}
        itemEndpoint={ITEM}
        onChanged={onChanged}
      />,
    );
    await waitFor(() => screen.getByText('Author'));

    fireEvent.click(screen.getByTitle('Editar'));
    await waitFor(() => screen.getByText('Editar campo'));

    await act(async () => {
      fireEvent.submit(document.querySelector('form')!);
    });

    await waitFor(() => expect(onChanged).toHaveBeenCalled());
  });
});

// ---------------------------------------------------------------------------
// Delete
// ---------------------------------------------------------------------------

describe('CustomFieldsManager — Delete', () => {
  it('calls confirm before deleting', async () => {
    setupFetch([FIELD_TEXT]);
    render(<CustomFieldsManager collectionEndpoint={COLLECTION} itemEndpoint={ITEM} />);
    await waitFor(() => screen.getByText('Author'));

    fireEvent.click(screen.getByTitle('Eliminar'));
    expect(window.confirm).toHaveBeenCalledWith(
      '¿Eliminar este campo personalizado? Se perderán todos los valores guardados.',
    );
  });

  it('sends DELETE to itemEndpoint/<id> when user confirms', async () => {
    setupFetch([FIELD_TEXT]);
    let deleteUrl: string | null = null;
    global.fetch = vi.fn((url: string, init?: RequestInit) => {
      if (init?.method === 'DELETE') {
        deleteUrl = url;
        return makeFetchOk({ ok: true });
      }
      return makeFetchOk({ success: true, data: [FIELD_TEXT] });
    }) as typeof global.fetch;

    render(<CustomFieldsManager collectionEndpoint={COLLECTION} itemEndpoint={ITEM} />);
    await waitFor(() => screen.getByText('Author'));

    fireEvent.click(screen.getByTitle('Eliminar'));

    await waitFor(() => {
      expect(deleteUrl).toBe(`${ITEM}/${FIELD_TEXT.id}`);
    });
  });

  it('calls onChanged after successful delete', async () => {
    const onChanged = vi.fn();
    global.fetch = vi.fn((url: string, init?: RequestInit) => {
      if (init?.method === 'DELETE') return makeFetchOk({ ok: true });
      // All GETs (initial load + refetch after delete) return FIELD_TEXT
      return makeFetchOk({ success: true, data: [FIELD_TEXT] });
    }) as typeof global.fetch;

    render(
      <CustomFieldsManager
        collectionEndpoint={COLLECTION}
        itemEndpoint={ITEM}
        onChanged={onChanged}
      />,
    );
    await waitFor(() => screen.getByText('Author'));
    fireEvent.click(screen.getByTitle('Eliminar'));

    await waitFor(() => expect(onChanged).toHaveBeenCalled());
  });

  it('does not send DELETE when user cancels confirm', async () => {
    (window.confirm as ReturnType<typeof vi.spyOn>).mockReturnValue(false);
    setupFetch([FIELD_TEXT]);

    render(<CustomFieldsManager collectionEndpoint={COLLECTION} itemEndpoint={ITEM} />);
    await waitFor(() => screen.getByText('Author'));

    const callsBefore = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.length;
    fireEvent.click(screen.getByTitle('Eliminar'));

    // No additional fetch call after the initial load
    expect((global.fetch as ReturnType<typeof vi.fn>).mock.calls.length).toBe(callsBefore);
  });
});

// ---------------------------------------------------------------------------
// Field type display: repeater/group containers
// ---------------------------------------------------------------------------

describe('CustomFieldsManager — container field types (repeater/group)', () => {
  it('renders repeater field with expand toggle', async () => {
    setupFetch([FIELD_REPEATER]);
    render(<CustomFieldsManager collectionEndpoint={COLLECTION} itemEndpoint={ITEM} />);
    await waitFor(() => screen.getByText('Links'));

    // Container fields show expand icon instead of order number
    expect(screen.getByText('chevron_right')).toBeTruthy();
  });

  it('toggles expand/collapse for repeater on click', async () => {
    setupFetch([FIELD_REPEATER, CHILD_FIELD]);
    render(<CustomFieldsManager collectionEndpoint={COLLECTION} itemEndpoint={ITEM} />);
    await waitFor(() => screen.getByText('Links'));

    const toggle = screen.getByText('chevron_right');
    fireEvent.click(toggle);
    expect(screen.getByText('expand_more')).toBeTruthy();

    fireEvent.click(screen.getByText('expand_more'));
    expect(screen.getByText('chevron_right')).toBeTruthy();
  });

  it('renders sub-fields when container is expanded', async () => {
    setupFetch([FIELD_REPEATER, CHILD_FIELD]);
    render(<CustomFieldsManager collectionEndpoint={COLLECTION} itemEndpoint={ITEM} />);
    await waitFor(() => screen.getByText('Links'));

    // Expand the repeater
    fireEvent.click(screen.getByText('chevron_right'));
    await waitFor(() => expect(screen.getByText('URL')).toBeTruthy());
  });

  it('shows sub-field count badge ("1 sub-field")', async () => {
    setupFetch([FIELD_REPEATER, CHILD_FIELD]);
    render(<CustomFieldsManager collectionEndpoint={COLLECTION} itemEndpoint={ITEM} />);
    await waitFor(() => screen.getByText('1 subcampo'));
  });

  it('shows plural sub-fields badge for multiple children', async () => {
    const child2 = { ...CHILD_FIELD, id: 11, name: 'Label', slug: 'label' };
    setupFetch([FIELD_REPEATER, CHILD_FIELD, child2]);
    render(<CustomFieldsManager collectionEndpoint={COLLECTION} itemEndpoint={ITEM} />);
    await waitFor(() => expect(screen.getByText('2 subcampos')).toBeTruthy());
  });

  it('renders group field with folder icon', async () => {
    setupFetch([FIELD_GROUP]);
    render(<CustomFieldsManager collectionEndpoint={COLLECTION} itemEndpoint={ITEM} />);
    await waitFor(() => screen.getByText('Meta'));
    expect(screen.getByText('folder')).toBeTruthy();
  });

  it('opens add-sub-field form when "Add sub-field" is clicked', async () => {
    setupFetch([FIELD_REPEATER]);
    render(<CustomFieldsManager collectionEndpoint={COLLECTION} itemEndpoint={ITEM} />);
    await waitFor(() => screen.getByText('Links'));

    // Click the "add" button on the repeater row (title="Add sub-field")
    fireEvent.click(screen.getByTitle('Añadir subcampo'));
    await waitFor(() => expect(screen.getByText('Nuevo subcampo')).toBeTruthy());
  });

  it('filters out repeater/group from fieldType options when adding a sub-field', async () => {
    setupFetch([FIELD_REPEATER]);
    render(<CustomFieldsManager collectionEndpoint={COLLECTION} itemEndpoint={ITEM} />);
    await waitFor(() => screen.getByText('Links'));

    fireEvent.click(screen.getByTitle('Añadir subcampo'));
    await waitFor(() => screen.getByText('Nuevo subcampo'));

    const typeSelect = screen.getByRole('combobox') as HTMLSelectElement;
    const optionValues = Array.from(typeSelect.options).map((o) => o.value);
    expect(optionValues).not.toContain('repeater');
    expect(optionValues).not.toContain('group');
    expect(optionValues).toContain('text');
  });

  it('edits a child field via the child row Edit button', async () => {
    setupFetch([FIELD_REPEATER, CHILD_FIELD]);
    render(<CustomFieldsManager collectionEndpoint={COLLECTION} itemEndpoint={ITEM} />);
    await waitFor(() => screen.getByText('Links'));

    // Expand to reveal child
    fireEvent.click(screen.getByText('chevron_right'));
    await waitFor(() => screen.getByText('URL'));

    const editBtns = screen.getAllByTitle('Editar');
    fireEvent.click(editBtns[editBtns.length - 1]); // child's edit

    await waitFor(() => expect(screen.getByText('Editar campo')).toBeTruthy());
    expect((screen.getByPlaceholderText('author_name') as HTMLInputElement).value).toBe('url');
  });

  it('deletes a child field via the child row Delete button', async () => {
    setupFetch([FIELD_REPEATER, CHILD_FIELD]);
    let deleteUrl: string | null = null;
    global.fetch = vi.fn((url: string, init?: RequestInit) => {
      if (init?.method === 'DELETE') {
        deleteUrl = url;
        return makeFetchOk({ ok: true });
      }
      return makeFetchOk({ success: true, data: [FIELD_REPEATER, CHILD_FIELD] });
    }) as typeof global.fetch;

    render(<CustomFieldsManager collectionEndpoint={COLLECTION} itemEndpoint={ITEM} />);
    await waitFor(() => screen.getByText('Links'));

    // Expand to reveal child
    fireEvent.click(screen.getByText('chevron_right'));
    await waitFor(() => screen.getByText('URL'));

    const deleteBtns = screen.getAllByTitle('Eliminar');
    fireEvent.click(deleteBtns[deleteBtns.length - 1]); // child's delete

    await waitFor(() => {
      expect(deleteUrl).toBe(`${ITEM}/${CHILD_FIELD.id}`);
    });
  });
});

// ---------------------------------------------------------------------------
// Field display — required marker and fieldType icons
// ---------------------------------------------------------------------------

describe('CustomFieldsManager — field display details', () => {
  it('renders required asterisk for required fields', async () => {
    setupFetch([FIELD_SELECT]);
    render(<CustomFieldsManager collectionEndpoint={COLLECTION} itemEndpoint={ITEM} />);
    await waitFor(() => screen.getByText('Status'));
    // Required fields show a red asterisk
    expect(screen.getByText('*')).toBeTruthy();
  });

  it('does not render required asterisk for non-required fields', async () => {
    setupFetch([FIELD_TEXT]);
    render(<CustomFieldsManager collectionEndpoint={COLLECTION} itemEndpoint={ITEM} />);
    await waitFor(() => screen.getByText('Author'));
    expect(screen.queryByText('*')).toBeNull();
  });

  it('renders repeat icon for repeater field type', async () => {
    setupFetch([FIELD_REPEATER]);
    render(<CustomFieldsManager collectionEndpoint={COLLECTION} itemEndpoint={ITEM} />);
    await waitFor(() => screen.getByText('Links'));
    expect(screen.getByText('repeat')).toBeTruthy();
  });

  it('renders input icon for text field type', async () => {
    setupFetch([FIELD_TEXT]);
    render(<CustomFieldsManager collectionEndpoint={COLLECTION} itemEndpoint={ITEM} />);
    await waitFor(() => screen.getByText('Author'));
    expect(screen.getByText('input')).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Form field: Default Value, Help Text, Order inputs
// ---------------------------------------------------------------------------

describe('CustomFieldsManager — form supplementary fields', () => {
  it('populates defaultValue and helpText inputs in edit mode', async () => {
    setupFetch([FIELD_SELECT]);
    render(<CustomFieldsManager collectionEndpoint={COLLECTION} itemEndpoint={ITEM} />);
    await waitFor(() => screen.getByText('Status'));

    fireEvent.click(screen.getByTitle('Editar'));
    await waitFor(() => screen.getByText('Editar campo'));

    const defaultInput = screen.getByDisplayValue('Draft');
    expect(defaultInput).toBeTruthy();

    const helpInput = screen.getByDisplayValue('Pick one');
    expect(helpInput).toBeTruthy();
  });

  it('allows updating the Order number input', async () => {
    render(<CustomFieldsManager collectionEndpoint={COLLECTION} itemEndpoint={ITEM} />);
    await waitFor(() => screen.getByText('Añadir campo'));
    fireEvent.click(screen.getByText('Añadir campo'));

    const orderInput = screen.getByDisplayValue('0') as HTMLInputElement;
    fireEvent.change(orderInput, { target: { value: '5' } });
    expect(orderInput.value).toBe('5');
  });

  it('falls back to 0 for non-numeric order input', async () => {
    render(<CustomFieldsManager collectionEndpoint={COLLECTION} itemEndpoint={ITEM} />);
    await waitFor(() => screen.getByText('Añadir campo'));
    fireEvent.click(screen.getByText('Añadir campo'));

    const orderInput = screen.getByDisplayValue('0') as HTMLInputElement;
    fireEvent.change(orderInput, { target: { value: 'abc' } });
    expect(orderInput.value).toBe('0');
  });

  it('sends null defaultValue when field is empty', async () => {
    let capturedBody: Record<string, unknown> | null = null;
    global.fetch = vi.fn((url: string, init?: RequestInit) => {
      if (init?.method === 'POST') {
        capturedBody = JSON.parse(init.body as string) as Record<string, unknown>;
        return makeFetchOk({ success: true });
      }
      return makeFetchOk({ success: true, data: [] });
    }) as typeof global.fetch;

    render(<CustomFieldsManager collectionEndpoint={COLLECTION} itemEndpoint={ITEM} />);
    await waitFor(() => screen.getByText('Añadir campo'));
    fireEvent.click(screen.getByText('Añadir campo'));

    fireEvent.change(screen.getByPlaceholderText('p. ej. Nombre del autor'), {
      target: { value: 'Author' },
    });
    // Leave defaultValue blank

    await act(async () => {
      fireEvent.submit(document.querySelector('form')!);
    });

    await waitFor(() => {
      expect(capturedBody!.defaultValue).toBeNull();
    });
  });

  it('sends null helpText when field is empty', async () => {
    let capturedBody: Record<string, unknown> | null = null;
    global.fetch = vi.fn((url: string, init?: RequestInit) => {
      if (init?.method === 'POST') {
        capturedBody = JSON.parse(init.body as string) as Record<string, unknown>;
        return makeFetchOk({ success: true });
      }
      return makeFetchOk({ success: true, data: [] });
    }) as typeof global.fetch;

    render(<CustomFieldsManager collectionEndpoint={COLLECTION} itemEndpoint={ITEM} />);
    await waitFor(() => screen.getByText('Añadir campo'));
    fireEvent.click(screen.getByText('Añadir campo'));

    fireEvent.change(screen.getByPlaceholderText('p. ej. Nombre del autor'), {
      target: { value: 'Author' },
    });

    await act(async () => {
      fireEvent.submit(document.querySelector('form')!);
    });

    await waitFor(() => {
      expect(capturedBody!.helpText).toBeNull();
    });
  });
});
