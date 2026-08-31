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
    expect(await screen.findByRole('heading', { name: 'Meta app configuration' })).toBeTruthy();
    expect(screen.getByLabelText('Meta App Secret')).toHaveAttribute('type', 'password');
    expect(screen.getByLabelText('Webhook verify token')).toHaveAttribute('type', 'password');
    for (const button of screen.getAllByRole('button', { name: 'Connect' })) expect(button).toBeDisabled();
    expect(screen.getByText('http://localhost:3000/api/portal/channels/meta/callback')).toBeTruthy();
  });

  it('saves through the tenant API, enables Connect, and clears secret inputs', async () => {
    await act(async () => { render(<ChannelsSettingsPage />); });
    await screen.findByRole('heading', { name: 'Meta app configuration' });
    fireEvent.change(screen.getByLabelText('Meta App ID'), { target: { value: '1234567890' } });
    fireEvent.change(screen.getByLabelText('Login configuration ID'), { target: { value: '9876543210' } });
    fireEvent.change(screen.getByLabelText('Meta App Secret'), { target: { value: '0123456789abcdef0123456789abcdef' } });
    fireEvent.change(screen.getByLabelText('Webhook verify token'), { target: { value: 'a-private-verify-token' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save configuration' }));

    await screen.findByText('Meta configuration saved securely. You can now connect WhatsApp.');
    expect(screen.getByLabelText('Meta App Secret')).toHaveValue('');
    expect(screen.getByLabelText('Webhook verify token')).toHaveValue('');
    await waitFor(() => {
      for (const button of screen.getAllByRole('button', { name: 'Connect' })) expect(button).toBeEnabled();
    });
    const putCall = vi.mocked(globalThis.fetch).mock.calls.find(([, init]) => init?.method === 'PUT');
    expect(putCall).toBeTruthy();
    expect(JSON.parse(String(putCall?.[1]?.body))).toMatchObject({ appId: '1234567890', loginConfigId: '9876543210' });
  });
});
