'use client';

import { useState, useEffect, useCallback } from 'react';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { formatCents } from '@/lib/portal-utils';
import { fetchJsonSafe } from '@/lib/admin/fetch-json-safe';
import { PageHeader, Button, Stat, Panel, Badge, StatusDot, BarChart, EmptyState, type Tone } from '@/components/admin/ui';

interface DashboardData {
  clients: { total: number; active: number };
  websites: { total: number; active: number };
  tickets: { open: number };
  projects: { active: number };
  invoices: { outstanding: number; collected: number; overdueCount: number; totalCount: number };
  subscriptions: { active: number; mrr: number };
  aiCredits: { totalBalance: number; totalMonthlyGrant: number };
  deals: { open: number; won: number; pipelineValue: number; wonValue: number };
  contacts: number;
  proposals: { draft: number; sent: number; accepted: number };
  campaigns: number;
  bookings: { pages: number; upcoming: number };
  automations: number;
  hostedSites: number;
  recent: {
    tickets: Array<{ id: number; number: number; subject: string; status: string; priority: string; createdAt: string }>;
    invoices: Array<{ id: number; number: string; status: string; total: number; createdAt: string }>;
    orders: Array<{ id: number; orderNumber: string; customerName: string; total: number; status: string; createdAt: string }>;
  };
  trends: { months: string[]; revenue: number[]; clients: number[]; tickets: number[] };
}

interface HealthJob {
  name: string; label: string; area: string;
  lastRunAt: string | null; lastSuccessAt: string | null;
  lastError: string | null; lastErrorAt: string | null; runCount: number;
}

const fmtDate = (s: string) => new Date(s).toLocaleDateString();

function timeAgo(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'ahora';
  const m = Math.floor(s / 60); if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24); if (d < 30) return `${d}d`;
  return fmtDate(iso);
}

function Delta({ series, goodUp = true }: { series: number[]; goodUp?: boolean }) {
  if (series.length < 2) return null;
  const last = series[series.length - 1];
  const prev = series[series.length - 2];
  if (prev === 0 && last === 0) return null;
  const pct = prev === 0 ? 100 : Math.round(((last - prev) / prev) * 100);
  const up = last >= prev;
  const tone = pct === 0 ? 'text-muted-foreground' : up === goodUp ? 'text-[var(--admin-ok)]' : 'text-[var(--admin-bad)]';
  return <span className={`font-mono ${tone}`}>{up ? '▲' : '▼'} {Math.abs(pct)}%</span>;
}

const healthTone = (j: HealthJob): Tone => (j.lastError ? 'bad' : j.lastSuccessAt ? 'ok' : 'neutral');

