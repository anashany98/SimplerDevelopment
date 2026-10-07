import { NextResponse } from 'next/server';
import { and, asc, eq, inArray, lt, lte } from 'drizzle-orm';
import { db } from '@/lib/db';
import { channelAiRuns } from '@/lib/db/schema';
import { isAuthorizedCron } from '@/lib/cron-auth';
import { withCronHealth } from '@/lib/cron-health';
import { processConversationAiRun } from '@/lib/channels/ai';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

async function _GET(req: Request) {
  if (!isAuthorizedCron(req)) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  await db.update(channelAiRuns).set({ status: 'retry', startedAt: null, nextAttemptAt: new Date() }).where(and(
    eq(channelAiRuns.status, 'running'), lt(channelAiRuns.startedAt, new Date(Date.now() - 10 * 60 * 1_000)),
  ));
  const due = await db.select({ id: channelAiRuns.id, clientId: channelAiRuns.clientId }).from(channelAiRuns)
    .where(and(inArray(channelAiRuns.status, ['pending', 'retry']), lte(channelAiRuns.nextAttemptAt, new Date())))
    .orderBy(asc(channelAiRuns.nextAttemptAt))
    .limit(50);
  const counts = { sent: 0, review: 0, skipped: 0, retry: 0, failed: 0, unavailable: 0 };
  for (const item of due) {
    try { counts[await processConversationAiRun(item.clientId, item.id)]++; }
    catch { counts.unavailable++; }
  }
  return NextResponse.json({ success: true, ...counts });
}

export const GET = withCronHealth({ name: 'api-cron:process-conversation-ai', area: 'api-cron' }, _GET);
