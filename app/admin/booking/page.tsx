'use client';

import { useState, useEffect } from 'react';

interface BookingPage {
  id: number;
  title: string;
  slug: string;
  duration: number;
  active: boolean;
  googleCalendarSync: boolean;
  timezone: string;
  createdAt: string;
  company: string | null;
  clientName: string;
  totalBookings: number;
  upcomingBookings: number;
}

interface UpcomingBooking {
  id: number;
  guestName: string;
  guestEmail: string;
  guestPhone: string | null;
  startTime: string;
  endTime: string;
  timezone: string;
  status: string;
  createdAt: string;
  bookingPageTitle: string;
  company: string | null;
  clientName: string;
}

interface Stats {
  totalPages: number;
  activePages: number;
  totalUpcoming: number;
}

function bookingStatusBadge(status: string) {
  const colors: Record<string, string> = {
    confirmed: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
    cancelled: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
    completed: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
    no_show: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${colors[status] ?? 'bg-gray-100 text-gray-800'}`}>
      {status.replace('_', ' ')}
    </span>
  );
}

function formatDateTime(d: string) {
  return new Date(d).toLocaleDateString('es-ES', {
    month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

export default function AdminBookingPage() {
  const [tab, setTab] = useState<'pages' | 'upcoming'>('pages');
  const [pages, setPages] = useState<BookingPage[]>([]);
  const [upcoming, setUpcoming] = useState<UpcomingBooking[]>([]);
  const [stats, setStats] = useState<Stats>({ totalPages: 0, activePages: 0, totalUpcoming: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/admin/portal/booking')
      .then(r => r.json())
      .then(d => {
        setPages(d.pages ?? []);
        setUpcoming(d.upcomingBookings ?? []);
        setStats(d.stats ?? { totalPages: 0, activePages: 0, totalUpcoming: 0 });
        setLoading(false);
      });
  }, []);

  const statCards = [
    { label: 'Páginas totales', value: stats.totalPages, icon: 'calendar_month' },
    { label: 'Páginas activas', value: stats.activePages, icon: 'event_available' },
    { label: 'Reservas próximas', value: stats.totalUpcoming, icon: 'event' },
  ];

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Reservas</h1>
          <p className="text-muted-foreground mt-1">Gestiona páginas de reservas y ve citas próximas.</p>
        </div>
        <div className="flex items-center gap-2">
          {(['pages', 'upcoming'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                tab === t ? 'bg-foreground text-background' : 'border border-border text-muted-foreground hover:bg-accent'
              }`}
            >
              {t === 'pages' ? 'Páginas' : 'Próximas'}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12 text-muted-foreground">
          <span className="material-icons animate-spin text-3xl">autorenew</span>
          <p className="mt-2">Cargando datos de reservas...</p>
        </div>
      ) : (
        <>
          {tab === 'pages' && (
            <>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {statCards.map(c => (
                  <div key={c.label} className="bg-card border border-border rounded-xl p-4">
                    <div className="flex items-center gap-3">
                      <span className="material-icons text-2xl text-muted-foreground">{c.icon}</span>
                      <div>
                        <p className="text-2xl font-bold text-foreground">{c.value}</p>
                        <p className="text-xs text-muted-foreground">{c.label}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {pages.length === 0 ? (
                <div className="bg-card border border-border rounded-xl p-12 text-center">
                  <span className="material-icons text-5xl text-muted-foreground">calendar_month</span>
                  <h3 className="mt-4 font-semibold text-foreground">No hay páginas de reservas</h3>
                  <p className="text-muted-foreground mt-1 text-sm">Las páginas de reservas aparecerán aquí una vez que los clientes las creen.</p>
                </div>
              ) : (
                <div className="bg-card border border-border rounded-xl overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50 border-b border-border">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Título</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Cliente</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Duración</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Sincronización de calendario</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Estado</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Reservas totales</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Próximas</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {pages.map(page => (
                        <tr key={page.id} className="hover:bg-muted/30 transition-colors">
                          <td className="px-4 py-3 font-medium text-foreground">{page.title}</td>
                          <td className="px-4 py-3 text-muted-foreground">{page.company ?? page.clientName}</td>
                          <td className="px-4 py-3 text-muted-foreground">{page.duration} min</td>
                          <td className="px-4 py-3">
                            {page.googleCalendarSync ? (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
                                <span className="material-icons text-sm mr-1">sync</span>
                                Sincronizado
                              </span>
                            ) : (
                              <span className="text-xs text-muted-foreground">--</span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                              page.active
                                ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
                                : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
                            }`}>
                              {page.active ? 'Activa' : 'Inactiva'}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">{page.totalBookings}</td>
                          <td className="px-4 py-3 text-muted-foreground">{page.upcomingBookings}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}

          {tab === 'upcoming' && (
            <>
              {upcoming.length === 0 ? (
                <div className="bg-card border border-border rounded-xl p-12 text-center">
                  <span className="material-icons text-5xl text-muted-foreground">event_busy</span>
                  <h3 className="mt-4 font-semibold text-foreground">No hay reservas próximas</h3>
                  <p className="text-muted-foreground mt-1 text-sm">Las próximas reservas de los siguientes 30 días aparecerán aquí.</p>
                </div>
              ) : (
                <div className="bg-card border border-border rounded-xl overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50 border-b border-border">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Fecha / hora</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Nombre del invitado</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Email del invitado</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Página de reservas</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Cliente</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Estado</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Teléfono</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {upcoming.map(booking => (
                        <tr key={booking.id} className="hover:bg-muted/30 transition-colors">
                          <td className="px-4 py-3 text-muted-foreground text-xs whitespace-nowrap">{formatDateTime(booking.startTime)}</td>
                          <td className="px-4 py-3 font-medium text-foreground">{booking.guestName}</td>
                          <td className="px-4 py-3 text-muted-foreground text-xs">{booking.guestEmail}</td>
                          <td className="px-4 py-3 text-muted-foreground">{booking.bookingPageTitle}</td>
                          <td className="px-4 py-3 text-muted-foreground">{booking.company ?? booking.clientName}</td>
                          <td className="px-4 py-3">{bookingStatusBadge(booking.status)}</td>
                          <td className="px-4 py-3 text-muted-foreground text-xs">{booking.guestPhone ?? '--'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
