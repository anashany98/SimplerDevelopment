function host(value: string): string | null {
  try {
    const url = value.includes('://') ? new URL(value) : new URL(`https://${value}`);
    return url.hostname.toLowerCase().replace(/\.$/, '');
  } catch { return null; }
}

/** Supports exact hosts, `*` (any origin — set deliberately per widget), and
 *  explicit `*.example.com` wildcards. */
export function isAllowedWidgetOrigin(origin: string | null | undefined, allowlist: string[]): boolean {
  if (allowlist.length === 0) return true; // legacy widgets migrate without an outage
  if (allowlist.some((entry) => entry.trim() === '*')) return true; // explicit any-site embed
  const candidate = origin ? host(origin) : null;
  if (!candidate) return false;
  return allowlist.some((entry) => {
    const normalized = entry.trim().toLowerCase();
    if (normalized.startsWith('*.')) {
      const suffix = normalized.slice(2);
      return candidate.endsWith(`.${suffix}`) && candidate !== suffix;
    }
    return candidate === host(normalized);
  });
}
