'use client';

import Link from 'next/link';
import { useEffect, useState, useCallback, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { PortalPageHeader } from '@/components/portal/PortalPageHeader';
import { pBtnPrimary, pBtnGhost, pSelect, pInput } from '@/components/portal/portal-ui';

interface RelationshipListRow {
  overlay: {
    id: number;
    relationshipType: string;
    status: 'active' | 'paused' | 'archived';
    priority: 'low' | 'medium' | 'high' | 'critical';
    ownerId: number | null;
    summary: string | null;
    currentPriorities: string | null;
    nextReviewAt: string | null;
    lastTouchAt: string | null;
    staleAfterDays: number | null;
    confidentialityLevel: string;
    serviceLines: string[];
  };
  underlying: { type: 'company' | 'deal'; id: number; name: string; secondaryName?: string };
  openTaskCount: number;
  isStale: boolean;
}

interface CrmSuggestions {
  companies: { id: number; name: string; industry: string | null; hasOverlay: boolean }[];
  deals: { id: number; title: string; companyName: string | null; hasOverlay: boolean }[];
}

const PRIORITY_TONE: Record<RelationshipListRow['overlay']['priority'], string> = {
  low: 'bg-muted text-muted-foreground',
  medium: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
  high: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  critical: 'bg-red-500/10 text-red-600 dark:text-red-400',
};

type View = 'all' | 'prospects' | 'stale';
const VIEWS: { key: View; label: string; icon: string }[] = [
  { key: 'all', label: 'Todos', icon: 'group_work' },
  { key: 'prospects', label: 'Prospectos', icon: 'person_search' },
  { key: 'stale', label: 'Sin seguimiento', icon: 'schedule' },
];

const VIEW_HEADER: Record<View, { title: string; icon: string; subtitle: string }> = {
  all: {
    title: 'Relaciones',
    icon: 'group_work',
    subtitle: 'Relaciones seguidas por el Brain, superpuestas a tus empresas y negocios del CRM.',
  },
  prospects: {
    title: 'Prospectos',
    icon: 'person_search',
    subtitle: 'Relaciones marcadas como prospectos: oportunidades en fase temprana que estás cultivando.',
  },
  stale: {
    title: 'Relaciones sin seguimiento',
    icon: 'schedule',
    subtitle: 'Pendientes de seguimiento, según el umbral sin seguimiento configurado en cada una.',
  },
};

export default function BrainRelationshipsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialView = (searchParams.get('view') as View) ?? 'all';
  const [view, setViewState] = useState<View>(VIEWS.some((v) => v.key === initialView) ? initialView : 'all');
  const [rows, setRows] = useState<RelationshipListRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [priorityFilter, setPriorityFilter] = useState<string>('');
  const [typeFilter, setTypeFilter] = useState<string>('');
  const [showCreate, setShowCreate] = useState(false);

  const setView = useCallback((next: View) => {
    setViewState(next);
    const params = new URLSearchParams(searchParams.toString());
    if (next === 'all') params.delete('view');
    else params.set('view', next);
    const qs = params.toString();
    router.replace(qs ? `?${qs}` : '?', { scroll: false });
  }, [router, searchParams]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (priorityFilter) params.set('priority', priorityFilter);
      if (typeFilter) {
        params.set('type', typeFilter);
      } else if (view === 'prospects') {
        params.set('type', 'prospect');
      }
      if (view === 'stale') params.set('stale', 'true');
      const r = await fetch(`/api/portal/brain/relationships?${params.toString()}`);
      const json = await r.json();
      if (!r.ok || !json.success) {
        setError(json.message || 'No se pudo cargar.');
      } else {
        setRows(json.data);
        setError(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error de red');
    } finally {
      setLoading(false);
    }
  }, [priorityFilter, typeFilter, view]);

  useEffect(() => { load(); }, [load]);

  const types = useMemo(() => {
    const set = new Set(rows.map((r) => r.overlay.relationshipType));
    return Array.from(set).sort();
  }, [rows]);

  const sorted = useMemo(() => {
    if (view === 'all') return rows;
    return [...rows].sort((a, b) => {
      if (a.isStale !== b.isStale) return a.isStale ? -1 : 1;
      const aTouch = a.overlay.lastTouchAt ? new Date(a.overlay.lastTouchAt).getTime() : 0;
      const bTouch = b.overlay.lastTouchAt ? new Date(b.overlay.lastTouchAt).getTime() : 0;
      if (aTouch !== bTouch) return aTouch - bTouch;
      const priRank: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1 };
      return (priRank[b.overlay.priority] ?? 0) - (priRank[a.overlay.priority] ?? 0);
    });
  }, [rows, view]);

  const header = VIEW_HEADER[view];
  const emptyCopy = view === 'stale'
    ? { icon: 'check_circle', title: 'No hay relaciones sin seguimiento.', hint: 'Configura un umbral sin seguimiento en cualquier relación para empezar a detectar el abandono.' }
    : view === 'prospects'
      ? { icon: 'person_search', title: 'Aún no hay prospectos.', hint: 'Etiqueta una relación con el tipo "prospect" para que aparezca aquí.' }
      : { icon: 'group_work', title: 'Aún no hay relaciones.', hint: 'Elige una empresa u oportunidad del CRM para empezar a seguirla como relación del Brain.' };

  return (
    <div className="max-w-5xl mx-auto py-8 space-y-6">
      <PortalPageHeader
        eyebrow="Cerebro de empresa"
        title={<span className="flex items-center gap-2"><span className="material-icons text-primary">{header.icon}</span>{header.title}</span>}
        subtitle={header.subtitle}
        actions={
          <button
            onClick={() => setShowCreate(true)}
            className={pBtnPrimary}
          >
            <span className="material-icons text-base">add</span>Nueva relación</button>
        }
      />

      {error && (
        <div className="bg-destructive/10 border border-destructive/30 rounded-md p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="flex items-center gap-1 border-b border-border overflow-x-auto -mx-4 sm:mx-0 px-4 sm:px-0">
        {VIEWS.map((v) => (
          <button
            key={v.key}
            onClick={() => setView(v.key)}
            className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors inline-flex items-center gap-1.5 whitespace-nowrap ${
              view === v.key
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <span className="material-icons text-base">{v.icon}</span>
            {v.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <span className="text-xs text-muted-foreground">Filtrar:</span>
        <select
          aria-label="Filtrar por prioridad" value={priorityFilter}
          onChange={(e) => setPriorityFilter(e.target.value)}
          className={pSelect}
        >
          <option value="">Todas las prioridades</option>
          <option value="critical">Critical</option>
          <option value="high">Alta</option>
          <option value="medium">Media</option>
          <option value="low">Baja</option>
        </select>
        {types.length > 0 && (
          <select
            aria-label="Filtrar por tipo" value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className={pSelect}
          >
            <option value="">Todos los tipos</option>
            {types.map((t) => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
          </select>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <span className="material-icons animate-spin mr-2">progress_activity</span>Cargando…</div>
      ) : sorted.length === 0 ? (
        <div className="text-center py-12 bg-card border border-border rounded-2xl">
          <span className="material-icons text-4xl text-muted-foreground mb-2 block">{emptyCopy.icon}</span>
          <p className="text-sm text-foreground font-medium">{emptyCopy.title}</p>
          <p className="text-muted-foreground text-xs mt-1 mb-4">{emptyCopy.hint}</p>
          {view === 'all' && (
            <button
              onClick={() => setShowCreate(true)}
              className={pBtnPrimary}
            >
              <span className="material-icons text-base">add</span>Nueva relación</button>
          )}
        </div>
      ) : view === 'all' ? (
        <div className="grid gap-3 md:grid-cols-2">
          {sorted.map((row) => <RelationshipCard key={row.overlay.id} row={row} />)}
        </div>
      ) : (
        <div className="bg-card border border-border rounded-2xl divide-y divide-border">
          {sorted.map((row) => <RelationshipRow key={row.overlay.id} row={row} />)}
        </div>
      )}

      {showCreate && (
        <CreateRelationshipModal
          onClose={() => setShowCreate(false)}
          onCreated={(id) => { window.location.href = `/portal/brain/relationships/${id}`; }}
        />
      )}
    </div>
  );
}

function RelationshipCard({ row }: { row: RelationshipListRow }) {
  return (
    <Link
      href={`/portal/brain/relationships/${row.overlay.id}`}
      className="bg-card border border-border rounded-2xl p-4 hover:border-primary/50 transition-colors"
    >
      <div className="flex items-start justify-between gap-2 mb-1">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-foreground truncate flex items-center gap-1.5">
            <span className="material-icons text-base text-muted-foreground">
              {row.underlying.type === 'company' ? 'business' : 'handshake'}
            </span>
            {row.underlying.name}
          </div>
          {row.underlying.secondaryName && (
            <div className="text-xs text-muted-foreground mt-0.5">{row.underlying.secondaryName}</div>
          )}
        </div>
        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${PRIORITY_TONE[row.overlay.priority]} flex-shrink-0`}>
          {row.overlay.priority}
        </span>
      </div>
      <div className="text-xs text-muted-foreground mt-1 flex items-center gap-2 flex-wrap">
        <span>{row.overlay.relationshipType.replace(/_/g, ' ')}</span>
        {row.openTaskCount > 0 && (
          <span className="inline-flex items-center gap-0.5">
            <span className="material-icons text-sm">checklist</span>
            {row.openTaskCount} open
          </span>
        )}
        {row.isStale && (
          <span className="text-amber-600 dark:text-amber-400 inline-flex items-center gap-0.5">
            <span className="material-icons text-sm">schedule</span>
            stale
          </span>
        )}
        {row.overlay.confidentialityLevel !== 'standard' && (
          <span className="inline-flex items-center gap-0.5">
            <span className="material-icons text-sm">lock</span>
            {row.overlay.confidentialityLevel}
          </span>
        )}
      </div>
      {row.overlay.summary && (
        <p className="text-xs text-foreground mt-2 line-clamp-2">{row.overlay.summary}</p>
      )}
    </Link>
  );
}

function RelationshipRow({ row }: { row: RelationshipListRow }) {
  const lastTouch = row.overlay.lastTouchAt ? new Date(row.overlay.lastTouchAt) : null;
  const [days] = useState<number | null>(() =>
    lastTouch ? Math.floor((Date.now() - lastTouch.getTime()) / 86400000) : null
  );
  return (
    <Link
      href={`/portal/brain/relationships/${row.overlay.id}`}
      className="flex items-start gap-3 p-4 hover:bg-accent/50 transition-colors"
    >
      <span className="material-icons text-muted-foreground mt-0.5">
        {row.underlying.type === 'company' ? 'business' : 'handshake'}
      </span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="text-sm font-medium text-foreground truncate">{row.underlying.name}</span>
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${PRIORITY_TONE[row.overlay.priority]}`}>
            {row.overlay.priority}
          </span>
          {row.isStale && (
            <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400">
              stale
            </span>
          )}
        </div>
        <div className="text-xs text-muted-foreground flex items-center gap-2 flex-wrap">
          <span>{row.overlay.relationshipType.replace(/_/g, ' ')}</span>
          {row.underlying.secondaryName && <><span>·</span><span>{row.underlying.secondaryName}</span></>}
          {lastTouch && (
            <>
              <span>·</span>
              <span>último contacto {lastTouch.toLocaleDateString()} (hace {days}d)</span>
            </>
          )}
          {row.overlay.staleAfterDays && (
            <>
              <span>·</span>
              <span>sin seguimiento tras {row.overlay.staleAfterDays}d</span>
            </>
          )}
          {row.openTaskCount > 0 && (
            <>
              <span>·</span>
              <span className="inline-flex items-center gap-0.5">
                <span className="material-icons text-sm">checklist</span>
                {row.openTaskCount} open
              </span>
            </>
          )}
        </div>
        {row.overlay.summary && (
          <p className="text-xs text-foreground mt-1 line-clamp-2">{row.overlay.summary}</p>
        )}
      </div>
      <span className="material-icons text-muted-foreground self-center">chevron_right</span>
    </Link>
  );
}

function CreateRelationshipModal({ onClose, onCreated }: { onClose: () => void; onCreated: (id: number) => void }) {
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<CrmSuggestions | null>(null);
  const [picked, setPicked] = useState<{ type: 'company' | 'deal'; id: number; name: string } | null>(null);
  const [relationshipType, setRelationshipType] = useState('generic');
  const [priority, setPriority] = useState<'low' | 'medium' | 'high' | 'critical'>('medium');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetch(`/api/portal/brain/crm-suggestions?q=${encodeURIComponent(query)}`)
        .then((r) => r.json())
        .then((json) => { if (json.success) setSuggestions(json.data); })
        .catch(() => {});
    }, 200);
    return () => clearTimeout(timer);
  }, [query]);

  const submit = async () => {
    if (!picked) return;
    setSubmitting(true);
    setError(null);
    try {
      const r = await fetch('/api/portal/brain/relationships', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          [picked.type === 'company' ? 'companyId' : 'dealId']: picked.id,
          relationshipType,
          priority,
        }),
      });
      const json = await r.json();
      if (!r.ok || !json.success) {
        setError(json.message || 'No se pudo crear.');
        return;
      }
      onCreated(json.data.id);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-card border border-border rounded-2xl shadow-xl max-w-lg w-full p-5 space-y-4 max-h-[90vh] overflow-auto">
        <div>
          <h3 className="text-base font-semibold text-foreground">Nueva relación</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Elige una empresa u oportunidad del CRM para seguirla como relación del Brain.
          </p>
        </div>

        {error && (
          <div className="bg-destructive/10 border border-destructive/30 rounded-md p-2 text-xs text-destructive">{error}</div>
        )}

        {!picked ? (
          <>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar empresas u oportunidades del CRM…"
              className={pInput}
              autoFocus
            />
            {suggestions && (
              <div className="space-y-3 max-h-80 overflow-auto">
                {suggestions.companies.length > 0 && (
                  <div>
                    <div className="text-xs font-medium text-muted-foreground mb-1">Empresas</div>
                    <div className="space-y-1">
                      {suggestions.companies.map((c) => (
                        <button
                          key={`c${c.id}`}
                          disabled={c.hasOverlay}
                          onClick={() => setPicked({ type: 'company', id: c.id, name: c.name })}
                          className={`w-full text-left px-3 py-2 rounded-xl border text-sm flex items-center justify-between ${
                            c.hasOverlay
                              ? 'border-border opacity-50 cursor-not-allowed'
                              : 'border-border hover:border-primary hover:bg-accent'
                          }`}
                        >
                          <span className="flex items-center gap-1.5 min-w-0">
                            <span className="material-icons text-base text-muted-foreground">business</span>
                            <span className="truncate">{c.name}</span>
                            {c.industry && <span className="text-xs text-muted-foreground truncate">· {c.industry}</span>}
                          </span>
                          {c.hasOverlay && <span className="text-xs text-muted-foreground flex-shrink-0">ya en seguimiento</span>}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {suggestions.deals.length > 0 && (
                  <div>
                    <div className="text-xs font-medium text-muted-foreground mb-1">Oportunidades</div>
                    <div className="space-y-1">
                      {suggestions.deals.map((d) => (
                        <button
                          key={`d${d.id}`}
                          disabled={d.hasOverlay}
                          onClick={() => setPicked({ type: 'deal', id: d.id, name: d.title })}
                          className={`w-full text-left px-3 py-2 rounded-xl border text-sm flex items-center justify-between ${
                            d.hasOverlay
                              ? 'border-border opacity-50 cursor-not-allowed'
                              : 'border-border hover:border-primary hover:bg-accent'
                          }`}
                        >
                          <span className="flex items-center gap-1.5 min-w-0">
                            <span className="material-icons text-base text-muted-foreground">handshake</span>
                            <span className="truncate">{d.title}</span>
                            {d.companyName && <span className="text-xs text-muted-foreground truncate">· {d.companyName}</span>}
                          </span>
                          {d.hasOverlay && <span className="text-xs text-muted-foreground flex-shrink-0">ya en seguimiento</span>}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {suggestions.companies.length === 0 && suggestions.deals.length === 0 && (
                  <p className="text-xs text-muted-foreground py-4 text-center">Sin resultados.</p>
                )}
              </div>
            )}
          </>
        ) : (
          <div className="space-y-3">
            <div className="bg-muted/30 border border-border rounded-xl p-3 flex items-center justify-between">
              <div className="flex items-center gap-2 min-w-0">
                <span className="material-icons text-base text-muted-foreground">{picked.type === 'company' ? 'business' : 'handshake'}</span>
                <span className="text-sm font-medium text-foreground truncate">{picked.name}</span>
              </div>
              <button onClick={() => setPicked(null)} className="text-xs text-muted-foreground hover:text-foreground">Cambiar</button>
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Tipo de relación</label>
              <input
                type="text"
                value={relationshipType}
                onChange={(e) => setRelationshipType(e.target.value)}
                placeholder="p. ej., hogar, prospecto, partner_de_referencias"
                className={pInput}
              />
            </div>
            <div>
              <label htmlFor="new-relationship-priority" className="block text-xs font-medium text-muted-foreground mb-1">Prioridad</label>
              <select
                id="new-relationship-priority" value={priority}
                onChange={(e) => setPriority(e.target.value as typeof priority)}
                className={pSelect}
              >
                <option value="low">Baja</option>
                <option value="medium">Media</option>
                <option value="high">Alta</option>
                <option value="critical">Critical</option>
              </select>
            </div>
          </div>
        )}

        <div className="flex items-center justify-end gap-2 pt-2">
          <button onClick={onClose} className={pBtnGhost}>Cancelar</button>
          <button
            onClick={submit}
            disabled={!picked || submitting}
            className={pBtnPrimary}
          >
            {submitting
              ? <><span className="material-icons animate-spin text-base">progress_activity</span>Creando…</>
              : <>Crear relación</>
            }
          </button>
        </div>
      </div>
    </div>
  );
}
