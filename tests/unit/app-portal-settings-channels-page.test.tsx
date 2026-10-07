// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ChannelsSettingsPage from '@/app/portal/settings/channels/page';

const emptyConfig = {
  configured: false,
  source: 'none',
  appId: '',
  loginConfigId: '',
  hasAppSecret: false,
  hasWebhookVerifyToken: false,
  callbackUrl: 'http://localhost:3000/api/portal/channels/meta/callback',
  webhookUrl: 'http://localhost:3000/api/webhooks/meta',
};

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

beforeEach(() => {
  vi.restoreAllMocks();
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url === '/api/portal/channels') return jsonResponse({ success: true, data: [] });
    if (url === '/api/portal/channels/meta/config' && init?.method === 'PUT') {
      const body = JSON.parse(String(init.body)) as Record<string, string>;
      return jsonResponse({ success: true, data: {
        ...emptyConfig,
        configured: true,
        source: 'tenant',
        appId: body.appId,
        loginConfigId: body.loginConfigId,
        hasAppSecret: true,
        hasWebhookVerifyToken: true,
        webhookUrl: 'http://localhost:3000/api/webhooks/meta?config=aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',
      } });
    }
    if (url === '/api/portal/channels/meta/config') return jsonResponse({ success: true, data: emptyConfig });
    return jsonResponse({ success: false, message: 'Unexpected request' }, 500);
  });
});

describe('Channels settings Meta configuration', () => {
  it('renders provider configuration in Channels and keeps Connect disabled until configured', async () => {
    await act(async () => { render(<ChannelsSettingsPage />); });
    expect(await screen.findByRole('heading', { name: 'Configuración de la app de Meta' })).toBeTruthy();
    expect(screen.getByLabelText('Secreto de la app de Meta')).toHaveAttribute('type', 'password');
    expect(screen.getByLabelText('Token de verificación del webhook')).toHaveAttribute('type', 'password');
    for (const button of screen.getAllByRole('button', { name: 'Conectar' })) expect(button).toBeDisabled();
    // The callback URL arrives with the async config fetch — wait for it
    // instead of assuming the state update already landed.
    expect(
      await screen.findByText('http://localhost:3000/api/portal/channels/meta/callback'),
    ).toBeTruthy();
  });

  it('saves through the tenant API, enables Connect, and clears secret inputs', async () => {
    await act(async () => { render(<ChannelsSettingsPage />); });
    await screen.findByRole('heading', { name: 'Configuración de la app de Meta' });
    fireEvent.change(screen.getByLabelText('ID de la app de Meta'), { target: { value: '1234567890' } });
    fireEvent.change(screen.getByLabelText('ID de configuración de inicio de sesión'), { target: { value: '9876543210' } });
    fireEvent.change(screen.getByLabelText('Secreto de la app de Meta'), { target: { value: '0123456789abcdef0123456789abcdef' } });
    fireEvent.change(screen.getByLabelText('Token de verificación del webhook'), { target: { value: 'a-private-verify-token' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar configuración' }));

    await screen.findByText('Configuración de Meta guardada de forma segura. Ya puedes conectar WhatsApp.');
    expect(screen.getByLabelText('Secreto de la app de Meta')).toHaveValue('');
    expect(screen.getByLabelText('Token de verificación del webhook')).toHaveValue('');
    await waitFor(() => {
      for (const button of screen.getAllByRole('button', { name: 'Conectar' })) expect(button).toBeEnabled();
    });
    const putCall = vi.mocked(globalThis.fetch).mock.calls.find(([, init]) => init?.method === 'PUT');
    expect(putCall).toBeTruthy();
    expect(JSON.parse(String(putCall?.[1]?.body))).toMatchObject({ appId: '1234567890', loginConfigId: '9876543210' });
  });
});
