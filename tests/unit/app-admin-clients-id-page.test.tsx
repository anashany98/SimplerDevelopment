// @vitest-environment jsdom
/**
 * Unit tests for `app/admin/clients/[id]/page.tsx` — the admin client detail
 * page. Stubs out `fetch`, `next/link`, `next/navigation` and exercises tab
 * switching, profile editing, billing rollup, team management, sending domain
 * management, and email-marketing list/campaign flows.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';

// ─── Mocks (must precede page import) ───────────────────────────────────────

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(), replace: vi.fn(), refresh: vi.fn(),
    back: vi.fn(), forward: vi.fn(), prefetch: vi.fn(),
  }),
  usePathname: () => '/admin/clients/1',
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('next/link', () => ({
  __esModule: true,
  default: ({ children, href, ...rest }: any) =>
    React.createElement('a', { href, ...rest }, children),
}));

// ─── Helpers ────────────────────────────────────────────────────────────────

type FetchHandler = (url: string, init?: any) => any | Promise<any>;
const handlers: FetchHandler[] = [];

function setFetchHandler(handler: FetchHandler) {
  handlers.length = 0;
  handlers.push(handler);
}

function jsonResponse(body: any) {
  return { ok: true, json: async () => body } as any;
}

const baseClient = {
  id: 1, userId: 99, company: 'Acme Co', phone: '555-1212',
  website: 'https://acme.test', address: '1 Way', notes: 'vip',
  createdAt: '2025-01-01T00:00:00Z',
  userName: 'Jane Doe', userEmail: 'jane@acme.test', userActive: true,
};

function defaultFetch(url: string, init?: any): any {
  // Clients list
  if (url === '/api/admin/portal/clients') {
    return jsonResponse({ data: [baseClient] });
  }
  // Email lists/campaigns
  if (url.startsWith('/api/admin/email/lists?clientId=')) {
    return jsonResponse({
      data: [
        { id: 10, name: 'Newsletter', description: 'desc', subscriberCount: 3 },
        { id: 11, name: 'Promo', description: null, subscriberCount: 1 },
      ],
    });
  }
  if (url.startsWith('/api/admin/email/campaigns?clientId=')) {
    return jsonResponse({
      data: [
        { id: 50, name: 'Spring', subject: 'Hi', status: 'sent', totalSent: 200, totalOpened: 100, sentAt: '2025-01-01', listName: 'Newsletter' },
        { id: 51, name: 'Send Out', subject: 'Now', status: 'sending', totalSent: 0, totalOpened: 0, sentAt: null, listName: 'Promo' },
        { id: 52, name: 'Draft', subject: 'Hello', status: 'draft', totalSent: 0, totalOpened: 0, sentAt: null, listName: null },
      ],
    });
  }
  // Team members
  if (url === '/api/admin/portal/clients/1/members') {
    if (init?.method === 'POST') {
      return jsonResponse({
        success: true,
        data: { memberId: 200, role: 'member', userId: 5, name: 'New Person', email: 'new@x', active: true, joinedAt: '2025-01-01' },
      });
    }
    return jsonResponse({
      data: [
        { memberId: 100, role: 'owner', userId: 99, name: 'Jane Doe', email: 'jane@acme.test', active: true, joinedAt: '2024-01-01' },
        { memberId: 101, role: 'member', userId: 50, name: 'Bob', email: 'bob@acme.test', active: false, joinedAt: '2024-06-01' },
      ],
    });
  }
  if (url.startsWith('/api/admin/portal/clients/1/members/')) {
    return jsonResponse({ success: true });
  }
  // Billing metered items
  if (url === '/api/admin/portal/clients/1/billing/metered-items') {
    if (init?.method === 'POST') {
      return jsonResponse({ success: true, data: { id: 5 } });
    }
    return jsonResponse({
      data: [
        {
          id: 1, clientId: 1, resource: 'hosting_bandwidth_gb',
          stripeSubscriptionId: 'sub_1', stripeSubscriptionItemId: 'si_1',
          unitPriceCents: 10, includedQuantity: '50', status: 'active',
          createdAt: '2025-01-01', updatedAt: '2025-01-01',
        },
        {
          id: 2, clientId: 1, resource: 'email_send',
          stripeSubscriptionId: 'sub_1', stripeSubscriptionItemId: 'si_2',
          unitPriceCents: 5, includedQuantity: '0', status: 'paused',
          createdAt: '2025-01-01', updatedAt: '2025-01-01',
        },
      ],
    });
  }
  if (url.startsWith('/api/admin/portal/clients/1/billing/metered-items/')) {
    return jsonResponse({ success: true });
  }
  // Billing usage
  if (url === '/api/admin/portal/clients/1/billing/usage') {
    if (init?.method === 'POST') {
      const body = JSON.parse(init.body);
      return jsonResponse({
        success: true,
        data: {
          result: [
            { resource: 'hosting_bandwidth_gb', billed: body.dryRun ? 0 : 100 },
            { resource: 'email_send', billed: body.dryRun ? 0 : 50 },
          ],
        },
      });
    }
    return jsonResponse({
      data: {
        period: '2025-01',
        liveTotals: [
          { resource: 'hosting_bandwidth_gb', total: 1234 },
          { resource: 'email_send', total: 567 },
        ],
        dryRun: [
          {
            resource: 'hosting_bandwidth_gb', total: 1234, included: 50,
            billable: 1184, billedCents: 11840,
            stripeUsageRecordId: null, stripeSubscriptionItemId: 'si_1',
          },
        ],
        history: [
          {
            id: 1, clientId: 1, period: '2024-12', resource: 'hosting_bandwidth_gb',
            totalQuantity: '1000', includedQuantity: '50', billableQuantity: '950',
            unitPriceCents: 10, billedAmountCents: 9500,
            stripeUsageRecordId: 'mbur_1', reportedAt: '2025-01-01T00:00:00Z',
            createdAt: '2025-01-01T00:00:00Z',
          },
          {
            id: 2, clientId: 1, period: '2024-11', resource: 'email_send',
            totalQuantity: '500', includedQuantity: '0', billableQuantity: '500',
            unitPriceCents: 5, billedAmountCents: 2500,
            stripeUsageRecordId: null, reportedAt: null,
            createdAt: '2024-12-01T00:00:00Z',
          },
        ],
      },
    });
  }
  // Client profile PATCH
  if (url === '/api/admin/portal/clients/1') {
    return jsonResponse({ success: true });
  }
  // Domains
  if (url === '/api/admin/email/domains') {
    if (init?.method === 'POST') {
      return jsonResponse({
        success: true,
        data: { id: 'd_new', name: JSON.parse(init.body).name, status: 'pending', createdAt: '2025-01-01', region: 'us-east-1', records: [] },
      });
    }
    return jsonResponse({
      data: [
        { id: 'd_1', name: 'verified.test', status: 'verified', createdAt: '2025-01-01', region: 'us-east-1' },
        { id: 'd_2', name: 'pending.test', status: 'pending', createdAt: '2025-01-01', region: 'us-east-1' },
        { id: 'd_3', name: 'failed.test', status: 'failed', createdAt: '2025-01-01', region: 'us-east-1' },
        { id: 'd_4', name: 'weird.test', status: 'unknown_status', createdAt: '2025-01-01', region: 'us-east-1' },
      ],
    });
  }
  if (/^\/api\/admin\/email\/domains\/[^/]+\/verify$/.test(url)) {
    return jsonResponse({ success: true });
  }
  if (/^\/api\/admin\/email\/domains\/d_2$/.test(url)) {
    return jsonResponse({
      success: true,
      data: {
        id: 'd_2', name: 'pending.test', status: 'pending',
        createdAt: '2025-01-01', region: 'us-east-1',
        openTracking: false, clickTracking: true,
        records: [
          { record: 'SPF', name: '_dmarc.pending.test', type: 'TXT', ttl: '3600', status: 'pending', value: 'v=DMARC1; p=none' },
          { record: 'MX', name: 'pending.test', type: 'MX', ttl: '3600', status: 'verified', value: 'mx.example.com', priority: 10 },
          { record: 'DKIM', name: 'k._domainkey.pending.test', type: 'TXT', ttl: '3600', status: 'failed', value: 'dkim-data' },
        ],
      },
    });
  }
  if (/^\/api\/admin\/email\/domains\/d_1$/.test(url)) {
    return jsonResponse({
      success: true,
      data: {
        id: 'd_1', name: 'verified.test', status: 'verified',
        createdAt: '2025-01-01', region: 'us-east-1',
        openTracking: true, clickTracking: false,
        records: [],
      },
    });
  }
  if (/^\/api\/admin\/email\/domains\/[^/]+$/.test(url)) {
    return jsonResponse({ success: true });
  }
  // Lists
  if (url === '/api/admin/email/lists') {
    return jsonResponse({ success: true, data: { id: 20, name: 'New List', description: 'desc' } });
  }
  if (/^\/api\/admin\/email\/lists\/10$/.test(url)) {
    return jsonResponse({
      data: [
        { id: 1000, email: 'a@x.com', name: 'A', status: 'active' },
        { id: 1001, email: 'b@x.com', name: null, status: 'unsubscribed' },
      ],
    });
  }
  if (/^\/api\/admin\/email\/lists\/\d+$/.test(url)) {
    return jsonResponse({ success: true });
  }
  // Subscribers
  if (url === '/api/admin/email/subscribers') {
    return jsonResponse({ success: true, data: { id: 1234, email: 'new@x.com', name: 'New', status: 'active' } });
  }
  if (url.startsWith('/api/admin/email/subscribers?id=')) {
    return jsonResponse({ success: true });
  }
  // Campaigns
  if (url === '/api/admin/email/campaigns') {
    return jsonResponse({
      success: true,
      data: { id: 60, name: 'X', subject: 'S', status: 'draft', totalSent: 0, totalOpened: 0, sentAt: null, listName: null },
    });
  }
  if (/^\/api\/admin\/email\/campaigns\/\d+$/.test(url)) {
    return jsonResponse({ success: true });
  }
  return jsonResponse({ success: true, data: null });
}

// React.use needs an already-fulfilled thenable. Stamp status/value to skip
// suspension at render time.
function makeParams(id: string): any {
  const p: any = Promise.resolve({ id });
  p.status = 'fulfilled';
  p.value = { id };
  return p;
}

let confirmMock: ReturnType<typeof vi.fn>;
let alertMock: ReturnType<typeof vi.fn>;
let promptMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  setFetchHandler(defaultFetch);
  // @ts-ignore
  global.fetch = vi.fn((url: string, init?: any) => Promise.resolve(handlers[0](url, init)));
  confirmMock = vi.fn(() => true);
  alertMock = vi.fn();
  promptMock = vi.fn();
  // @ts-ignore
  window.confirm = confirmMock;
  // @ts-ignore
  window.alert = alertMock;
  // @ts-ignore
  window.prompt = promptMock;
  // Clipboard
  Object.assign(navigator, {
    clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
  });
});

afterEach(() => {
  vi.useRealTimers();
});

// Imports under test (after mocks)
import ClientDetailPage from '@/app/admin/clients/[id]/page';

async function renderPage(id = '1') {
  const result = render(<ClientDetailPage params={makeParams(id)} />);
  // Wait for initial client fetch to resolve
  await waitFor(() => {
    expect(screen.queryByText('Cargando…')).toBeNull();
  });
  return result;
}

async function flush() {
  await act(async () => { await Promise.resolve(); });
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('ClientDetailPage', () => {
  describe('initial load', () => {
    it('renders loading state initially', () => {
      const result = render(<ClientDetailPage params={makeParams('1')} />);
      expect(result.container.textContent).toContain('Cargando');
    });

    it('renders client header after fetch', async () => {
      await renderPage();
      expect(screen.getAllByText('Acme Co').length).toBeGreaterThan(0);
      expect(screen.getAllByText('jane@acme.test').length).toBeGreaterThan(0);
    });

    it('falls back to userName when company is null', async () => {
      setFetchHandler((url, init) => {
        if (url === '/api/admin/portal/clients') {
          return jsonResponse({ data: [{ ...baseClient, company: null }] });
        }
        return defaultFetch(url, init);
      });
      await renderPage();
      expect(screen.getAllByText('Jane Doe').length).toBeGreaterThan(0);
    });

    it('shows "not found" if client is missing from list', async () => {
      setFetchHandler((url) => {
        if (url === '/api/admin/portal/clients') return jsonResponse({ data: [] });
        return jsonResponse({ data: [] });
      });
      await waitFor(() => {
        render(<ClientDetailPage params={makeParams('999')} />);
      });
      await waitFor(() => {
        expect(screen.getByText('Cliente no encontrado.')).toBeTruthy();
      });
    });

    it('handles missing data field with default empty array', async () => {
      setFetchHandler((url) => {
        if (url === '/api/admin/portal/clients') return jsonResponse({});
        return jsonResponse({});
      });
      const result = render(<ClientDetailPage params={makeParams('1')} />);
      await waitFor(() => {
        expect(result.container.textContent).toContain('Cliente no encontrado');
      });
    });
  });

  describe('overview tab', () => {
    it('renders all overview rows', async () => {
      await renderPage();
      expect(screen.getByText('Nombre')).toBeTruthy();
      expect(screen.getByText('Correo')).toBeTruthy();
      expect(screen.getByText('Empresa')).toBeTruthy();
      expect(screen.getByText('Teléfono')).toBeTruthy();
      expect(screen.getByText('Sitio web')).toBeTruthy();
      expect(screen.getByText('Estado')).toBeTruthy();
      expect(screen.getByText('Notas')).toBeTruthy();
      expect(screen.getByText('Activo')).toBeTruthy();
    });

    it('renders inactive status', async () => {
      setFetchHandler((url, init) => {
        if (url === '/api/admin/portal/clients') {
          return jsonResponse({ data: [{ ...baseClient, userActive: false }] });
        }
        return defaultFetch(url, init);
      });
      await renderPage();
      expect(screen.getByText('Inactivo')).toBeTruthy();
    });

    it('shows em-dash for null fields', async () => {
      setFetchHandler((url, init) => {
        if (url === '/api/admin/portal/clients') {
          return jsonResponse({ data: [{ ...baseClient, phone: null, website: null, notes: null }] });
        }
        return defaultFetch(url, init);
      });
      await renderPage();
      const dashes = screen.getAllByText('—');
      expect(dashes.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('tab switching', () => {
    it('switches to email tab and loads lists + campaigns', async () => {
      await renderPage();
      fireEvent.click(screen.getByRole('button', { name: 'Email marketing' }));
      await waitFor(() => expect(screen.getAllByText('Newsletter').length).toBeGreaterThan(0));
      expect(screen.getAllByText('Promo').length).toBeGreaterThan(0);
      expect(screen.getByText('Spring')).toBeTruthy();
    });

    it('switches to billing tab and loads metered items + usage', async () => {
      await renderPage();
      fireEvent.click(screen.getByRole('button', { name: 'Facturación' }));
      await waitFor(() => expect(screen.getByText('Totales del periodo actual')).toBeTruthy());
      await waitFor(() => expect(screen.getAllByText('hosting_bandwidth_gb').length).toBeGreaterThan(0));
    });

    it('switches to settings tab and loads domains', async () => {
      await renderPage();
      fireEvent.click(screen.getByRole('button', { name: 'Ajustes' }));
      await waitFor(() => expect(screen.getByText('Perfil del cliente')).toBeTruthy());
      await waitFor(() => expect(screen.getByText('verified.test')).toBeTruthy());
    });

    it('switches to team tab and loads members', async () => {
      await renderPage();
      fireEvent.click(screen.getByRole('button', { name: 'Equipo' }));
      await waitFor(() => expect(screen.getByText('Miembros del equipo')).toBeTruthy());
      await waitFor(() => expect(screen.getAllByText('Jane Doe').length).toBeGreaterThan(0));
      expect(screen.getByText('Bob')).toBeTruthy();
    });
  });

  describe('settings: profile form', () => {
    it('shows current values in form fields', async () => {
      await renderPage();
      fireEvent.click(screen.getByRole('button', { name: 'Ajustes' }));
      await waitFor(() => expect(screen.getByText('Perfil del cliente')).toBeTruthy());
      const nameInput = screen.getByDisplayValue('Jane Doe') as HTMLInputElement;
      expect(nameInput.value).toBe('Jane Doe');
    });

    it('saves profile changes and shows success message', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      await renderPage();
      fireEvent.click(screen.getByRole('button', { name: 'Ajustes' }));
      await waitFor(() => expect(screen.getByText('Perfil del cliente')).toBeTruthy());
      const nameInput = screen.getByDisplayValue('Jane Doe') as HTMLInputElement;
      fireEvent.change(nameInput, { target: { value: 'New Jane' } });
      fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
      await waitFor(() => expect(screen.getByText(/Cambios guardados correctamente/)).toBeTruthy());
    });

    it('shows error message when save fails', async () => {
      setFetchHandler((url, init) => {
        if (url === '/api/admin/portal/clients/1' && init?.method === 'PATCH') {
          return jsonResponse({ success: false, message: 'Server error' });
        }
        return defaultFetch(url, init);
      });
      await renderPage();
      fireEvent.click(screen.getByRole('button', { name: 'Ajustes' }));
      await waitFor(() => expect(screen.getByText('Perfil del cliente')).toBeTruthy());
      fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
      await waitFor(() => expect(screen.getByText('Server error')).toBeTruthy());
    });

    it('toggles active status', async () => {
      await renderPage();
      fireEvent.click(screen.getByRole('button', { name: 'Ajustes' }));
      await waitFor(() => expect(screen.getByText('Perfil del cliente')).toBeTruthy());
      // Find the toggle button (button without name following the "Account Active" label)
      const toggles = screen.getAllByRole('button');
      const accountToggle = toggles.find(b =>
        b.className.includes('w-10 h-6 rounded-full'),
      );
      expect(accountToggle).toBeTruthy();
      fireEvent.click(accountToggle!);
    });
  });

  describe('settings: domains', () => {
    it('shows add domain form when "Add Domain" clicked', async () => {
      await renderPage();
      fireEvent.click(screen.getByRole('button', { name: 'Ajustes' }));
      await waitFor(() => expect(screen.getByText('Dominios de envío')).toBeTruthy());
      fireEvent.click(screen.getByRole('button', { name: /Añadir dominio/ }));
      expect(screen.getByPlaceholderText('yourdomain.com')).toBeTruthy();
    });

    it('adds a new domain', async () => {
      await renderPage();
      fireEvent.click(screen.getByRole('button', { name: 'Ajustes' }));
      await waitFor(() => expect(screen.getByText('Dominios de envío')).toBeTruthy());
      fireEvent.click(screen.getByRole('button', { name: /Añadir dominio/ }));
      const input = screen.getByPlaceholderText('yourdomain.com');
      fireEvent.change(input, { target: { value: 'new.test' } });
      const form = input.closest('form') as HTMLFormElement;
      fireEvent.submit(form);
      await flush();
    });

    it('shows error when add domain fails', async () => {
      setFetchHandler((url, init) => {
        if (url === '/api/admin/email/domains' && init?.method === 'POST') {
          return jsonResponse({ success: false, message: 'Already exists' });
        }
        return defaultFetch(url, init);
      });
      await renderPage();
      fireEvent.click(screen.getByRole('button', { name: 'Ajustes' }));
      await waitFor(() => expect(screen.getByText('Dominios de envío')).toBeTruthy());
      fireEvent.click(screen.getByRole('button', { name: /Añadir dominio/ }));
      const input = screen.getByPlaceholderText('yourdomain.com');
      fireEvent.change(input, { target: { value: 'dup.test' } });
      const form = input.closest('form') as HTMLFormElement;
      fireEvent.submit(form);
      await waitFor(() => expect(screen.getByText('Already exists')).toBeTruthy());
    });

    it('opens a pending domain and shows DNS records', async () => {
      await renderPage();
      fireEvent.click(screen.getByRole('button', { name: 'Ajustes' }));
      await waitFor(() => expect(screen.getByText('pending.test')).toBeTruthy());
      fireEvent.click(screen.getByText('pending.test'));
      await waitFor(() => expect(screen.getByText('Registros DNS')).toBeTruthy());
      expect(screen.getByText('SPF')).toBeTruthy();
      expect(screen.getByText('DNS pendiente')).toBeTruthy();
    });

    it('opens a verified domain and shows tracking settings', async () => {
      await renderPage();
      fireEvent.click(screen.getByRole('button', { name: 'Ajustes' }));
      await waitFor(() => expect(screen.getByText('verified.test')).toBeTruthy());
      fireEvent.click(screen.getByText('verified.test'));
      await waitFor(() => expect(screen.getByText('Ajustes de seguimiento')).toBeTruthy());
      expect(screen.getByText('Seguimiento de aperturas')).toBeTruthy();
      expect(screen.getByText('Seguimiento de clics')).toBeTruthy();
    });

    it('toggles open tracking on verified domain', async () => {
      await renderPage();
      fireEvent.click(screen.getByRole('button', { name: 'Ajustes' }));
      await waitFor(() => expect(screen.getByText('verified.test')).toBeTruthy());
      fireEvent.click(screen.getByText('verified.test'));
      await waitFor(() => expect(screen.getByText('Ajustes de seguimiento')).toBeTruthy());
      // Find the open tracking toggle (first toggle in the tracking section)
      const toggles = screen.getAllByRole('button').filter(b =>
        b.className.includes('w-10 h-6 rounded-full'),
      );
      // First match is the profile toggle, subsequent ones are tracking toggles
      if (toggles.length >= 2) {
        fireEvent.click(toggles[1]);
        await flush();
      }
    });

    it('verifies a pending domain', async () => {
      await renderPage();
      fireEvent.click(screen.getByRole('button', { name: 'Ajustes' }));
      await waitFor(() => expect(screen.getByText('pending.test')).toBeTruthy());
      fireEvent.click(screen.getByText('pending.test'));
      await waitFor(() => expect(screen.getByRole('button', { name: /Verificar ahora/ })).toBeTruthy());
      fireEvent.click(screen.getByRole('button', { name: /Verificar ahora/ }));
      await flush();
    });

    it('shows alert when verify fails', async () => {
      setFetchHandler((url, init) => {
        if (/\/verify$/.test(url)) {
          return jsonResponse({ success: false, message: 'DNS not ready' });
        }
        return defaultFetch(url, init);
      });
      await renderPage();
      fireEvent.click(screen.getByRole('button', { name: 'Ajustes' }));
      await waitFor(() => expect(screen.getByText('pending.test')).toBeTruthy());
      fireEvent.click(screen.getByText('pending.test'));
      await waitFor(() => expect(screen.getByRole('button', { name: /Verificar ahora/ })).toBeTruthy());
      fireEvent.click(screen.getByRole('button', { name: /Verificar ahora/ }));
      await waitFor(() => expect(alertMock).toHaveBeenCalledWith('DNS not ready'));
    });

    it('deletes a domain after confirmation', async () => {
      await renderPage();
      fireEvent.click(screen.getByRole('button', { name: 'Ajustes' }));
      await waitFor(() => expect(screen.getByText('verified.test')).toBeTruthy());
      // First domain row has a delete button — click it
      const deleteBtns = screen.getAllByTitle ? [] : [];
      // Click delete on verified.test using its row's adjacent button
      const verifiedText = screen.getByText('verified.test');
      const row = verifiedText.closest('div')?.parentElement?.parentElement as HTMLElement;
      const deleteBtn = row?.querySelector('button');
      if (deleteBtn) fireEvent.click(deleteBtn);
      await flush();
      expect(confirmMock).toHaveBeenCalled();
    });

    it('skips delete when confirm is cancelled', async () => {
      confirmMock.mockReturnValueOnce(false);
      await renderPage();
      fireEvent.click(screen.getByRole('button', { name: 'Ajustes' }));
      await waitFor(() => expect(screen.getByText('verified.test')).toBeTruthy());
      const verifiedText = screen.getByText('verified.test');
      const row = verifiedText.closest('div')?.parentElement?.parentElement as HTMLElement;
      const deleteBtn = row?.querySelector('button');
      if (deleteBtn) fireEvent.click(deleteBtn);
      await flush();
    });

    it('copies DNS record to clipboard', async () => {
      await renderPage();
      fireEvent.click(screen.getByRole('button', { name: 'Ajustes' }));
      await waitFor(() => expect(screen.getByText('pending.test')).toBeTruthy());
      fireEvent.click(screen.getByText('pending.test'));
      await waitFor(() => expect(screen.getByText('Registros DNS')).toBeTruthy());
      const copyBtns = screen.getAllByTitle('Copiar');
      fireEvent.click(copyBtns[0]);
      expect((navigator.clipboard.writeText as any)).toHaveBeenCalled();
    });
  });

  describe('billing tab', () => {
    it('shows live totals', async () => {
      await renderPage();
      fireEvent.click(screen.getByRole('button', { name: 'Facturación' }));
      await waitFor(() => expect(screen.getByText('Totales del periodo actual')).toBeTruthy());
      await waitFor(() => expect(screen.getAllByText('1234').length).toBeGreaterThan(0));
      expect(screen.getByText('567')).toBeTruthy();
    });

    it('shows metered items table', async () => {
      await renderPage();
      fireEvent.click(screen.getByRole('button', { name: 'Facturación' }));
      await waitFor(() => expect(screen.getByText('Artículos medidos de Stripe')).toBeTruthy());
      expect(screen.getByText('active')).toBeTruthy();
      expect(screen.getByText('paused')).toBeTruthy();
    });

    it('shows dry-run preview', async () => {
      await renderPage();
      fireEvent.click(screen.getByRole('button', { name: 'Facturación' }));
      await waitFor(() => expect(screen.getByText('Vista previa del rollup (simulación)')).toBeTruthy());
      expect(screen.getByText('11.840')).toBeTruthy();
    });

    it('shows rollup history', async () => {
      await renderPage();
      fireEvent.click(screen.getByRole('button', { name: 'Facturación' }));
      await waitFor(() => expect(screen.getByText('Rollups recientes')).toBeTruthy());
      expect(screen.getByText('mbur_1')).toBeTruthy();
      // Missing stripeUsageRecordId shows em-dash
      expect(screen.getAllByText('—').length).toBeGreaterThan(0);
    });

    it('shows metered form when "Add metered item" clicked', async () => {
      await renderPage();
      fireEvent.click(screen.getByRole('button', { name: 'Facturación' }));
      await waitFor(() => expect(screen.getByText('Artículos medidos de Stripe')).toBeTruthy());
      fireEvent.click(screen.getByRole('button', { name: /Añadir artículo medido/ }));
      expect(screen.getByPlaceholderText('sub_...')).toBeTruthy();
    });

    it('adds a metered item with valid input', async () => {
      await renderPage();
      fireEvent.click(screen.getByRole('button', { name: 'Facturación' }));
      await waitFor(() => expect(screen.getByText('Artículos medidos de Stripe')).toBeTruthy());
      fireEvent.click(screen.getByRole('button', { name: /Añadir artículo medido/ }));
      const subInput = screen.getByPlaceholderText('sub_...') as HTMLInputElement;
      fireEvent.change(subInput, { target: { value: 'sub_999' } });
      // unitPriceCents input - find the first number input
      const priceInputs = document.querySelectorAll('input[type="number"]');
      fireEvent.change(priceInputs[0], { target: { value: '15' } });
      fireEvent.click(screen.getByRole('button', { name: /Guardar artículo medido/ }));
      await flush();
    });

    it('shows error on invalid unit price', async () => {
      await renderPage();
      fireEvent.click(screen.getByRole('button', { name: 'Facturación' }));
      await waitFor(() => expect(screen.getByText('Artículos medidos de Stripe')).toBeTruthy());
      fireEvent.click(screen.getByRole('button', { name: /Añadir artículo medido/ }));
      const subInput = screen.getByPlaceholderText('sub_...') as HTMLInputElement;
      fireEvent.change(subInput, { target: { value: 'sub_1' } });
      // Provide an empty unit price — submit via the form so HTML validation is bypassed.
      const form = subInput.closest('form') as HTMLFormElement;
      fireEvent.submit(form);
      await waitFor(() => expect(screen.getByText(/unitPriceCents debe ser un entero no negativo/)).toBeTruthy());
    });

    it('shows error on metered POST failure', async () => {
      setFetchHandler((url, init) => {
        if (url === '/api/admin/portal/clients/1/billing/metered-items' && init?.method === 'POST') {
          return jsonResponse({ success: false, message: 'Stripe error' });
        }
        return defaultFetch(url, init);
      });
      await renderPage();
      fireEvent.click(screen.getByRole('button', { name: 'Facturación' }));
      await waitFor(() => expect(screen.getByText('Artículos medidos de Stripe')).toBeTruthy());
      fireEvent.click(screen.getByRole('button', { name: /Añadir artículo medido/ }));
      const subInput = screen.getByPlaceholderText('sub_...') as HTMLInputElement;
      fireEvent.change(subInput, { target: { value: 'sub_999' } });
      const priceInputs = document.querySelectorAll('input[type="number"]');
      fireEvent.change(priceInputs[0], { target: { value: '15' } });
      fireEvent.click(screen.getByRole('button', { name: /Guardar artículo medido/ }));
      await waitFor(() => expect(screen.getByText('Stripe error')).toBeTruthy());
    });

    it('pauses an active metered item', async () => {
      await renderPage();
      fireEvent.click(screen.getByRole('button', { name: 'Facturación' }));
      await waitFor(() => expect(screen.getByText('Artículos medidos de Stripe')).toBeTruthy());
      const pauseBtn = screen.getByTitle('Pausar');
      fireEvent.click(pauseBtn);
      await flush();
    });

    it('resumes a paused metered item', async () => {
      await renderPage();
      fireEvent.click(screen.getByRole('button', { name: 'Facturación' }));
      await waitFor(() => expect(screen.getByText('Artículos medidos de Stripe')).toBeTruthy());
      const resumeBtn = screen.getByTitle('Reanudar');
      fireEvent.click(resumeBtn);
      await flush();
    });

    it('deletes a metered item after confirmation', async () => {
      await renderPage();
      fireEvent.click(screen.getByRole('button', { name: 'Facturación' }));
      await waitFor(() => expect(screen.getByText('Artículos medidos de Stripe')).toBeTruthy());
      const deleteBtns = screen.getAllByTitle('Eliminar');
      fireEvent.click(deleteBtns[0]);
      await flush();
      expect(confirmMock).toHaveBeenCalled();
    });

    it('runs dry-run rollup', async () => {
      await renderPage();
      fireEvent.click(screen.getByRole('button', { name: 'Facturación' }));
      await waitFor(() => expect(screen.getByText('Vista previa del rollup (simulación)')).toBeTruthy());
      fireEvent.click(screen.getByRole('button', { name: /Volver a simular/ }));
      await waitFor(() => expect(screen.getByText(/Simulación calculada/)).toBeTruthy());
    });

    it('runs production rollup after confirmation', async () => {
      await renderPage();
      fireEvent.click(screen.getByRole('button', { name: 'Facturación' }));
      await waitFor(() => expect(screen.getByText('Vista previa del rollup (simulación)')).toBeTruthy());
      fireEvent.click(screen.getByRole('button', { name: /Ejecutar rollup ahora/ }));
      await waitFor(() => expect(screen.getByText(/Enviados/)).toBeTruthy());
    });

    it('shows error when rollup fails', async () => {
      setFetchHandler((url, init) => {
        if (url === '/api/admin/portal/clients/1/billing/usage' && init?.method === 'POST') {
          return jsonResponse({ success: false, message: 'Boom' });
        }
        return defaultFetch(url, init);
      });
      await renderPage();
      fireEvent.click(screen.getByRole('button', { name: 'Facturación' }));
      await waitFor(() => expect(screen.getByText('Vista previa del rollup (simulación)')).toBeTruthy());
      fireEvent.click(screen.getByRole('button', { name: /Volver a simular/ }));
      await waitFor(() => expect(screen.getByText('Boom')).toBeTruthy());
    });
  });

  describe('team tab', () => {
    it('shows add member form', async () => {
      await renderPage();
      fireEvent.click(screen.getByRole('button', { name: 'Equipo' }));
      await waitFor(() => expect(screen.getByText('Miembros del equipo')).toBeTruthy());
      fireEvent.click(screen.getByRole('button', { name: /Añadir miembro/ }));
      expect(screen.getByText('Nombre completo *')).toBeTruthy();
    });

    it('adds a new team member', async () => {
      await renderPage();
      fireEvent.click(screen.getByRole('button', { name: 'Equipo' }));
      await waitFor(() => expect(screen.getByText('Miembros del equipo')).toBeTruthy());
      fireEvent.click(screen.getByRole('button', { name: /Añadir miembro/ }));
      const nameInput = screen.getByText('Nombre completo *').nextElementSibling as HTMLInputElement;
      fireEvent.change(nameInput, { target: { value: 'New Person' } });
      const emailInput = screen.getByText('Correo *').nextElementSibling as HTMLInputElement;
      fireEvent.change(emailInput, { target: { value: 'new@x.com' } });
      const passwordInput = screen.getByText('Contraseña *').nextElementSibling as HTMLInputElement;
      fireEvent.change(passwordInput, { target: { value: 'secret' } });
      fireEvent.click(screen.getByRole('button', { name: /^Añadir miembro$/i }));
      await waitFor(() => expect(screen.queryByText('New Person')).toBeTruthy());
    });

    it('shows error when add member fails', async () => {
      setFetchHandler((url, init) => {
        if (url === '/api/admin/portal/clients/1/members' && init?.method === 'POST') {
          return jsonResponse({ success: false, message: 'Email taken' });
        }
        return defaultFetch(url, init);
      });
      await renderPage();
      fireEvent.click(screen.getByRole('button', { name: 'Equipo' }));
      await waitFor(() => expect(screen.getByText('Miembros del equipo')).toBeTruthy());
      fireEvent.click(screen.getByRole('button', { name: /Añadir miembro/ }));
      const nameInput = screen.getByText('Nombre completo *').nextElementSibling as HTMLInputElement;
      fireEvent.change(nameInput, { target: { value: 'X' } });
      const emailInput = screen.getByText('Correo *').nextElementSibling as HTMLInputElement;
      fireEvent.change(emailInput, { target: { value: 'x@x.com' } });
      const passwordInput = screen.getByText('Contraseña *').nextElementSibling as HTMLInputElement;
      fireEvent.change(passwordInput, { target: { value: 'secret' } });
      fireEvent.click(screen.getByRole('button', { name: /^Añadir miembro$/i }));
      await waitFor(() => expect(screen.getByText('Email taken')).toBeTruthy());
    });

    it('removes a team member', async () => {
      await renderPage();
      fireEvent.click(screen.getByRole('button', { name: 'Equipo' }));
      await waitFor(() => expect(screen.getByText('Bob')).toBeTruthy());
      // Bob is non-owner so should have person_remove button next to him
      const bobRow = screen.getByText('Bob').closest('div')?.parentElement as HTMLElement;
      const removeBtn = bobRow?.querySelector('button');
      if (removeBtn) fireEvent.click(removeBtn);
      await waitFor(() => expect(screen.queryByText('Bob')).toBeNull());
    });

    it('shows "inactive" badge for inactive members', async () => {
      await renderPage();
      fireEvent.click(screen.getByRole('button', { name: 'Equipo' }));
      await waitFor(() => expect(screen.getByText('inactivo')).toBeTruthy());
    });

    it('hides remove button for owner', async () => {
      await renderPage();
      fireEvent.click(screen.getByRole('button', { name: 'Equipo' }));
      await waitFor(() => expect(screen.getByText('owner')).toBeTruthy());
    });
  });

  describe('email marketing tab', () => {
    it('shows campaign open rate', async () => {
      await renderPage();
      fireEvent.click(screen.getByRole('button', { name: 'Email marketing' }));
      await waitFor(() => expect(screen.getByText('Spring')).toBeTruthy());
      // 100/200 = 50%
      expect(screen.getByText('50%')).toBeTruthy();
    });

    it('shows new list form', async () => {
      await renderPage();
      fireEvent.click(screen.getByRole('button', { name: 'Email marketing' }));
      await waitFor(() => expect(screen.getByText('Listas de suscriptores')).toBeTruthy());
      fireEvent.click(screen.getByRole('button', { name: /Nueva lista/ }));
      expect(screen.getByPlaceholderText('Nombre de la lista')).toBeTruthy();
    });

    it('creates a new list', async () => {
      await renderPage();
      fireEvent.click(screen.getByRole('button', { name: 'Email marketing' }));
      await waitFor(() => expect(screen.getAllByText('Newsletter').length).toBeGreaterThan(0));
      fireEvent.click(screen.getByRole('button', { name: /Nueva lista/ }));
      fireEvent.change(screen.getByPlaceholderText('Nombre de la lista'), { target: { value: 'My List' } });
      fireEvent.click(screen.getByRole('button', { name: 'Crear' }));
      await flush();
    });

    it('opens a list and shows subscribers', async () => {
      await renderPage();
      fireEvent.click(screen.getByRole('button', { name: 'Email marketing' }));
      await waitFor(() => expect(screen.getAllByText('Newsletter').length).toBeGreaterThan(0));
      // Click the first Newsletter occurrence (the list-row paragraph)
      fireEvent.click(screen.getAllByText('Newsletter')[0]);
      await waitFor(() => expect(screen.getByText('a@x.com')).toBeTruthy());
      expect(screen.getByText('b@x.com')).toBeTruthy();
    });

    it('adds a subscriber', async () => {
      await renderPage();
      fireEvent.click(screen.getByRole('button', { name: 'Email marketing' }));
      await waitFor(() => expect(screen.getAllByText('Newsletter').length).toBeGreaterThan(0));
      fireEvent.click(screen.getAllByText('Newsletter')[0]);
      await waitFor(() => expect(screen.getByPlaceholderText('Correo')).toBeTruthy());
      fireEvent.change(screen.getByPlaceholderText('Correo'), { target: { value: 'new@x.com' } });
      fireEvent.change(screen.getByPlaceholderText('Nombre'), { target: { value: 'New' } });
      const form = screen.getByPlaceholderText('Correo').closest('form') as HTMLFormElement;
      fireEvent.submit(form);
      await flush();
    });

    it('removes a subscriber', async () => {
      await renderPage();
      fireEvent.click(screen.getByRole('button', { name: 'Email marketing' }));
      await waitFor(() => expect(screen.getAllByText('Newsletter').length).toBeGreaterThan(0));
      fireEvent.click(screen.getAllByText('Newsletter')[0]);
      await waitFor(() => expect(screen.getByText('a@x.com')).toBeTruthy());
      const aRow = screen.getByText('a@x.com').closest('div')?.parentElement as HTMLElement;
      const removeBtn = aRow?.querySelector('button');
      if (removeBtn) fireEvent.click(removeBtn);
      await waitFor(() => expect(screen.queryByText('a@x.com')).toBeNull());
    });

    it('deletes a list', async () => {
      await renderPage();
      fireEvent.click(screen.getByRole('button', { name: 'Email marketing' }));
      await waitFor(() => expect(screen.getAllByText('Newsletter').length).toBeGreaterThan(0));
      // First Newsletter is the list paragraph; click its delete sibling
      const listText = screen.getAllByText('Newsletter')[0];
      const row = listText.closest('div')?.parentElement as HTMLElement;
      const deleteBtn = row?.querySelector('button');
      if (deleteBtn) fireEvent.click(deleteBtn);
      await flush();
      expect(confirmMock).toHaveBeenCalled();
    });

    it('shows new campaign form', async () => {
      await renderPage();
      fireEvent.click(screen.getByRole('button', { name: 'Email marketing' }));
      await waitFor(() => expect(screen.getByText('Campañas')).toBeTruthy());
      fireEvent.click(screen.getByRole('button', { name: /Nueva campaña/ }));
      expect(screen.getByText('Nombre interno *')).toBeTruthy();
    });

    it('creates a new campaign', async () => {
      await renderPage();
      fireEvent.click(screen.getByRole('button', { name: 'Email marketing' }));
      await waitFor(() => expect(screen.getByText('Campañas')).toBeTruthy());
      fireEvent.click(screen.getByRole('button', { name: /Nueva campaña/ }));
      const internalNameInput = screen.getByText('Nombre interno *').nextElementSibling as HTMLInputElement;
      fireEvent.change(internalNameInput, { target: { value: 'My Campaign' } });
      const subjectInput = screen.getByText('Asunto *').nextElementSibling as HTMLInputElement;
      fireEvent.change(subjectInput, { target: { value: 'Hi' } });
      const fromNameInput = screen.getByText('Nombre del remitente *').nextElementSibling as HTMLInputElement;
      fireEvent.change(fromNameInput, { target: { value: 'Sender' } });
      const fromEmailInput = screen.getByText('Correo del remitente *').nextElementSibling as HTMLInputElement;
      fireEvent.change(fromEmailInput, { target: { value: 's@x.com' } });
      const listSelect = screen.getByText('Lista *').nextElementSibling as HTMLSelectElement;
      fireEvent.change(listSelect, { target: { value: '10' } });
      const htmlTextarea = screen.getByPlaceholderText(/Hola/) as HTMLTextAreaElement;
      fireEvent.change(htmlTextarea, { target: { value: '<p>hi</p>' } });
      fireEvent.click(screen.getByRole('button', { name: /^Crear campaña$/i }));
      await flush();
    });

    it('shows error on campaign create failure', async () => {
      setFetchHandler((url, init) => {
        if (url === '/api/admin/email/campaigns' && init?.method === 'POST') {
          return jsonResponse({ success: false, message: 'Validation failed' });
        }
        return defaultFetch(url, init);
      });
      await renderPage();
      fireEvent.click(screen.getByRole('button', { name: 'Email marketing' }));
      await waitFor(() => expect(screen.getByText('Campañas')).toBeTruthy());
      fireEvent.click(screen.getByRole('button', { name: /Nueva campaña/ }));
      const internalNameInput = screen.getByText('Nombre interno *').nextElementSibling as HTMLInputElement;
      fireEvent.change(internalNameInput, { target: { value: 'X' } });
      const subjectInput = screen.getByText('Asunto *').nextElementSibling as HTMLInputElement;
      fireEvent.change(subjectInput, { target: { value: 'Y' } });
      const fromNameInput = screen.getByText('Nombre del remitente *').nextElementSibling as HTMLInputElement;
      fireEvent.change(fromNameInput, { target: { value: 'Z' } });
      const fromEmailInput = screen.getByText('Correo del remitente *').nextElementSibling as HTMLInputElement;
      fireEvent.change(fromEmailInput, { target: { value: 'a@x.com' } });
      const listSelect = screen.getByText('Lista *').nextElementSibling as HTMLSelectElement;
      fireEvent.change(listSelect, { target: { value: '10' } });
      const htmlTextarea = screen.getByPlaceholderText(/Hola/) as HTMLTextAreaElement;
      fireEvent.change(htmlTextarea, { target: { value: '<p>hi</p>' } });
      fireEvent.click(screen.getByRole('button', { name: /^Crear campaña$/i }));
      await waitFor(() => expect(screen.getByText('Validation failed')).toBeTruthy());
    });

    it('alerts when trying to delete a sending campaign', async () => {
      await renderPage();
      fireEvent.click(screen.getByRole('button', { name: 'Email marketing' }));
      await waitFor(() => expect(screen.getByText('Send Out')).toBeTruthy());
      // Find Send Out row, click its delete
      const row = screen.getByText('Send Out').closest('tr') as HTMLElement;
      const deleteBtns = row.querySelectorAll('button');
      // Last button in actions cell is delete
      fireEvent.click(deleteBtns[deleteBtns.length - 1]);
      expect(alertMock).toHaveBeenCalledWith('No se puede eliminar una campaña en envío.');
    });

    it('deletes a non-sending campaign', async () => {
      await renderPage();
      fireEvent.click(screen.getByRole('button', { name: 'Email marketing' }));
      await waitFor(() => expect(screen.getByText('Spring')).toBeTruthy());
      const row = screen.getByText('Spring').closest('tr') as HTMLElement;
      const buttons = row.querySelectorAll('button');
      fireEvent.click(buttons[buttons.length - 1]);
      await flush();
      expect(confirmMock).toHaveBeenCalled();
    });
  });
});
