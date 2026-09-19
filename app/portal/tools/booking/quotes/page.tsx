'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { PortalPageHeader } from '@/components/portal/PortalPageHeader';
import { pBtnPrimary, pCard } from '@/components/portal/portal-ui';
import { formatCents } from '@/lib/portal-utils';

interface Quote {
  id: number;
  slug: string;
  title: string;
  customerName: string;
  customerEmail: string;
  price: number;
  status: string;
  paidAt: string | null;
  expiresAt: string | null;
  createdAt: string;
}

const STATUS_STYLES: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
  paid: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  cancelled: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  expired: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
};

export default function BookingQuotesPage() {
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/portal/tools/booking/quotes')
      .then(r => r.json())
      .then(json => { if (json.success) setQuotes(json.data); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  function copyLink(slug: string) {
    const url = `${window.location.origin}/book/quote/${slug}`;
    navigator.clipboard.writeText(url);
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <Link href="/portal/tools/booking" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
        <span className="material-icons text-lg">arrow_back</span>Volver</Link>
      <PortalPageHeader
        eyebrow="Reservas"
        title="Cotizaciones personalizadas"
        subtitle="Crea enlaces de pago para reservas personalizadas"
        actions={
          <Link href="/portal/tools/booking/quotes/new" className={pBtnPrimary}>
            <span className="material-icons text-base">add</span>Nueva cotización</Link>
        }
      />

      {loading ? (
        <div className="flex justify-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-muted-foreground/20 border-t-primary" />
        </div>
      ) : quotes.length === 0 ? (
        <div className="bg-card border border-border rounded-2xl p-12 text-center">
          <span className="material-icons text-4xl text-muted-foreground mb-3 block">request_quote</span>
          <h2 className="text-lg font-semibold text-foreground mb-1">Aún no hay cotizaciones</h2>
          <p className="text-sm text-muted-foreground mb-4">Crea un presupuesto personalizado para enviar un enlace de pago a un cliente</p>
          <Link href="/portal/tools/booking/quotes/new" className={pBtnPrimary}>
            <span className="material-icons text-base">add</span>Crear primera cotización</Link>
        </div>
      ) : (
        <div className={`${pCard} overflow-hidden`}>
          <div className="divide-y divide-border overflow-x-auto">
            {quotes.map(q => (
              <div key={q.id} className="flex items-center gap-4 px-4 py-3 hover:bg-muted/30 transition-colors min-w-[480px]">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <span className="material-icons text-primary">request_quote</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{q.title}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {q.customerName} &middot; {q.customerEmail}
                  </p>
                </div>
                <p className="text-sm font-semibold text-foreground">{formatCents(q.price)}</p>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_STYLES[q.status] || STATUS_STYLES.pending}`}>
                  {q.status}
                </span>
                <div className="flex items-center gap-1">
                  <button onClick={() => copyLink(q.slug)} title="Copiar enlace de pago"
                    className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
                    <span className="material-icons text-base">link</span>
                  </button>
                  <Link href={`/portal/tools/booking/quotes/${q.id}`}
                    className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
                    <span className="material-icons text-base">edit</span>
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
