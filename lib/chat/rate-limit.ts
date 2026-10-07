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

import { MemoryRateLimiter } from '@/lib/security/memory-rate-limit';

const WINDOW_MS = 10_000; // 10s sliding window
const MAX_HITS = 10;      // 10 messages per visitor per 10s

const hits = new MemoryRateLimiter();

export interface RateLimitResult {
  ok: boolean;
  /** Seconds until the next attempt is allowed when ok=false. */
  retryAfter?: number;
}

export function checkVisitorRateLimit(key: string, now: number = Date.now()): RateLimitResult {
  const retryMs = hits.check(key, MAX_HITS, WINDOW_MS, now);
  return retryMs === 0 ? { ok: true } : { ok: false, retryAfter: Math.ceil(retryMs / 1000) };
}

/** Test-only — clear the in-memory state between cases. */
export function __resetRateLimit() {
  hits.clear();
}
