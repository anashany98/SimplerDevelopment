import { db } from '@/lib/db';
import { invoices } from '@/lib/db/schema';
import { eq, and, count } from 'drizzle-orm';
import MetricBlock from './MetricBlock';

export default async function MetricUnpaidInvoicesWidget({
  clientId,
}: {
  clientId: number;
  userId: number;
}) {
  const [result] = await db
    .select({ count: count() })
    .from(invoices)
    .where(and(eq(invoices.clientId, clientId), eq(invoices.status, 'sent')));

  const unpaid = result?.count ?? 0;

  return (
    <MetricBlock value={unpaid} tone={unpaid > 0 ? 'bad' : 'default'} />
  );
}
