// @vitest-environment jsdom
/**
 * Unit tests for app/portal/PortalShell.tsx — the pre-onboarding gate.
 *
 * An authenticated user with no portal client used to reach module pages whose
 * data calls 404 ("Client not found"), rendering error cards on first contact.
 * PortalShell now redirects them to the wizard, except on auth-flow pages.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const H = vi.hoisted(() => ({
  session: null as unknown,
  client: null as unknown,
  pathname: '/portal/crm',
  redirectMock: vi.fn(),
}));

vi.mock('next/headers', () => ({
  cookies: async () => new Map(),
  headers: async () => ({
    get: (key: string) => (key === 'x-pathname' ? H.pathname : null),
  }),
}));

vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    H.redirectMock(url);
    throw new Error('NEXT_REDIRECT');
  },
}));

vi.mock('@/lib/auth', () => ({ auth: async () => H.session }));
vi.mock('@/lib/portal-client', () => ({ getPortalClient: async () => H.client }));
vi.mock('@/lib/plugins/load-user-apps', () => ({ loadUserApps: async () => [] }));
vi.mock('@/lib/billing/entitlements', () => ({
  getClientEntitlements: async () => ({ domains: [], gatingBypassed: true }),
}));
vi.mock('@/app/portal/PortalLayoutClient', () => ({
  default: ({ children }: { children: React.ReactNode }) =>
    React.createElement('div', null, children),
}));

import PortalShell from '@/app/portal/PortalShell';

async function renderShell() {
  try {
    await PortalShell({ children: 'content' as unknown as React.ReactNode });
  } catch (e) {
    // redirect() throws NEXT_REDIRECT in real Next; the mock mimics that.
    if (!(e instanceof Error) || e.message !== 'NEXT_REDIRECT') throw e;
  }
}

beforeEach(() => {
  H.redirectMock.mockReset();
  H.session = { user: { id: '4' } };
  H.client = { id: 2 };
  H.pathname = '/portal/crm';
});

describe('PortalShell pre-onboarding gate', () => {
  it('redirects a clientless user from a module page to onboarding', async () => {
    H.client = null;
    await renderShell();
    expect(H.redirectMock).toHaveBeenCalledWith('/portal/onboarding');
  });

  it('does not redirect on the onboarding page itself (no loop)', async () => {
    H.client = null;
    H.pathname = '/portal/onboarding';
    await renderShell();
    expect(H.redirectMock).not.toHaveBeenCalled();
  });

  it('does not redirect on auth-flow pages', async () => {
    H.client = null;
    H.pathname = '/portal/login';
    await renderShell();
    expect(H.redirectMock).not.toHaveBeenCalled();
  });

  it('does not redirect when the user has a portal client', async () => {
    await renderShell();
    expect(H.redirectMock).not.toHaveBeenCalled();
  });

  it('does not redirect unauthenticated visitors', async () => {
    H.session = null;
    H.client = null;
    await renderShell();
    expect(H.redirectMock).not.toHaveBeenCalled();
  });

  it('fails open when the pathname header is missing', async () => {
    H.client = null;
    H.pathname = '';
    await renderShell();
    expect(H.redirectMock).not.toHaveBeenCalled();
  });
});
