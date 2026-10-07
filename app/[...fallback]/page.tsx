import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';

/**
 * Root fallback for path-based client-site browsing.
 *
 * When a site is browsed through its internal `/sites/<domain>/…` path (the
 * platform's own preview iframes, approval previews, and white-label/dev
 * hosts), the site renderers emit root-relative links (`/shop`, `/cart`,
 * `/blog/…`) that resolve against the APP root instead of the site and 404.
 *
 * The middleware leaves an `sd_site_base` cookie while serving those pages
 * (see middleware.ts, app-host `/sites/` branch). This catch-all only runs for
 * paths no real route matched, so it re-prefixes the requested path with that
 * base and sends the visitor to the right page. Without the cookie it behaves
 * exactly like the previous 404 (renders app/not-found.tsx).
 */
export default async function RootFallbackPage({
  params,
  searchParams,
}: {
  params: Promise<{ fallback: string[] }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { fallback } = await params;
  const sp = await searchParams;
  const base = (await cookies()).get('sd_site_base')?.value;

  if (base && /^\/sites\/[^/]+$/.test(base)) {
    const qs = new URLSearchParams();
    for (const [key, value] of Object.entries(sp)) {
      // `_rsc` is a framework param for prefetches — never forward it.
      if (key === '_rsc') continue;
      if (typeof value === 'string') qs.set(key, value);
      else if (Array.isArray(value) && typeof value[0] === 'string') qs.set(key, value[0]);
    }
    const query = qs.toString();
    redirect(`${base}/${fallback.join('/')}${query ? `?${query}` : ''}`);
  }

  notFound();
}
