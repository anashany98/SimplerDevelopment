import { db } from '@/lib/db';
import { supportTickets } from '@/lib/db/schema';
import { eq, and, ne, count } from 'drizzle-orm';
import MetricBlock from './MetricBlock';

export default async function MetricOpenTicketsWidget({
  clientId,
}: {
  clientId: number;
  userId: number;
}) {
  const [result] = await db
    .select({ count: count() })
    .from(supportTickets)
    .where(and(eq(supportTickets.clientId, clientId), ne(supportTickets.status, 'closed')));

  const openCount = result?.count ?? 0;

  return (
    <MetricBlock value={openCount} tone={openCount > 0 ? 'warn' : 'default'} />
  );
}
