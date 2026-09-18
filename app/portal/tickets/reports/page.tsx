'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { PortalPageHeader } from '@/components/portal/PortalPageHeader';
import { pCard, pBtnGhost, pSectionTitle } from '@/components/portal/portal-ui';

// ── Types ─────────────────────────────────────────────────────────────────────

interface TrendDay {
  date: string;
  opened: number;
  resolved: number;
}

interface ResponseStats {
  medianMinutes: number;
  avgMinutes: number;
  sampleSize: number;
}

interface ReportData {
  totalTickets: number;
  openCount: number;
  closedCount: number;
  awaitingFirstResponse: number;
  byStatus: Record<string, number>;
  byPriority: Record<string, number>;
  firstResponse: ResponseStats;
  resolution: ResponseStats;
  days: number;
  volumeTrend: TrendDay[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtMinutes(mins: number): string {
  if (mins === 0) return '—';
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `${h}h ${mins % 60}m`;
  const d = Math.floor(h / 24);
  const rh = h % 24;
  return rh > 0 ? `${d}d ${rh}h` : `${d}d`;
}

const STATUS_LABEL: Record<string, string> = {
  open: 'Abierto',
  in_progress: 'En curso',
  waiting_on_customer: 'Esperando al cliente',
  resolved: 'Resuelto',
  closed: 'Cerrado',
};

const PRIORITY_COLOR: Record<string, string> = {
  urgent: '#ef4444',
  high: '#f97316',
  medium: '#eab308',
  low: '#22c55e',
};

// ── Sub-components ────────────────────────────────────────────────────────────

function StatCard({
  icon,
  label,
  value,
  sub,
}: {
  icon: string;
  label: string;
  value: string | number;
  sub?: string;
}) {
  return (
    <div className={`${pCard} p-5 flex items-start gap-4`}>
      <span className="material-icons text-2xl text-primary mt-0.5">{icon}</span>
      <div>
        <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">{label}</p>
        <p className="font-display text-2xl font-extrabold tracking-[-0.02em] text-foreground mt-0.5">{value}</p>
        {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className={`${pCard} p-10 text-center text-sm text-muted-foreground`}>
      {message}
    </div>
  );
}

// Inline SVG bar chart — two series (opened / resolved) per day.
function VolumeTrendChart({ trend }: { trend: TrendDay[] }) {
  if (trend.length === 0) return <EmptyState message="Aún no hay datos de volumen de tickets." />;

  const W = 720;
  const H = 200;
  const PAD = { top: 16, right: 16, bottom: 32, left: 36 };
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;

  const maxVal = Math.max(1, ...trend.flatMap((d) => [d.opened, d.resolved]));
  const groupW = innerW / trend.length;
  const barW = Math.min(20, (groupW - 4) / 2);

  const yAt = (v: number) => PAD.top + innerH - (innerH * (v / maxVal));
  // Dedupe: at maxVal 0/1 the ticks collide and duplicate React keys (QAD-008).
  const yTicks = [...new Set([0, Math.round(maxVal / 2), maxVal])];

  // Show x-axis labels at up to 7 evenly-spaced positions.
  const labelCount = Math.min(7, trend.length);
  const labelIndices = Array.from({ length: labelCount }, (_, i) =>
    Math.round(i * (trend.length - 1) / (labelCount - 1 || 1)),
  );

  return (
    <div className={`${pCard} p-4`}>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label="Tendencia de volumen de tickets">
        {/* Grid lines + y labels */}
        {yTicks.map((t) => (
          <g key={`y-${t}`}>
            <line
              x1={PAD.left} x2={W - PAD.right}
              y1={yAt(t)} y2={yAt(t)}
              stroke="currentColor" strokeOpacity="0.1"
            />
            <text
              x={PAD.left - 8} y={yAt(t) + 4}
              fontSize="10" textAnchor="end"
              fill="currentColor" fillOpacity="0.5"
            >
              {t}
            </text>
          </g>
        ))}

        {/* Bars */}
        {trend.map((d, i) => {
          const cx = PAD.left + groupW * i + groupW / 2;
          const openedH = Math.max(0, innerH * (d.opened / maxVal));
          const resolvedH = Math.max(0, innerH * (d.resolved / maxVal));
          return (
            <g key={d.date}>
              {/* opened bar */}
              <rect
                x={cx - barW - 1}
                y={yAt(d.opened)}
                width={barW}
                height={openedH}
                fill="hsl(var(--primary, 222 47% 51%))"
                fillOpacity="0.85"
              >
                <title>{d.date}: {d.opened} abiertos</title>
              </rect>
              {/* resolved bar */}
              <rect
                x={cx + 1}
                y={yAt(d.resolved)}
                width={barW}
                height={resolvedH}
                fill="currentColor"
                fillOpacity="0.25"
              >
                <title>{d.date}: {d.resolved} resueltos</title>
              </rect>
            </g>
          );
        })}

        {/* X-axis labels */}
        {labelIndices.map((i) => (
          <text
            key={`x-${i}`}
            x={PAD.left + groupW * i + groupW / 2}
            y={H - PAD.bottom + 16}
            fontSize="10" textAnchor="middle"
            fill="currentColor" fillOpacity="0.5"
          >
            {trend[i].date.slice(5)}
          </text>
        ))}
      </svg>

      <div className="flex items-center justify-center gap-4 text-xs text-muted-foreground mt-2">
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 bg-primary rounded-sm opacity-85" />
          Abiertos
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 bg-current rounded-sm opacity-25" />Resuelto</span>
      </div>
    </div>
  );
}

// Simple horizontal bar rows for status / priority breakdown.
function BreakdownBars({
  entries,
  total,
  colorMap,
}: {
  entries: { label: string; value: number }[];
  total: number;
  colorMap?: Record<string, string>;
}) {
  if (entries.length === 0) return <EmptyState message="Sin datos." />;
  return (
    <div className={`${pCard} p-4 space-y-3`}>
      {entries.map(({ label, value }) => {
        const pct = total > 0 ? Math.round((value / total) * 100) : 0;
        const color = colorMap?.[label.toLowerCase()] ?? 'hsl(var(--primary, 222 47% 51%))';
        return (
          <div key={label} className="grid grid-cols-[160px_1fr_auto] items-center gap-3 text-sm">
            <span className="text-foreground capitalize truncate">{label}</span>
            <div className="h-5 bg-muted rounded overflow-hidden">
              <div
                className="h-full rounded transition-all"
                style={{ width: `${pct}%`, backgroundColor: color, minWidth: value > 0 ? 4 : 0 }}
              />
            </div>
            <span className="text-xs text-muted-foreground tabular-nums shrink-0 w-16 text-right">
              {value} ({pct}%)
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function TicketReportsPage() {
  const [data, setData] = useState<ReportData | null>(null);
  const [days, setDays] = useState(30);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/portal/tickets/reports?days=${days}`);
        const json = await res.json();
        if (cancelled) return;
        if (json.success) {
          setData(json.data as ReportData);
        } else {
          setError(json.message ?? 'No se pudieron cargar los datos del informe.');
        }
      } catch {
        if (!cancelled) setError('Error de red al cargar los datos del informe.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [days]);

  const statusEntries = data
    ? Object.entries(data.byStatus).map(([k, v]) => ({
        label: STATUS_LABEL[k] ?? k,
        value: v,
      }))
    : [];

  const priorityEntries = data
    ? Object.entries(data.byPriority).map(([k, v]) => ({ label: k, value: v }))
    : [];

  const priorityTotal = priorityEntries.reduce((s, e) => s + e.value, 0);

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Header + nav */}
      <PortalPageHeader
        eyebrow="Soporte"
        title="Informes de soporte"
        subtitle="Tiempos de respuesta, estadísticas de resolución y volumen de tickets de tu cola de soporte."
        actions={
          <Link href="/portal/tickets" className={pBtnGhost}>
            <span className="material-icons text-base">arrow_back</span>
            Todos los tickets
          </Link>
        }
      />

      {/* Tab strip */}
      <nav className="flex gap-1 border-b border-border">
        <Link
          href="/portal/tickets"
          className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent rounded-t transition-colors"
        >
          Tickets
        </Link>
        <span
          className="px-4 py-2 text-sm font-medium text-foreground border-b-2 border-primary -mb-px"
        >
          Informes
        </span>
      </nav>

      {loading && (
        <div className="flex items-center justify-center py-16">
          <span className="material-icons animate-spin text-primary text-2xl">refresh</span>
        </div>
      )}

      {error && !loading && (
        <div className="bg-destructive/10 border border-destructive/30 text-destructive rounded-xl p-4 text-sm flex items-center gap-2">
          <span className="material-icons text-base">error_outline</span>
          {error}
        </div>
      )}

      {data && !loading && (
        <>
          {/* ── Summary cards ─────────────────────────────────────────────── */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard
              icon="confirmation_number"
              label="Tickets totales"
              value={data.totalTickets}
            />
            <StatCard
              icon="inbox"
              label="Abierto"
              value={data.openCount}
              sub={
                data.awaitingFirstResponse > 0
                  ? `${data.awaitingFirstResponse} pendientes de primera respuesta`
                  : undefined
              }
            />
            <StatCard
              icon="check_circle"
              label="Resueltos / Cerrados"
              value={data.closedCount}
            />
            <StatCard
              icon="pending_actions"
              label="Pendientes de respuesta"
              value={data.awaitingFirstResponse}
              sub="abiertos sin respuesta del equipo todavía"
            />
          </div>

          {/* ── Response-time cards ────────────────────────────────────────── */}
          <section>
            <h2 className={`${pSectionTitle} mb-1`}>Tiempos de respuesta</h2>
            <p className="text-sm text-muted-foreground mb-3">
              Medido desde la creación del ticket hasta la primera respuesta del equipo / la resolución.
              Basado en {data.firstResponse.sampleSize} tickets respondidos y{' '}
              {data.resolution.sampleSize} resueltos.
            </p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <StatCard
                icon="reply"
                label="Primera respuesta mediana"
                value={fmtMinutes(data.firstResponse.medianMinutes)}
              />
              <StatCard
                icon="avg_pace"
                label="Primera respuesta promedio"
                value={fmtMinutes(data.firstResponse.avgMinutes)}
              />
              <StatCard
                icon="timer"
                label="Resolución mediana"
                value={fmtMinutes(data.resolution.medianMinutes)}
              />
              <StatCard
                icon="schedule"
                label="Resolución promedio"
                value={fmtMinutes(data.resolution.avgMinutes)}
              />
            </div>
          </section>

          {/* ── Volume trend ──────────────────────────────────────────────── */}
          <section>
            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
              <div>
                <h2 className={`${pSectionTitle}`}>Volumen de tickets</h2>
                <p className="text-sm text-muted-foreground">
                  Tickets abiertos vs. resueltos por día en los últimos {data.days} días.
                </p>
              </div>
              <select
                aria-label="Rango temporal del informe"
                value={days}
                onChange={(e) => setDays(parseInt(e.target.value, 10))}
                className="appearance-none rounded-xl border border-border bg-card px-3.5 py-2 pr-10 text-sm text-foreground outline-none transition focus:border-primary focus:ring-4 focus:ring-primary/15 w-auto"
              >
                <option value={7}>Últimos 7 días</option>
                <option value={14}>Últimos 14 días</option>
                <option value={30}>Últimos 30 días</option>
                <option value={60}>Últimos 60 días</option>
                <option value={90}>Últimos 90 días</option>
              </select>
            </div>
            <VolumeTrendChart trend={data.volumeTrend} />
          </section>

          {/* ── Status breakdown ──────────────────────────────────────────── */}
          <section>
            <h2 className={`${pSectionTitle} mb-1`}>Por estado</h2>
            <p className="text-sm text-muted-foreground mb-3">Total de tickets por estado.</p>
            <BreakdownBars
              entries={statusEntries}
              total={data.totalTickets}
            />
          </section>

          {/* ── Priority breakdown (open only) ────────────────────────────── */}
          <section>
            <h2 className={`${pSectionTitle} mb-1`}>Tickets abiertos por prioridad</h2>
            <p className="text-sm text-muted-foreground mb-3">
              Distribución de los tickets abiertos actualmente por nivel de prioridad.
            </p>
            <BreakdownBars
              entries={priorityEntries}
              total={priorityTotal}
              colorMap={PRIORITY_COLOR}
            />
          </section>
        </>
      )}
    </div>
  );
}
