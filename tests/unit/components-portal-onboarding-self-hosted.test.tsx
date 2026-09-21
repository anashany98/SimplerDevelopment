// @vitest-environment jsdom

import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { StepChooseModules } from '@/components/portal/onboarding/steps/StepChooseModules';
import { StepPayment } from '@/components/portal/onboarding/steps/StepPayment';
import type { OnboardingState } from '@/lib/onboarding/types';

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@/components/portal/billing/verify-checkout-session', () => ({
  verifyCheckoutSession: vi.fn(),
}));

function makeState(step: OnboardingState['step']): OnboardingState {
  return {
    step,
    answers: {
      timezone: 'Europe/Madrid',
      selectedModules: ['bundle'],
    },
    completedAt: null,
    prefill: {
      name: 'Local User',
      email: 'local@example.invalid',
      company: 'Local Workspace',
      website: '',
    },
    showBillingSteps: true,
  };
}

function makeProps(step: OnboardingState['step']) {
  return {
    state: makeState(step),
    setAnswers: vi.fn(),
    persist: vi.fn(async () => {}),
    next: vi.fn(),
    back: vi.fn(),
    goTo: vi.fn(),
    finish: vi.fn(async () => {}),
  };
}

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.unstubAllGlobals();
});

describe('self-hosted onboarding', () => {
  it('presents activation instead of a paid trial on the confirmation step', () => {
    const { container } = render(
      <StepPayment {...makeProps('payment')} stripeEnabled={false} />,
    );

    expect(screen.getByRole('button', { name: /continuar sin pago/i })).toBeTruthy();
    expect(screen.getByTestId('onboarding-payment-unconfigured')).toBeTruthy();
    expect(screen.queryByText(/prueba gratis de 14 días/i)).toBeNull();
    expect(screen.getAllByText('Incluido').length).toBeGreaterThan(0);
    expect(container.textContent).not.toContain('/mo');
  });

  it('shows modules as included and removes hosted pricing language', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      json: async () => ({
        success: true,
        data: {
          modules: [
            {
              key: 'websites',
              slug: 'module-websites',
              name: 'Websites',
              tagline: 'Build and publish sites.',
              icon: 'language',
              monthlyPriceCents: 2900,
              purchasable: true,
            },
          ],
        },
      }),
    })));

    const { container } = render(
      <StepChooseModules {...makeProps('choose-modules')} stripeEnabled={false} />,
    );

    await waitFor(() => expect(screen.queryByText('Cargando módulos…')).toBeNull());
    expect(screen.getAllByText('Incluido').length).toBeGreaterThan(0);
    expect(screen.getByText(/no se requiere suscripción ni tarjeta/i)).toBeTruthy();
    expect(screen.queryByText(/tras tu prueba gratuita de 14 días/i)).toBeNull();
    expect(screen.queryByText(/contacta con ventas/i)).toBeNull();
    expect(container.textContent).not.toContain('/mo');
  });
});
