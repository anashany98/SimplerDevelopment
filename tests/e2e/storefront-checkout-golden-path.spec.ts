/**
 * Storefront checks while customer payments are disabled (@ecommerce @critical).
 *
 * `PAYMENTS_DISABLED` deliberately blocks checkout before reading the cart or
 * resolving Stripe. Pin that contract without a Stripe key, and keep the
 * non-payment inventory guard covered independently.
 */
import { test, expect } from './setup/fixtures';
import { runCleanups, createTestWebsite } from './setup/helpers';

async function provisionStore(
  clientApi: Parameters<typeof createTestWebsite>[0],
  cleanups: Array<() => Promise<void>>,
): Promise<number> {
  const { website, cleanup } = await createTestWebsite(clientApi);
  cleanups.push(cleanup);
  const siteId = (website as { id: number }).id;

  const settings = await clientApi.put(`/api/portal/websites/${siteId}/store/settings`, {
    enabled: true,
    storeName: 'E2E Disabled Payments Store',
    taxRate: 0,
    taxInclusive: false,
  });
  expect(settings.status, 'store settings must be created').toBe(200);
  return siteId;
}

async function createProduct(
  clientApi: Parameters<typeof createTestWebsite>[0],
  siteId: number,
  cleanups: Array<() => Promise<void>>,
  overrides: Record<string, unknown> = {},
) {
  const ts = Date.now();
  const res = await clientApi.post(`/api/portal/websites/${siteId}/store/products`, {
    name: `E2E Store Product ${ts}`,
    slug: `e2e-store-${ts}`,
    price: 2500,
    status: 'active',
    trackInventory: false,
    ...overrides,
  });
  expect(res.status, 'product fixture must be created').toBe(201);

  const product = res.data.data as { id: number };
  cleanups.push(async () => {
    await clientApi.delete(`/api/portal/websites/${siteId}/store/products/${product.id}`).catch(() => {});
  });
  return product;
}

test.describe('Storefront while customer payments are disabled @ecommerce @critical', () => {
  test('checkout returns the configured disabled response without Stripe credentials', async ({
    clientApi,
    unauthApi,
  }) => {
    const cleanups: Array<() => Promise<void>> = [];
    try {
      const siteId = await provisionStore(clientApi, cleanups);
      const res = await unauthApi.post(`/api/storefront/${siteId}/checkout`, {
        sessionId: `e2e-disabled-checkout-${Date.now()}`,
        customerEmail: 'buyer@example.com',
        customerName: 'E2E Buyer',
      });

      expect(res.status).toBe(503);
      expect(res.data).toMatchObject({
        success: false,
        message: 'Payments are disabled.',
      });
    } finally {
      await runCleanups(cleanups);
    }
  });

  test('cart still refuses to oversell a tracked product', async ({
    clientApi,
    unauthApi,
  }) => {
    const cleanups: Array<() => Promise<void>> = [];
    try {
      const siteId = await provisionStore(clientApi, cleanups);
      const product = await createProduct(clientApi, siteId, cleanups, {
        trackInventory: true,
        quantity: 1,
      });

      const res = await unauthApi.post(`/api/storefront/${siteId}/cart`, {
        sessionId: `e2e-oversell-${Date.now()}`,
        productId: product.id,
        quantity: 5,
      });

      expect(res.status).toBe(400);
      expect(res.data.message).toMatch(/stock/i);
    } finally {
      await runCleanups(cleanups);
    }
  });
});
