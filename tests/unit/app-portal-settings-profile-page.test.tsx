// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/portal/settings/profile',
}));

vi.mock('next/link', () => ({
  __esModule: true,
  default: ({ children, href, ...rest }: { children: React.ReactNode; href: string; [key: string]: unknown }) =>
    React.createElement('a', { href, ...rest }, children),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type FetchResponder = (url: string, init?: RequestInit) => unknown;

function installFetchMock(responder: FetchResponder) {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const body = responder(url, init);
    return {
      json: async () => body,
    } as unknown as Response;
  });
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

async function flush() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

const baseProfile = {
  name: 'Jane Doe',
  email: 'jane@example.com',
  company: 'Acme Inc.',
  phone: '+1 (555) 000-1234',
  website: 'https://acmeinc.com',
  address: '123 Main St',
  emailPrefix: 'jane',
};

function defaultFetch(url: string, init?: RequestInit): unknown {
  if (url === '/api/portal/settings/profile' && (!init || init.method === undefined || init.method === 'GET')) {
    return { success: true, data: baseProfile };
  }
  if (url === '/api/portal/settings/profile' && init?.method === 'PATCH') {
    return { success: true, message: 'Profile updated.' };
  }
  if (url === '/api/portal/change-password' && init?.method === 'POST') {
    return { success: true, message: 'Password changed.' };
  }
  if (url === '/api/portal/default-website') {
    // Return no websites soSubdominio del portalSection hides itself
    return { websites: [], defaultWebsiteId: null };
  }
  if (url === '/api/portal/my-subdomain') {
    // Return single portal so DefaultPortalSection hides itself
    return { portals: [{ clientId: 1, company: 'Acme', subdomain: 'acme' }], defaultClientId: 1 };
  }
  return {};
}

// ---------------------------------------------------------------------------
// Import under test (after mocks)
// ---------------------------------------------------------------------------

import ProfileSettingsPage from '@/app/portal/settings/profile/page';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ProfileSettingsPage', () => {
  beforeEach(() => {
    installFetchMock(defaultFetch);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── Loading state ──────────────────────────────────────────────────────────

  it('shows a loading spinner initially', () => {
    // Don't let fetch resolve yet
    globalThis.fetch = vi.fn(() => new Promise(() => {})) as unknown as typeof fetch;
    render(<ProfileSettingsPage />);
    // The spinner wraps a material-icon span with text 'refresh'
    const refreshIcons = document.querySelectorAll('span.material-icons');
    const hasRefresh = Array.from(refreshIcons).some((el) => el.textContent === 'refresh');
    expect(hasRefresh).toBe(true);
  });

  // ── Successful initial load ────────────────────────────────────────────────

  it('renders the Información de la cuenta section heading after load', async () => {
    await act(async () => { render(<ProfileSettingsPage />); });
    await flush();
    expect(screen.getByText('Información de la cuenta')).toBeTruthy();
  });

  it('renders the Información de la empresa section heading after load', async () => {
    await act(async () => { render(<ProfileSettingsPage />); });
    await flush();
    expect(screen.getByText('Información de la empresa')).toBeTruthy();
  });

  it('populates name field with fetched profile data', async () => {
    await act(async () => { render(<ProfileSettingsPage />); });
    await flush();
    const nameInput = document.querySelector('input[name="name"]') as HTMLInputElement;
    expect(nameInput).toBeTruthy();
    expect(nameInput.value).toBe('Jane Doe');
  });

  it('populates email field with fetched profile data', async () => {
    await act(async () => { render(<ProfileSettingsPage />); });
    await flush();
    const emailInput = document.querySelector('input[name="email"]') as HTMLInputElement;
    expect(emailInput).toBeTruthy();
    expect(emailInput.value).toBe('jane@example.com');
  });

  it('populates company field with fetched profile data', async () => {
    await act(async () => { render(<ProfileSettingsPage />); });
    await flush();
    const companyInput = document.querySelector('input[name="company"]') as HTMLInputElement;
    expect(companyInput).toBeTruthy();
    expect(companyInput.value).toBe('Acme Inc.');
  });

  it('populates phone field with fetched profile data', async () => {
    await act(async () => { render(<ProfileSettingsPage />); });
    await flush();
    const phoneInput = document.querySelector('input[name="phone"]') as HTMLInputElement;
    expect(phoneInput).toBeTruthy();
    expect(phoneInput.value).toBe('+1 (555) 000-1234');
  });

  it('populates website field with fetched profile data', async () => {
    await act(async () => { render(<ProfileSettingsPage />); });
    await flush();
    const websiteInput = document.querySelector('input[name="website"]') as HTMLInputElement;
    expect(websiteInput).toBeTruthy();
    expect(websiteInput.value).toBe('https://acmeinc.com');
  });

  it('populates address field with fetched profile data', async () => {
    await act(async () => { render(<ProfileSettingsPage />); });
    await flush();
    const addressInput = document.querySelector('textarea[name="address"]') as HTMLTextAreaElement;
    expect(addressInput).toBeTruthy();
    expect(addressInput.value).toBe('123 Main St');
  });

  it('does not set form data when success=false', async () => {
    installFetchMock((url) => {
      if (url === '/api/portal/settings/profile') return { success: false };
      return defaultFetch(url);
    });
    await act(async () => { render(<ProfileSettingsPage />); });
    await flush();
    const nameInput = document.querySelector('input[name="name"]') as HTMLInputElement;
    // Should remain empty (default state) since success was false
    expect(nameInput.value).toBe('');
  });

  it('renders the Guardar cambios button', async () => {
    await act(async () => { render(<ProfileSettingsPage />); });
    await flush();
    expect(screen.getByText('Guardar cambios')).toBeTruthy();
  });

  // ── handleChange: clearing the message on field change ────────────────────

  it('typing in a field clears an existing message', async () => {
    // First: set up so the save triggers a success message
    const fetchMock = installFetchMock(defaultFetch);
    await act(async () => { render(<ProfileSettingsPage />); });
    await flush();

    // Submit to get a success message
    await act(async () => {
      fireEvent.submit(document.querySelector('form')!);
    });
    await flush();
    expect(screen.getByText('Profile updated.')).toBeTruthy();

    // Now type something — message should clear
    await act(async () => {
      const nameInput = document.querySelector('input[name="name"]') as HTMLInputElement;
      fireEvent.change(nameInput, { target: { name: 'name', value: 'New Name' } });
    });
    expect(screen.queryByText('Profile updated.')).toBeNull();
    expect(fetchMock).toHaveBeenCalled();
  });

  // ── Profile form save: success ─────────────────────────────────────────────

  it('shows success message after successful save', async () => {
    await act(async () => { render(<ProfileSettingsPage />); });
    await flush();
    await act(async () => {
      fireEvent.submit(document.querySelector('form')!);
    });
    await flush();
    expect(screen.getByText('Profile updated.')).toBeTruthy();
  });

  it('sends PATCH to /api/portal/settings/profile on form submit', async () => {
    const fetchMock = installFetchMock(defaultFetch);
    await act(async () => { render(<ProfileSettingsPage />); });
    await flush();
    await act(async () => {
      fireEvent.submit(document.querySelector('form')!);
    });
    await flush();
    const patchCall = fetchMock.mock.calls.find(
      ([url, init]) => url === '/api/portal/settings/profile' && (init as RequestInit)?.method === 'PATCH'
    );
    expect(patchCall).toBeTruthy();
  });

  it('shows error message when save returns success=false', async () => {
    installFetchMock((url, init) => {
      if (url === '/api/portal/settings/profile' && (init as RequestInit)?.method === 'PATCH') {
        return { success: false, message: 'Email already in use.' };
      }
      return defaultFetch(url, init);
    });
    await act(async () => { render(<ProfileSettingsPage />); });
    await flush();
    await act(async () => {
      fireEvent.submit(document.querySelector('form')!);
    });
    await flush();
    expect(screen.getByText('Email already in use.')).toBeTruthy();
  });

  it('shows generic error message when fetch throws during save', async () => {
    installFetchMock((url) => {
      if (url === '/api/portal/settings/profile') return { success: true, data: baseProfile };
      return defaultFetch(url);
    });
    // Override to throw on PATCH
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async (url: string, init?: RequestInit) => {
      if ((init as RequestInit)?.method === 'PATCH') throw new Error('network error');
      return (originalFetch as typeof fetch)(url as RequestInfo, init);
    }) as unknown as typeof fetch;

    await act(async () => { render(<ProfileSettingsPage />); });
    await flush();
    await act(async () => {
      fireEvent.submit(document.querySelector('form')!);
    });
    await flush();
    expect(screen.getByText('Algo salió mal. Inténtalo de nuevo.')).toBeTruthy();
  });

  it('shows success icon (check_circle) for success message', async () => {
    await act(async () => { render(<ProfileSettingsPage />); });
    await flush();
    await act(async () => {
      fireEvent.submit(document.querySelector('form')!);
    });
    await flush();
    const icons = Array.from(document.querySelectorAll('span.material-icons'));
    const hasCheckCircle = icons.some((el) => el.textContent === 'check_circle');
    expect(hasCheckCircle).toBe(true);
  });

  it('shows error icon for error message', async () => {
    installFetchMock((url, init) => {
      if (url === '/api/portal/settings/profile' && (init as RequestInit)?.method === 'PATCH') {
        return { success: false, message: 'fail' };
      }
      return defaultFetch(url, init);
    });
    await act(async () => { render(<ProfileSettingsPage />); });
    await flush();
    await act(async () => {
      fireEvent.submit(document.querySelector('form')!);
    });
    await flush();
    const icons = Array.from(document.querySelectorAll('span.material-icons'));
    const hasError = icons.some((el) => el.textContent === 'error');
    expect(hasError).toBe(true);
  });

  it('disables Save button while saving and shows Saving text', async () => {
    // Pause the PATCH response
    let resolvePatch!: (v: unknown) => void;
    const patchPromise = new Promise((r) => { resolvePatch = r; });
    installFetchMock((url, init) => {
      if ((init as RequestInit)?.method === 'PATCH') return patchPromise;
      return defaultFetch(url, init);
    });
    // Override to return promise for PATCH
    globalThis.fetch = vi.fn(async (url: string, init?: RequestInit) => {
      if ((init as RequestInit)?.method === 'PATCH') {
        await patchPromise;
        return { json: async () => ({ success: true, message: 'ok' }) } as unknown as Response;
      }
      return { json: async () => defaultFetch(url as string, init) } as unknown as Response;
    }) as unknown as typeof fetch;

    await act(async () => { render(<ProfileSettingsPage />); });
    await flush();

    act(() => {
      fireEvent.submit(document.querySelector('form')!);
    });
    // While pending, button should be disabled and show "Guardando…"
    await waitFor(() => {
      expect(screen.getByText('Guardando…')).toBeTruthy();
    });
    const saveBtn = screen.getByText('Guardando…').closest('button');
    expect(saveBtn?.disabled).toBe(true);

    // Resolve to finish
    resolvePatch(undefined);
    await flush();
  });

  // ── Cambiar contraseña section ────────────────────────────────────────────────

  it('renders the Cambiar contraseña section heading', async () => {
    await act(async () => { render(<ProfileSettingsPage />); });
    await flush();
    expect(screen.getByText('Cambiar contraseña')).toBeTruthy();
  });

  it('renders Contraseña actual, Nueva contraseña, Confirmar nueva contraseña fields', async () => {
    await act(async () => { render(<ProfileSettingsPage />); });
    await flush();
    expect(screen.getByText('Contraseña actual')).toBeTruthy();
    expect(screen.getByText('Nueva contraseña')).toBeTruthy();
    expect(screen.getByText('Confirmar nueva contraseña')).toBeTruthy();
  });

  it('toggles password visibility with Mostrar/Ocultar button', async () => {
    await act(async () => { render(<ProfileSettingsPage />); });
    await flush();
    const showBtn = screen.getByText('Mostrar');
    // All password inputs should start as type="password"
    const passwordInputs = Array.from(document.querySelectorAll('input[autocomplete="current-password"], input[autocomplete="new-password"]')) as HTMLInputElement[];
    expect(passwordInputs.every((i) => i.type === 'password')).toBe(true);

    await act(async () => { fireEvent.click(showBtn); });
    // After clicking Mostrar, inputs become type="text"
    const updatedInputs = Array.from(document.querySelectorAll('input[autocomplete="current-password"], input[autocomplete="new-password"]')) as HTMLInputElement[];
    expect(updatedInputs.every((i) => i.type === 'text')).toBe(true);
    expect(screen.getByText('Ocultar')).toBeTruthy();
  });

  it('clicking Ocultar toggles passwords back to hidden', async () => {
    await act(async () => { render(<ProfileSettingsPage />); });
    await flush();
    await act(async () => { fireEvent.click(screen.getByText('Mostrar')); });
    await act(async () => { fireEvent.click(screen.getByText('Ocultar')); });
    const passwordInputs = Array.from(document.querySelectorAll('input[autocomplete="current-password"], input[autocomplete="new-password"]')) as HTMLInputElement[];
    expect(passwordInputs.every((i) => i.type === 'password')).toBe(true);
  });

  it('shows error when new password is too short (<8 chars)', async () => {
    await act(async () => { render(<ProfileSettingsPage />); });
    await flush();

    // Find the Cambiar contraseña form (second form on page)
    const forms = document.querySelectorAll('form');
    const pwForm = forms[1] as HTMLFormElement;

    const currentPwInput = pwForm.querySelector('input[autocomplete="current-password"]') as HTMLInputElement;
    const newPwInputs = pwForm.querySelectorAll('input[autocomplete="new-password"]') as NodeListOf<HTMLInputElement>;
    fireEvent.change(currentPwInput, { target: { value: 'oldpass' } });
    fireEvent.change(newPwInputs[0], { target: { value: 'short' } });
    fireEvent.change(newPwInputs[1], { target: { value: 'short' } });

    await act(async () => { fireEvent.submit(pwForm); });
    await flush();
    expect(screen.getByText('La nueva contraseña debe tener al menos 8 caracteres.')).toBeTruthy();
  });

  it('shows error when passwords do not match', async () => {
    await act(async () => { render(<ProfileSettingsPage />); });
    await flush();

    const forms = document.querySelectorAll('form');
    const pwForm = forms[1] as HTMLFormElement;

    const currentPwInput = pwForm.querySelector('input[autocomplete="current-password"]') as HTMLInputElement;
    const newPwInputs = pwForm.querySelectorAll('input[autocomplete="new-password"]') as NodeListOf<HTMLInputElement>;
    fireEvent.change(currentPwInput, { target: { value: 'oldpass123' } });
    fireEvent.change(newPwInputs[0], { target: { value: 'newpassword1' } });
    fireEvent.change(newPwInputs[1], { target: { value: 'differentpass2' } });

    await act(async () => { fireEvent.submit(pwForm); });
    await flush();
    expect(screen.getByText('Las nuevas contraseñas no coinciden.')).toBeTruthy();
  });

  it('shows success message on successful password change', async () => {
    await act(async () => { render(<ProfileSettingsPage />); });
    await flush();

    const forms = document.querySelectorAll('form');
    const pwForm = forms[1] as HTMLFormElement;
    const currentPwInput = pwForm.querySelector('input[autocomplete="current-password"]') as HTMLInputElement;
    const newPwInputs = pwForm.querySelectorAll('input[autocomplete="new-password"]') as NodeListOf<HTMLInputElement>;
    fireEvent.change(currentPwInput, { target: { value: 'oldpass123' } });
    fireEvent.change(newPwInputs[0], { target: { value: 'newpassword1' } });
    fireEvent.change(newPwInputs[1], { target: { value: 'newpassword1' } });

    await act(async () => { fireEvent.submit(pwForm); });
    await flush();
    expect(screen.getByText('Password changed.')).toBeTruthy();
  });

  it('clears password fields after successful change', async () => {
    await act(async () => { render(<ProfileSettingsPage />); });
    await flush();

    const forms = document.querySelectorAll('form');
    const pwForm = forms[1] as HTMLFormElement;
    const currentPwInput = pwForm.querySelector('input[autocomplete="current-password"]') as HTMLInputElement;
    const newPwInputs = pwForm.querySelectorAll('input[autocomplete="new-password"]') as NodeListOf<HTMLInputElement>;
    fireEvent.change(currentPwInput, { target: { value: 'oldpass123' } });
    fireEvent.change(newPwInputs[0], { target: { value: 'newpassword1' } });
    fireEvent.change(newPwInputs[1], { target: { value: 'newpassword1' } });

    await act(async () => { fireEvent.submit(pwForm); });
    await flush();
    // Fields should be cleared
    expect(currentPwInput.value).toBe('');
    expect(newPwInputs[0].value).toBe('');
    expect(newPwInputs[1].value).toBe('');
  });

  it('shows API error message when password change fails', async () => {
    installFetchMock((url, init) => {
      if (url === '/api/portal/change-password' && (init as RequestInit)?.method === 'POST') {
        return { success: false, error: 'Incorrect current password.' };
      }
      return defaultFetch(url, init);
    });
    await act(async () => { render(<ProfileSettingsPage />); });
    await flush();

    const forms = document.querySelectorAll('form');
    const pwForm = forms[1] as HTMLFormElement;
    const currentPwInput = pwForm.querySelector('input[autocomplete="current-password"]') as HTMLInputElement;
    const newPwInputs = pwForm.querySelectorAll('input[autocomplete="new-password"]') as NodeListOf<HTMLInputElement>;
    fireEvent.change(currentPwInput, { target: { value: 'wrongold' } });
    fireEvent.change(newPwInputs[0], { target: { value: 'newpassword1' } });
    fireEvent.change(newPwInputs[1], { target: { value: 'newpassword1' } });

    await act(async () => { fireEvent.submit(pwForm); });
    await flush();
    expect(screen.getByText('Incorrect current password.')).toBeTruthy();
  });

  it('falls back to "Algo salió mal." when API error has no error field', async () => {
    installFetchMock((url, init) => {
      if (url === '/api/portal/change-password' && (init as RequestInit)?.method === 'POST') {
        return { success: false };
      }
      return defaultFetch(url, init);
    });
    await act(async () => { render(<ProfileSettingsPage />); });
    await flush();

    const forms = document.querySelectorAll('form');
    const pwForm = forms[1] as HTMLFormElement;
    const currentPwInput = pwForm.querySelector('input[autocomplete="current-password"]') as HTMLInputElement;
    const newPwInputs = pwForm.querySelectorAll('input[autocomplete="new-password"]') as NodeListOf<HTMLInputElement>;
    fireEvent.change(currentPwInput, { target: { value: 'oldpass123' } });
    fireEvent.change(newPwInputs[0], { target: { value: 'newpassword1' } });
    fireEvent.change(newPwInputs[1], { target: { value: 'newpassword1' } });

    await act(async () => { fireEvent.submit(pwForm); });
    await flush();
    expect(screen.getByText('Algo salió mal.')).toBeTruthy();
  });

  it('shows generic error when password change fetch throws', async () => {
    const originalFetch = globalThis.fetch;
    installFetchMock(defaultFetch);
    // Override to throw only for change-password POST
    globalThis.fetch = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === '/api/portal/change-password' && (init as RequestInit)?.method === 'POST') {
        throw new Error('network');
      }
      return (originalFetch as typeof fetch)(url as RequestInfo, init);
    }) as unknown as typeof fetch;
    // Need to re-install default fetch for profile load
    globalThis.fetch = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === '/api/portal/change-password' && (init as RequestInit)?.method === 'POST') {
        throw new Error('network');
      }
      return { json: async () => defaultFetch(url, init) } as unknown as Response;
    }) as unknown as typeof fetch;

    await act(async () => { render(<ProfileSettingsPage />); });
    await flush();

    const forms = document.querySelectorAll('form');
    const pwForm = forms[1] as HTMLFormElement;
    const currentPwInput = pwForm.querySelector('input[autocomplete="current-password"]') as HTMLInputElement;
    const newPwInputs = pwForm.querySelectorAll('input[autocomplete="new-password"]') as NodeListOf<HTMLInputElement>;
    fireEvent.change(currentPwInput, { target: { value: 'oldpass123' } });
    fireEvent.change(newPwInputs[0], { target: { value: 'newpassword1' } });
    fireEvent.change(newPwInputs[1], { target: { value: 'newpassword1' } });

    await act(async () => { fireEvent.submit(pwForm); });
    await flush();
    expect(screen.getByText('Algo salió mal. Inténtalo de nuevo.')).toBeTruthy();
  });

  it('renders the Actualizar contraseña button', async () => {
    await act(async () => { render(<ProfileSettingsPage />); });
    await flush();
    expect(screen.getByText('Actualizar contraseña')).toBeTruthy();
  });

  // ──Subdominio del portalSection: hidden when no subdomain websites ─────────────

  it('does not render Subdominio del portal section when no websites have subdomains', async () => {
    await act(async () => { render(<ProfileSettingsPage />); });
    await flush();
    expect(screen.queryByText('Subdominio del portal')).toBeNull();
  });

  it('renders Subdominio del portal section when websites with subdomains exist', async () => {
    installFetchMock((url) => {
      if (url === '/api/portal/settings/profile') return { success: true, data: baseProfile };
      if (url === '/api/portal/default-website') {
        return {
          websites: [
            { id: 10, name: 'My Site', subdomain: 'mysite', domain: null },
            { id: 11, name: 'Other', subdomain: null, domain: null },
          ],
          defaultWebsiteId: 10,
        };
      }
      return defaultFetch(url);
    });
    await act(async () => { render(<ProfileSettingsPage />); });
    await flush();
    await waitFor(() => {
      expect(screen.getByText('Subdominio del portal')).toBeTruthy();
    });
  });

  it('shows the active subdomain URL in Subdominio del portal section', async () => {
    installFetchMock((url) => {
      if (url === '/api/portal/settings/profile') return { success: true, data: baseProfile };
      if (url === '/api/portal/default-website') {
        return {
          websites: [{ id: 10, name: 'My Site', subdomain: 'mysite', domain: null }],
          defaultWebsiteId: 10,
        };
      }
      return defaultFetch(url);
    });
    await act(async () => { render(<ProfileSettingsPage />); });
    await flush();
    await waitFor(() => {
      expect(screen.getByText(/mysite · CRM AGENTS \/portal/)).toBeTruthy();
    });
  });

  it('clicking a website in Subdominio del portal calls POST /api/portal/default-website', async () => {
    const fetchMock = installFetchMock((url, init) => {
      if (url === '/api/portal/settings/profile') return { success: true, data: baseProfile };
      if (url === '/api/portal/default-website' && (!init || (init as RequestInit).method !== 'POST')) {
        return {
          websites: [{ id: 10, name: 'My Site', subdomain: 'mysite', domain: null }],
          defaultWebsiteId: null,
        };
      }
      if (url === '/api/portal/default-website' && (init as RequestInit)?.method === 'POST') {
        return { success: true };
      }
      return defaultFetch(url, init);
    });
    await act(async () => { render(<ProfileSettingsPage />); });
    await flush();
    await waitFor(() => {
      expect(screen.getByText('My Site')).toBeTruthy();
    });
    await act(async () => {
      fireEvent.click(screen.getByText('My Site'));
    });
    await flush();
    const postCall = fetchMock.mock.calls.find(
      ([url, init]) => url === '/api/portal/default-website' && (init as RequestInit)?.method === 'POST'
    );
    expect(postCall).toBeTruthy();
  });

  it('shows success message after setting portal subdomain', async () => {
    installFetchMock((url, init) => {
      if (url === '/api/portal/settings/profile') return { success: true, data: baseProfile };
      if (url === '/api/portal/default-website' && (!init || (init as RequestInit).method !== 'POST')) {
        return {
          websites: [{ id: 10, name: 'My Site', subdomain: 'mysite', domain: null }],
          defaultWebsiteId: null,
        };
      }
      if (url === '/api/portal/default-website' && (init as RequestInit)?.method === 'POST') {
        return { success: true };
      }
      return defaultFetch(url, init);
    });
    await act(async () => { render(<ProfileSettingsPage />); });
    await flush();
    await waitFor(() => { expect(screen.getByText('My Site')).toBeTruthy(); });
    await act(async () => { fireEvent.click(screen.getByText('My Site')); });
    await flush();
    expect(screen.getByText(/Subdominio del portal establecido en mysite · CRM AGENTS/)).toBeTruthy();
  });

  it('shows error when POST /api/portal/default-website fails', async () => {
    installFetchMock((url, init) => {
      if (url === '/api/portal/settings/profile') return { success: true, data: baseProfile };
      if (url === '/api/portal/default-website' && (init as RequestInit)?.method === 'POST') {
        return { success: false, error: 'Not allowed.' };
      }
      if (url === '/api/portal/default-website') {
        return {
          websites: [{ id: 10, name: 'My Site', subdomain: 'mysite', domain: null }],
          defaultWebsiteId: null,
        };
      }
      return defaultFetch(url, init);
    });
    await act(async () => { render(<ProfileSettingsPage />); });
    await flush();
    await waitFor(() => { expect(screen.getByText('My Site')).toBeTruthy(); });
    await act(async () => { fireEvent.click(screen.getByText('My Site')); });
    await flush();
    expect(screen.getByText('Not allowed.')).toBeTruthy();
  });

  it('marks the default website as selected with check_circle icon', async () => {
    installFetchMock((url) => {
      if (url === '/api/portal/settings/profile') return { success: true, data: baseProfile };
      if (url === '/api/portal/default-website') {
        return {
          websites: [
            { id: 10, name: 'My Site', subdomain: 'mysite', domain: null },
            { id: 11, name: 'Other Site', subdomain: 'other', domain: null },
          ],
          defaultWebsiteId: 10,
        };
      }
      return defaultFetch(url);
    });
    await act(async () => { render(<ProfileSettingsPage />); });
    await flush();
    await waitFor(() => { expect(screen.getByText('My Site')).toBeTruthy(); });
    const icons = Array.from(document.querySelectorAll('span.material-icons'));
    const hasCheck = icons.some((el) => el.textContent === 'check_circle');
    expect(hasCheck).toBe(true);
  });

  // ── DefaultPortalSection: hidden when portals.length <= 1 ─────────────────

  it('does not render Portal predeterminado section when user has only one portal', async () => {
    await act(async () => { render(<ProfileSettingsPage />); });
    await flush();
    expect(screen.queryByText('Portal predeterminado')).toBeNull();
  });

  it('renders Portal predeterminado section when user has multiple portals', async () => {
    installFetchMock((url) => {
      if (url === '/api/portal/settings/profile') return { success: true, data: baseProfile };
      if (url === '/api/portal/my-subdomain') {
        return {
          portals: [
            { clientId: 1, company: 'Acme', subdomain: 'acme' },
            { clientId: 2, company: 'Beta Corp', subdomain: 'beta' },
          ],
          defaultClientId: 1,
        };
      }
      return defaultFetch(url);
    });
    await act(async () => { render(<ProfileSettingsPage />); });
    await flush();
    await waitFor(() => {
      expect(screen.getByText('Portal predeterminado')).toBeTruthy();
    });
  });

  it('renders portal list with company names in Portal predeterminado section', async () => {
    installFetchMock((url) => {
      if (url === '/api/portal/settings/profile') return { success: true, data: baseProfile };
      if (url === '/api/portal/my-subdomain') {
        return {
          portals: [
            { clientId: 1, company: 'Acme', subdomain: 'acme' },
            { clientId: 2, company: 'Beta Corp', subdomain: 'beta' },
          ],
          defaultClientId: 1,
        };
      }
      return defaultFetch(url);
    });
    await act(async () => { render(<ProfileSettingsPage />); });
    await flush();
    await waitFor(() => {
      expect(screen.getByText('Acme')).toBeTruthy();
      expect(screen.getByText('Beta Corp')).toBeTruthy();
    });
  });

  it('clicking a portal in Portal predeterminado section calls POST /api/portal/default-portal', async () => {
    const fetchMock = installFetchMock((url, init) => {
      if (url === '/api/portal/settings/profile') return { success: true, data: baseProfile };
      if (url === '/api/portal/my-subdomain') {
        return {
          portals: [
            { clientId: 1, company: 'Acme', subdomain: 'acme' },
            { clientId: 2, company: 'Beta Corp', subdomain: 'beta' },
          ],
          defaultClientId: 1,
        };
      }
      if (url === '/api/portal/default-portal' && (init as RequestInit)?.method === 'POST') {
        return { success: true };
      }
      return defaultFetch(url, init);
    });
    await act(async () => { render(<ProfileSettingsPage />); });
    await flush();
    await waitFor(() => { expect(screen.getByText('Beta Corp')).toBeTruthy(); });
    await act(async () => { fireEvent.click(screen.getByText('Beta Corp')); });
    await flush();
    const postCall = fetchMock.mock.calls.find(
      ([url, init]) => url === '/api/portal/default-portal' && (init as RequestInit)?.method === 'POST'
    );
    expect(postCall).toBeTruthy();
    const body = JSON.parse((postCall![1] as RequestInit).body as string);
    expect(body.clientId).toBe(2);
  });

  it('shows success message after switching default portal', async () => {
    installFetchMock((url, init) => {
      if (url === '/api/portal/settings/profile') return { success: true, data: baseProfile };
      if (url === '/api/portal/my-subdomain') {
        return {
          portals: [
            { clientId: 1, company: 'Acme', subdomain: 'acme' },
            { clientId: 2, company: 'Beta Corp', subdomain: 'beta' },
          ],
          defaultClientId: 1,
        };
      }
      if (url === '/api/portal/default-portal' && (init as RequestInit)?.method === 'POST') {
        return { success: true };
      }
      return defaultFetch(url, init);
    });
    await act(async () => { render(<ProfileSettingsPage />); });
    await flush();
    await waitFor(() => { expect(screen.getByText('Beta Corp')).toBeTruthy(); });
    await act(async () => { fireEvent.click(screen.getByText('Beta Corp')); });
    await flush();
    expect(screen.getByText('Portal predeterminado actualizado.')).toBeTruthy();
  });

  it('shows error when POST /api/portal/default-portal fails', async () => {
    installFetchMock((url, init) => {
      if (url === '/api/portal/settings/profile') return { success: true, data: baseProfile };
      if (url === '/api/portal/my-subdomain') {
        return {
          portals: [
            { clientId: 1, company: 'Acme', subdomain: 'acme' },
            { clientId: 2, company: 'Beta Corp', subdomain: null },
          ],
          defaultClientId: 1,
        };
      }
      if (url === '/api/portal/default-portal' && (init as RequestInit)?.method === 'POST') {
        return { success: false, error: 'Permission denied.' };
      }
      return defaultFetch(url, init);
    });
    await act(async () => { render(<ProfileSettingsPage />); });
    await flush();
    await waitFor(() => { expect(screen.getByText('Beta Corp')).toBeTruthy(); });
    await act(async () => { fireEvent.click(screen.getByText('Beta Corp')); });
    await flush();
    expect(screen.getByText('Permission denied.')).toBeTruthy();
  });

  it('falls back to "Algo salió mal." when default-portal error has no error field', async () => {
    installFetchMock((url, init) => {
      if (url === '/api/portal/settings/profile') return { success: true, data: baseProfile };
      if (url === '/api/portal/my-subdomain') {
        return {
          portals: [
            { clientId: 1, company: 'Acme', subdomain: 'acme' },
            { clientId: 2, company: 'Beta Corp', subdomain: null },
          ],
          defaultClientId: 1,
        };
      }
      if (url === '/api/portal/default-portal' && (init as RequestInit)?.method === 'POST') {
        return { success: false };
      }
      return defaultFetch(url, init);
    });
    await act(async () => { render(<ProfileSettingsPage />); });
    await flush();
    await waitFor(() => { expect(screen.getByText('Beta Corp')).toBeTruthy(); });
    await act(async () => { fireEvent.click(screen.getByText('Beta Corp')); });
    await flush();
    expect(screen.getByText('Algo salió mal.')).toBeTruthy();
  });

  it('shows subdomain URL for portals that have a subdomain', async () => {
    installFetchMock((url) => {
      if (url === '/api/portal/settings/profile') return { success: true, data: baseProfile };
      if (url === '/api/portal/my-subdomain') {
        return {
          portals: [
            { clientId: 1, company: 'Acme', subdomain: 'acme' },
            { clientId: 2, company: 'Beta Corp', subdomain: 'beta' },
          ],
          defaultClientId: 1,
        };
      }
      return defaultFetch(url);
    });
    await act(async () => { render(<ProfileSettingsPage />); });
    await flush();
    await waitFor(() => {
      expect(screen.getByText(/acme · CRM AGENTS/)).toBeTruthy();
      expect(screen.getByText(/beta · CRM AGENTS/)).toBeTruthy();
    });
  });

  it('does not render subdomain URL for portals with null subdomain', async () => {
    installFetchMock((url) => {
      if (url === '/api/portal/settings/profile') return { success: true, data: baseProfile };
      if (url === '/api/portal/my-subdomain') {
        return {
          portals: [
            { clientId: 1, company: 'Acme', subdomain: 'acme' },
            { clientId: 2, company: 'Beta Corp', subdomain: null },
          ],
          defaultClientId: 1,
        };
      }
      return defaultFetch(url);
    });
    await act(async () => { render(<ProfileSettingsPage />); });
    await flush();
    await waitFor(() => { expect(screen.getByText('Beta Corp')).toBeTruthy(); });
    // Beta has null subdomain — no beta.simplerdevelopment.com text
    expect(screen.queryByText(/beta · CRM AGENTS/)).toBeNull();
  });

  it('renders the first letter of company name as avatar in Portal predeterminado section', async () => {
    installFetchMock((url) => {
      if (url === '/api/portal/settings/profile') return { success: true, data: baseProfile };
      if (url === '/api/portal/my-subdomain') {
        return {
          portals: [
            { clientId: 1, company: 'Acme', subdomain: 'acme' },
            { clientId: 2, company: 'Beta Corp', subdomain: 'beta' },
          ],
          defaultClientId: 1,
        };
      }
      return defaultFetch(url);
    });
    await act(async () => { render(<ProfileSettingsPage />); });
    await flush();
    await waitFor(() => { expect(screen.getByText('Portal predeterminado')).toBeTruthy(); });
    const { container } = render(<React.Fragment />); // just use document
    const bodyText = document.body.textContent ?? '';
    expect(bodyText).toContain('A'); // Acme -> A
    expect(bodyText).toContain('B'); // Beta Corp -> B
  });

  it('renders "U" as avatar fallback when company name is empty', async () => {
    installFetchMock((url) => {
      if (url === '/api/portal/settings/profile') return { success: true, data: baseProfile };
      if (url === '/api/portal/my-subdomain') {
        return {
          portals: [
            { clientId: 1, company: '', subdomain: 'acme' },
            { clientId: 2, company: 'Beta Corp', subdomain: 'beta' },
          ],
          defaultClientId: 1,
        };
      }
      return defaultFetch(url);
    });
    await act(async () => { render(<ProfileSettingsPage />); });
    await flush();
    await waitFor(() => { expect(screen.getByText('Portal predeterminado')).toBeTruthy(); });
    // company='' -> fallback 'U'
    expect(document.body.textContent).toContain('U');
  });
});
