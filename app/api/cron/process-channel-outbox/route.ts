import { NextResponse } from 'next/server';
import { and, asc, eq, inArray, lt, lte } from 'drizzle-orm';
import { db } from '@/lib/db';
import { channelOutbox } from '@/lib/db/schema';
import { isAuthorizedCron } from '@/lib/cron-auth';
import { withCronHealth } from '@/lib/cron-health';
import { processOutboxItem } from '@/lib/channels/service';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

async function _GET(req: Request) {
  if (!isAuthorizedCron(req)) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  await db.update(channelOutbox).set({ status: 'retry', lockedAt: null, nextAttemptAt: new Date() }).where(and(
    eq(channelOutbox.status, 'processing'), lt(channelOutbox.lockedAt, new Date(Date.now() - 10 * 60 * 1_000)),
  ));
  const due = await db.select({ id: channelOutbox.id, clientId: channelOutbox.clientId }).from(channelOutbox)
    .where(and(inArray(channelOutbox.status, ['pending', 'retry']), lte(channelOutbox.nextAttemptAt, new Date())))
    .orderBy(asc(channelOutbox.nextAttemptAt))
    .limit(100);
  const counts = { sent: 0, retry: 0, failed: 0, unknown: 0, skipped: 0 };
  const skipped: Array<{ id: number; clientId: number }> = [];
  for (const item of due) {
    try { counts[await processOutboxItem(item.clientId, item.id)]++; }
    catch {
      counts.skipped++;
      skipped.push(item);
    }
  }
  return NextResponse.json(
    { success: skipped.length === 0, ...counts, skippedItems: skipped },
    { status: skipped.length === 0 ? 200 : 503 },
  );
}

export const GET = withCronHealth({ name: 'api-cron:process-channel-outbox', area: 'api-cron' }, _GET);
