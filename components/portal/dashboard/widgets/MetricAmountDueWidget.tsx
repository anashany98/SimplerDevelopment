import { db } from '@/lib/db';
import { invoices } from '@/lib/db/schema';
import { eq, and, sum } from 'drizzle-orm';
import { formatCents } from '@/lib/portal';
import MetricBlock from './MetricBlock';

export default async function MetricAmountDueWidget({
  clientId,
}: {
  clientId: number;
  userId: number;
}) {
  const [result] = await db
    .select({ total: sum(invoices.total) })
    .from(invoices)
    .where(and(eq(invoices.clientId, clientId), eq(invoices.status, 'sent')));

  const due = Number(result?.total ?? 0);

  return (
    <MetricBlock value={formatCents(due)} tone={due > 0 ? 'warn' : 'default'} />
  );
}
