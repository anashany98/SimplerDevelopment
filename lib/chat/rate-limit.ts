/**
 * Visitor message rate limit — token-bucket-ish, in-memory.
 *
 * Two-layer setup (see app/api/public/chat/messages/route.ts): this fast
 * per-instance window runs FIRST because it returns a precise `retryAfter`
 * for the 429 response; the shared Upstash-backed `checkRateLimit` from
 * lib/security/rate-limit.ts runs SECOND as the global gate across
 * serverless instances (with its own in-memory fallback in dev). Do NOT
 * remove this layer thinking the shared one covers it — the shared one
 * returns boolean only, so the precise Retry-After header would be lost.
 * Conversely, do NOT rely on this layer alone in production — per-instance
 * counters don't sum across instances; the shared gate is the real global
 * limit.
 */

const WINDOW_MS = 10_000; // 10s sliding window
const MAX_HITS = 10;      // 10 messages per visitor per 10s

const hits = new Map<string, number[]>();

export interface RateLimitResult {
  ok: boolean;
  /** Seconds until the next attempt is allowed when ok=false. */
  retryAfter?: number;
}

export function checkVisitorRateLimit(key: string, now: number = Date.now()): RateLimitResult {
  const cutoff = now - WINDOW_MS;
  const existing = hits.get(key) ?? [];
  const recent = existing.filter((t) => t > cutoff);
  if (recent.length >= MAX_HITS) {
    const oldest = recent[0];
    return { ok: false, retryAfter: Math.max(1, Math.ceil((oldest + WINDOW_MS - now) / 1000)) };
  }
  recent.push(now);
  hits.set(key, recent);
  // Periodic GC — cheap enough at request-rate scale.
  if (hits.size > 5_000) {
    for (const [k, v] of hits) {
      const trimmed = v.filter((t) => t > cutoff);
      if (trimmed.length === 0) hits.delete(k);
      else hits.set(k, trimmed);
    }
  }
  return { ok: true };
}

/** Test-only — clear the in-memory state between cases. */
export function __resetRateLimit() {
  hits.clear();
}
