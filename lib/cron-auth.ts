// Shared cron auth check. The Vercel cron header is not an authentication
// credential: callers can send it themselves. Require the configured secret
// on every path, including Vercel-triggered requests.

import type { NextRequest } from 'next/server';
import { timingSafeEqual } from 'node:crypto';

export function isAuthorizedCron(req: NextRequest | Request): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return false;
  const supplied = Buffer.from(req.headers.get('authorization') ?? '');
  const expected = Buffer.from(`Bearer ${cronSecret}`);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}
