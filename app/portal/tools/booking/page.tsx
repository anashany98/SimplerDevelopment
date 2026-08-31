import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { bookingPages, bookings, googleCalendarTokens, zoomTokens } from '@/lib/db/schema';
import { eq, desc, and, gte, sql } from 'drizzle-orm';
import { getPortalClient } from '@/lib/portal-client';
import Link from 'next/link';
import { PortalPageHeader } from '@/components/portal/PortalPageHeader';
import { pBtnPrimary, pBtnGhost } from '@/components/portal/portal-ui';
import DomainGetStarted from '@/components/portal/onboarding/DomainGetStarted';

export default async function BookingPagesListPage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/portal/login');

  const userId = parseInt(session.user.id, 10);
  const client = await getPortalClient(userId);
  if (!client) redirect('/portal/dashboard');

  const pages = await db
    .select()
    .from(bookingPages)
    .where(eq(bookingPages.clientId, client.id))
    .orderBy(desc(bookingPages.updatedAt));

  // Count upcoming bookings per page
  const now = new Date();
  const upcomingCounts = await db
    .select({
      bookingPageId: bookings.bookingPageId,
      count: sql<number>`count(*)::int`,
    })
    .from(bookings)
    .where(
      and(
        eq(bookings.clientId, client.id),
        eq(bookings.status, 'confirmed'),
        gte(bookings.startTime, now)
      )
    )
    .groupBy(bookings.bookingPageId);

  const countMap = new Map(upcomingCounts.map((c) => [c.bookingPageId, c.count]));

  // Check Google Calendar connection
  const calTokens = await db
    .select()
    .from(googleCalendarTokens)
    .where(eq(googleCalendarTokens.clientId, client.id))
    .limit(1);
  const isCalendarConnected = calTokens.length > 0;

  const zmTokens = await db
    .select()
    .from(zoomTokens)
    .where(eq(zoomTokens.clientId, client.id))
    .limit(1);
  const isZoomConnected = zmTokens.length > 0;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <PortalPageHeader
        eyebrow="Reservas"
        title="Páginas de reservas"
        subtitle="Crea páginas de agenda para que tus clientes reserven tiempo contigo"
        actions={
          <Link href="/portal/tools/booking/new" className={pBtnPrimary}>
            <span className="material-icons text-lg">add</span>Nueva página de reservas</Link>
        }
      />

      <DomainGetStarted domainKey="bookings" />

      {/* Google Calendar Status */}
      <div className="bg-card border border-border rounded-2xl p-4 flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <span className="material-icons text-xl text-primary">event</span>
          <div>
            <p className="text-sm font-medium text-foreground">Google Calendar</p>
            <p className="text-xs text-muted-foreground">
              {isCalendarConnected
                ? 'Conectado: las nuevas reservas se sincronizan con tu calendario'
                : 'Conectar para sincronizar reservas y comprobar conflictos'}
            </p>
          </div>
        </div>
        {isCalendarConnected ? (
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
              <span className="material-icons text-sm">check_circle</span>Conectado</span>
            <form action="/api/portal/tools/booking/google/disconnect" method="POST">
              <button
                type="submit"
                className="text-xs text-muted-foreground hover:text-foreground transition-colors underline"
              >Desconectar</button>
            </form>
          </div>
        ) : (
          // eslint-disable-next-line @next/next/no-html-link-for-pages -- OAuth redirect to an API route; next/link prefetch would be wrong
          <a
            href="/api/portal/tools/booking/google/auth"
            className={pBtnGhost}
          >
            <span className="material-icons text-lg">link</span>Conectar</a>
        )}
      </div>

      {/* Zoom Status */}
      <div className="bg-card border border-border rounded-2xl p-4 flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <span className="material-icons text-xl text-primary">video_camera_front</span>
          <div>
            <p className="text-sm font-medium text-foreground">Zoom</p>
            <p className="text-xs text-muted-foreground">
              {isZoomConnected
                ? 'Conectado: las reuniones de Zoom se crean automáticamente'
                : 'Conecta para crear reuniones de Zoom automáticamente'}
            </p>
          </div>
        </div>
        {isZoomConnected ? (
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
              <span className="material-icons text-sm">check_circle</span>Conectado</span>
            <form action="/api/portal/tools/booking/zoom/disconnect" method="POST">
              <button
                type="submit"
                className="text-xs text-muted-foreground hover:text-foreground transition-colors underline"
              >Desconectar</button>
            </form>
          </div>
        ) : (
          // eslint-disable-next-line @next/next/no-html-link-for-pages -- OAuth redirect to an API route; next/link prefetch would be wrong
          <a
            href="/api/portal/tools/booking/zoom/auth"
            className={pBtnGhost}
          >
            <span className="material-icons text-lg">link</span>Conectar</a>
        )}
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[
          { href: '/portal/tools/booking/calendar', icon: 'calendar_month', label: 'Calendario', desc: 'Vista combinada' },
          { href: '/portal/tools/booking/analytics', icon: 'bar_chart', label: 'Analíticas', desc: 'Ingresos y análisis' },
          { href: '/portal/tools/booking/checkin', icon: 'qr_code_scanner', label: 'Registro de llegada', desc: 'Escanea y gestiona' },
          { href: '/portal/tools/booking/quotes', icon: 'request_quote', label: 'Cotizaciones', desc: 'Precios personalizados' },
          { href: '/portal/tools/gift-certificates', icon: 'card_giftcard', label: 'Certificados de regalo', desc: 'Gestionar certificados' },
        ].map((action) => (
          <Link
            key={action.href}
            href={action.href}
            className="bg-card border border-border rounded-2xl p-3 hover:border-primary/50 hover:shadow-sm transition-all group text-center"
          >
            <span className="material-icons text-xl text-muted-foreground group-hover:text-primary transition-colors">{action.icon}</span>
            <p className="text-sm font-medium text-foreground mt-1">{action.label}</p>
            <p className="text-xs text-muted-foreground">{action.desc}</p>
          </Link>
        ))}
      </div>

      {/* Booking Pages List */}
      {pages.length === 0 ? (
        <div className="bg-card border border-border rounded-2xl p-10 text-center space-y-4">
          <span className="material-icons text-5xl text-muted-foreground/50">calendar_month</span>
          <h2 className="text-lg font-semibold text-foreground">Aún no hay páginas de reservas</h2>
          <p className="text-muted-foreground text-sm max-w-md mx-auto">Crea tu primera página de reservas para que tus clientes agenden reuniones contigo.
            Define tu disponibilidad, duración y preguntas personalizadas.</p>
          <Link
            href="/portal/tools/booking/new"
            className={pBtnPrimary}
          >
            <span className="material-icons text-lg">add_circle</span>Crear tu primera página de reservas</Link>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {pages.map((page) => {
            const upcoming = countMap.get(page.id) || 0;
            return (
              <Link
                key={page.id}
                href={`/portal/tools/booking/${page.id}`}
                className="bg-card border border-border rounded-2xl p-5 hover:border-primary/50 hover:shadow-sm transition-all group"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span
                      className="material-icons text-xl"
                      style={{ color: page.color || '#2563eb' }}
                    >
                      calendar_month
                    </span>
                    <h3 className="font-semibold text-foreground group-hover:text-primary transition-colors">
                      {page.title}
                    </h3>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span
                      className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        page.active
                          ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                          : 'bg-muted text-muted-foreground'
                      }`}
                    >
                      {page.active ? 'active' : 'inactive'}
                    </span>
                    {!page.active && (
                      <span className="text-xs text-muted-foreground text-right leading-tight max-w-[14rem]">Las nuevas páginas de reservas se revisan antes de publicarse, normalmente en unas horas</span>
                    )}
                  </div>
                </div>
                {page.description && (
                  <p className="text-sm text-muted-foreground mb-3 line-clamp-2">{page.description}</p>
                )}
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <span className="material-icons text-sm">timer</span>
                    {page.duration} min
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="material-icons text-sm">link</span>
                    /book/{page.slug}
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="material-icons text-sm">event_upcoming</span>
                    {upcoming} upcoming
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {/* Tips */}
      <div className="bg-card border border-border rounded-2xl p-4 flex items-start gap-3">
        <span className="material-icons text-primary mt-0.5">tips_and_updates</span>
        <div className="text-sm text-muted-foreground">
          <p className="font-medium text-foreground">Tips</p>
          <p>Conecta Google Calendar para comprobar conflictos automáticamente y añadir nuevas reservas a tu calendario.
            Comparte tu enlace de reservas con clientes o insértalo en tu sitio web.</p>
        </div>
      </div>
    </div>
  );
}