export default function AdminDashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [health, setHealth] = useState<HealthJob[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setFetchError(null);
    const [dash, hp] = await Promise.all([
      fetchJsonSafe<{ success: boolean; data: DashboardData }>('/api/admin/dashboard'),
      fetchJsonSafe<{ success: boolean; data: HealthJob[] }>('/api/admin/system-health'),
    ]);
    if (dash.ok && dash.data.success) setData(dash.data.data);
    else setFetchError(dash.ok ? 'El servidor devolvió un error.' : dash.error);
    setHealth(hp.ok && hp.data.success ? hp.data.data : null);
    setLoading(false);
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch dashboard data on mount
  useEffect(() => { void loadDashboard(); }, [loadDashboard]);

  if (loading) return <DashboardSkeleton />;

  if (fetchError || !data) {
    return (
      <div className="p-6 max-w-[1400px] mx-auto">
        <div className="border border-border rounded-[7px] bg-card mt-6">
          <EmptyState
            icon="cloud_off"
            tone="bad"
            title="No se pudo cargar el panel"
            message={fetchError ?? 'La petición falló. Reinténtalo, o revisa el estado del sistema si persiste.'}
            action={
              <div className="flex items-center gap-2">
                <Button variant="primary" icon="refresh" onClick={() => void loadDashboard()}>Reintentar</Button>
                <Button href="/admin/system-health">Estado del sistema</Button>
              </div>
            }
          />
        </div>
      </div>
    );
  }

  // Merge the recent per-type rows into one time-sorted activity feed.
  type Act = { id: string; ts: number; iso: string; icon: string; href?: string; node: ReactNode };
  const activity: Act[] = [
    ...data.recent.tickets.map((t): Act => ({
      id: `t${t.id}`, ts: +new Date(t.createdAt), iso: t.createdAt, icon: 'support_agent',
      href: `/portal/tickets/${t.id}`, node: <><span className="font-mono text-muted-foreground">#{t.number}</span> {t.subject}</>,
    })),
    ...data.recent.invoices.map((inv): Act => ({
      id: `i${inv.id}`, ts: +new Date(inv.createdAt), iso: inv.createdAt, icon: 'receipt_long',
      href: `/portal/invoices/${inv.id}`, node: <>Factura <b className="text-foreground">{inv.number}</b> · <span className="font-mono">{formatCents(inv.total)}</span></>,
    })),
    ...data.recent.orders.map((o): Act => ({
      id: `o${o.id}`, ts: +new Date(o.createdAt), iso: o.createdAt, icon: 'shopping_bag',
      node: <>Pedido <b className="text-foreground font-mono">{o.orderNumber}</b> · <span className="font-mono">{formatCents(o.total)}</span></>,
    })),
  ].sort((a, b) => b.ts - a.ts).slice(0, 8);

  const okJobs = health?.filter((j) => healthTone(j) === 'ok').length ?? 0;
  const anyBad = health?.some((j) => healthTone(j) === 'bad') ?? false;
  // A job that has never run is neither "ok" nor "bad" (healthTone → 'neutral') —
  // without this check it silently fell through to the 'ok' branch below and the
  // widget reported "Operational" even at 0/N jobs ever run.
  const anyNeverRun = health?.some((j) => healthTone(j) === 'neutral') ?? false;
  const healthToneOverall: Tone = anyBad ? 'bad' : anyNeverRun ? 'warn' : 'ok';
  const healthLabel = anyBad ? 'Degradado' : anyNeverRun ? 'Aún sin ejecutar' : 'Operativo';

  return (
    <div className="p-6 max-w-[1400px] mx-auto">
      <PageHeader title="Panel" subtitle={`${data.clients.active} clientes activos · ${data.tickets.open} tickets abiertos`}>
        <Button href="/admin/clients" variant="primary" icon="add">Nuevo cliente</Button>
      </PageHeader>

      {/* Revenue KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat icon="trending_up" label="Ingresos recurrentes mensuales" value={formatCents(data.subscriptions.mrr)} sub={`${data.subscriptions.active} suscripciones activas`} href="/admin/subscriptions" />
        <Stat icon="account_balance_wallet" label="Pendiente de cobro" value={formatCents(data.invoices.outstanding)} sub={`${data.invoices.overdueCount} vencidas`} href="/admin/portal-invoices" />
        <Stat
          icon="payments" label="Cobrado (12 m)"
          value={formatCents(data.trends.revenue.reduce((a, b) => a + b, 0))}
          trend={data.trends.revenue}
          sub={<><Delta series={data.trends.revenue} /> · último mes</>}
          href="/admin/portal-invoices"
        />
        <Stat icon="handshake" label="Valor del embudo" value={formatCents(data.deals.pipelineValue)} sub={`${data.deals.open} negocios abiertos`} href="/admin/crm/deals" />
      </div>

      {/* Revenue chart */}
      <div className="mt-3">
        <Panel title="Ingresos" icon="bar_chart" action={{ label: 'Facturas', href: '/admin/portal-invoices' }}>
          <div className="px-4 pt-3 text-xs text-muted-foreground">Facturas pagadas · últimos 12 meses</div>
          <BarChart values={data.trends.revenue} labels={data.trends.months} format={formatCents} />
        </Panel>
      </div>

      {/* Operations */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mt-3">
        <Stat size="sm" icon="business" label="Clientes" value={data.clients.active} trend={data.trends.clients} sub={<><Delta series={data.trends.clients} /> · {data.clients.total} total</>} href="/admin/clients" />
        <Stat size="sm" icon="language" label="Sitios web" value={data.websites.active} sub={`${data.websites.total} total`} href="/admin/portal-websites" />
        <Stat size="sm" icon="support_agent" label="Tickets abiertos" value={data.tickets.open} tone={data.tickets.open > 0 ? 'bad' : undefined} trend={data.trends.tickets} sub={<><Delta series={data.trends.tickets} goodUp={false} /> · nuevos/mes</>} href="/admin/portal-tickets" />
        <Stat size="sm" icon="view_kanban" label="Proyectos activos" value={data.projects.active} href="/admin/portal-projects" />
        <Stat size="sm" icon="contacts" label="Contactos CRM" value={data.contacts} href="/admin/crm/contacts" />
        <Stat size="sm" icon="cloud" label="Sitios alojados" value={data.hostedSites} href="/admin/portal-hosting" />
      </div>

      {/* Services */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mt-3">
        <Stat size="sm" icon="campaign" label="Campañas" value={data.campaigns} href="/admin/email" />
        <Stat size="sm" icon="calendar_month" label="Próximas reservas" value={data.bookings.upcoming} sub={`${data.bookings.pages} páginas`} href="/admin/booking" />
        <Stat size="sm" icon="bolt" label="Automatizaciones" value={data.automations} sub="reglas activas" href="/admin/automations" />
        <Stat size="sm" icon="token" label="Créditos IA" value={data.aiCredits.totalBalance.toLocaleString()} sub="saldo del fondo" href="/admin/ai-credits" />
        <Stat size="sm" icon="description" label="Propuestas" value={data.proposals.sent} sub={`${data.proposals.accepted} aceptadas`} href="/admin/crm/proposals" />
        <Stat size="sm" icon="shopping_cart" label="Negocios ganados" value={data.deals.won} sub={formatCents(data.deals.wonValue)} href="/admin/portal-ecommerce" />
      </div>

      {/* Activity + System health */}
      <div className="grid lg:grid-cols-3 gap-3 mt-3">
        <div className="lg:col-span-2">
          <Panel title="Actividad reciente" icon="history" action={{ label: 'Tickets', href: '/admin/portal-tickets' }}>
            {activity.length === 0 ? (
              <div className="px-4 py-8 text-center text-xs text-muted-foreground">Sin actividad reciente</div>
            ) : (
              <ul className="divide-y divide-border">
                {activity.map((a) => (
                  <li key={a.id} className="px-4 py-2.5 flex items-center gap-3 hover:bg-[var(--admin-hover)] transition-colors">
                    <span className="w-7 h-7 rounded-md border border-border grid place-items-center text-muted-foreground shrink-0">
                      <span className="material-icons text-[15px]">{a.icon}</span>
                    </span>
                    <div className="min-w-0 flex-1 text-[13px] truncate">
                      {a.href ? <Link href={a.href} className="hover:text-[var(--admin-accent)] transition-colors">{a.node}</Link> : a.node}
                    </div>
                    <time className="font-mono text-[11px] text-muted-foreground shrink-0">{timeAgo(a.iso)}</time>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>

        <Panel
          title="Estado del sistema"
          icon="monitor_heart"
          action={{ label: 'Detalles', href: '/admin/system-health' }}
        >
          {health === null ? (
            <div className="px-4 py-8 text-center text-xs text-muted-foreground">Estado no disponible</div>
          ) : (
            <>
              <div className="px-4 py-2.5 border-b border-border flex items-center gap-2">
                <Badge tone={healthToneOverall}><StatusDot tone={healthToneOverall} /> {healthLabel}</Badge>
                <span className="ml-auto font-mono text-[11px] text-muted-foreground">{okJobs}/{health.length} ok</span>
              </div>
              <ul className="divide-y divide-border">
                {[...health].sort((a, b) => Number(!!b.lastError) - Number(!!a.lastError)).slice(0, 6).map((j) => (
                  <li key={j.name} className="px-4 py-2.5 flex items-center gap-2.5 text-[13px]">
                    <StatusDot tone={healthTone(j)} />
                    <span className="text-foreground truncate">{j.label || j.name}</span>
                    <span className="ml-auto font-mono text-[11px] text-muted-foreground shrink-0">{j.lastRunAt ? timeAgo(j.lastRunAt) : 'nunca'}</span>
                  </li>
                ))}
              </ul>
              {health.length > 6 && (
                <Link href="/admin/system-health" className="block px-4 py-2 text-xs text-muted-foreground hover:text-foreground transition-colors">+{health.length - 6} trabajos más</Link>
              )}
            </>
          )}
        </Panel>
      </div>

      {/* Quick actions */}
      <div className="mt-3">
        <Panel title="Acciones rápidas">
          <div className="p-3 flex flex-wrap gap-2">
            <Button size="sm" href="/admin/clients" icon="person_add">Añadir cliente</Button>
            <Button size="sm" href="/admin/portal-invoices/new" icon="receipt">Nueva factura</Button>
            <Button size="sm" href="/admin/portal-projects" icon="add_task">Nuevo proyecto</Button>
            <Button size="sm" href="/admin/portal-tickets" icon="support">Ver tickets</Button>
            <Button size="sm" href="/admin/email/campaigns/new" icon="drafts">Nueva campaña</Button>
            <Button size="sm" href="/admin/crm/deals" icon="trending_up">Ver negocios</Button>
            <Button size="sm" href="/admin/mcp-usage" icon="query_stats">Uso de MCP</Button>
          </div>
        </Panel>
      </div>
    </div>
  );
}

function DashboardSkeleton() {
  const block = 'rounded-[7px] border border-border bg-[var(--admin-surface-2)]';
  return (
    <div className="p-6 max-w-[1400px] mx-auto animate-pulse">
      <div className="flex items-center justify-between mb-6">
        <div className="h-7 w-40 rounded bg-[var(--admin-surface-2)]" />
        <div className="h-[34px] w-28 rounded bg-[var(--admin-surface-2)]" />
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => <div key={i} className={`${block} h-[92px]`} />)}
      </div>
      <div className={`${block} h-44 mt-3`} />
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mt-3">
        {Array.from({ length: 6 }).map((_, i) => <div key={i} className={`${block} h-[74px]`} />)}
      </div>
      <div className="grid lg:grid-cols-3 gap-3 mt-3">
        <div className={`${block} h-64 lg:col-span-2`} />
        <div className={`${block} h-64`} />
      </div>
    </div>
  );
}
