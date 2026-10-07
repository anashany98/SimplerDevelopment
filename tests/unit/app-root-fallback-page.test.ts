// @vitest-environment node
/**
 * Root fallback for path-based client-site browsing.
 *
 * The middleware leaves an `sd_site_base` cookie while serving
 * `/sites/<domain>/…` pages on the app host; the fallback re-prefixes
 * site-relative links (`/shop`, `/cart`, …) that would otherwise 404 against
 * the app root. Without the cookie it must behave like the previous 404.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const cookieGet = vi.fn();

vi.mock('next/headers', () => ({
  cookies: async () => ({ get: cookieGet }),
}));

vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw Object.assign(new Error('NEXT_REDIRECT'), { redirectUrl: url });
  },
  notFound: () => {
    throw Object.assign(new Error('NEXT_NOT_FOUND'), {});
  },
}));

import RootFallbackPage from '@/app/[...fallback]/page';

function run(fallback: string[], sp: Record<string, string | string[]> = {}) {
  return RootFallbackPage({
    params: Promise.resolve({ fallback }),
    searchParams: Promise.resolve(sp),
  });
}

describe('root [...fallback] page', () => {
  beforeEach(() => cookieGet.mockReset());

  it('redirects into the site base when the middleware cookie is present', async () => {
    cookieGet.mockReturnValue({ value: '/sites/demo-web.anaxia.tech' });
    await expect(run(['shop', 'producto-qa-loop'])).rejects.toMatchObject({
      redirectUrl: '/sites/demo-web.anaxia.tech/shop/producto-qa-loop',
    });
  });

  it('preserves query params but drops the framework _rsc param', async () => {
    cookieGet.mockReturnValue({ value: '/sites/foo.com' });
    await expect(run(['shop'], { category: 'camisetas', _rsc: 'abc' })).rejects.toMatchObject({
      redirectUrl: '/sites/foo.com/shop?category=camisetas',
    });
  });

  it('404s without the cookie', async () => {
    cookieGet.mockReturnValue(undefined);
    await expect(run(['shop'])).rejects.toMatchObject({ message: 'NEXT_NOT_FOUND' });
  });

  it('404s when the cookie value is not a /sites/ base', async () => {
    cookieGet.mockReturnValue({ value: 'https://evil.example' });
    await expect(run(['shop'])).rejects.toMatchObject({ message: 'NEXT_NOT_FOUND' });
  });
});
