import { notFound } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { storeSettings } from '@/lib/db/schema';
import { getClientWebsiteByDomain } from '@/lib/actions/client-sites';
import { CheckoutPageClient } from './CheckoutPageClient';

export default async function CheckoutPage({ params }: { params: Promise<{ domain: string }> }) {
  const { domain } = await params;
  const site = await getClientWebsiteByDomain(domain);
  if (!site) notFound();

  // The store's own currency — the order summary used to fall back to a
  // hardcoded 'USD' before a checkout result existed, so an EUR store showed
  // "19,99 US$" next to "19,99 €" line items.
  const [settings] = await db
    .select({ currency: storeSettings.currency })
    .from(storeSettings)
    .where(eq(storeSettings.websiteId, site.id))
    .limit(1);

  return (
    <CheckoutPageClient
      siteId={site.id}
      domain={domain}
      storeCurrency={settings?.currency ?? 'EUR'}
    />
  );
}
