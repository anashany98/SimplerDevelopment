function isPrivateHost(hostname: string): boolean {
  return hostname === 'localhost'
    || hostname === '0.0.0.0'
    || hostname === '127.0.0.1'
    || hostname === '::1'
    || /^127\./.test(hostname)
    || /^10\./.test(hostname)
    || /^192\.168\./.test(hostname)
    || /^172\.(1[6-9]|2\d|3[01])\./.test(hostname)
    || /^169\.254\./.test(hostname)
    || /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(hostname)
    || /^(fc|fd|fe8|fe9|fea|feb)/i.test(hostname.replace(/^\[|\]$/g, ''))
    || hostname.endsWith('.local')
    || hostname === 'metadata.google.internal';
}

/** Fail-closed SSRF boundary for tenant-controlled inference endpoints. */
export function validateAiBaseUrl(value: string): URL {
  const url = new URL(value);
  const explicit = new Set((process.env.AI_COMPATIBLE_ALLOWED_HOSTS ?? '')
    .split(',').map((host) => host.trim().toLowerCase().replace(/\.$/, '')).filter(Boolean));
  const hostname = url.hostname.toLowerCase().replace(/\.$/, '');
  const localDev = (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1')
    && process.env.NODE_ENV !== 'production';
  if (url.username || url.password) throw new Error('AI base URL cannot contain credentials');
  if (url.protocol !== 'https:' && !localDev) {
    throw new Error('AI base URL must use HTTPS (localhost HTTP is development-only)');
  }
  // In production this URL comes from tenant configuration. Require an
  // operator-managed hostname allowlist before any DNS lookup or request can
  // occur, which removes arbitrary public hosts and DNS-rebinding targets from
  // the tenant-controlled input surface.
  if (process.env.NODE_ENV === 'production' && !explicit.has(hostname)) {
    throw new Error('Production AI host must be explicitly allowlisted');
  }
  if (isPrivateHost(hostname) && !localDev && !explicit.has(hostname)) {
    throw new Error('Private AI host must be explicitly allowlisted');
  }
  url.hash = '';
  url.pathname = url.pathname.replace(/\/$/, '');
  return url;
}
