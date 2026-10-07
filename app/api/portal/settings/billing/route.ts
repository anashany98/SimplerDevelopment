import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { invoices, clientServices, services } from '@/lib/db/schema';
import { getPortalClient } from '@/lib/portal-client';
import { eq, desc } from 'drizzle-orm';
import { PAYMENTS_DISABLED } from '@/lib/billing/disabled';

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const userId = parseInt(session.user.id, 10);
  const client = await getPortalClient(userId);
  if (!client) return NextResponse.json({ success: false, message: 'Client not found' }, { status: 404 });

  const [recentInvoices, activeServices] = await Promise.all([
    db.select().from(invoices).where(eq(invoices.clientId, client.id)).orderBy(desc(invoices.createdAt)).limit(10),
    db
      .select({
        id: clientServices.id,
        status: clientServices.status,
        startDate: clientServices.startDate,
        renewalDate: clientServices.renewalDate,
        serviceName: services.name,
        serviceCategory: services.category,
        servicePrice: services.price,
        billingCycle: services.billingCycle,
      })
      .from(clientServices)
      .innerJoin(services, eq(services.id, clientServices.serviceId))
      .where(eq(clientServices.clientId, client.id))
      .orderBy(clientServices.createdAt),
  ]);

  return NextResponse.json({
    success: true,
    data: {
      invoices: recentInvoices,
      services: activeServices,
      stripeCustomerId: client.stripeCustomerId,
      // Lets the page skip the payment-methods call entirely when payments are
      // disabled — that endpoint 403s by design and logged a console error.
      paymentsDisabled: PAYMENTS_DISABLED,
    },
  });
}
