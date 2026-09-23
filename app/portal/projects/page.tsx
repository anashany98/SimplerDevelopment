'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { PortalPageHeader } from '@/components/portal/PortalPageHeader';
import { pBtnPrimary, pBtnGhost, pInput, pSelect } from '@/components/portal/portal-ui';
import DomainGetStarted from '@/components/portal/onboarding/DomainGetStarted';
import { ProjectGrid, ProjectTable, type Project } from '@/components/portal/ProjectListViews';

// ─── Types ───────────────────────────────────────────────────────────────────

const STATUS_TABS = ['all', 'active', 'paused', 'completed', 'archived'] as const;
const STATUS_LABELS: Record<StatusFilter, string> = { all: 'Todos', active: 'Activos', paused: 'En pausa', completed: 'Completados', archived: 'Archivados' };
type StatusFilter = typeof STATUS_TABS[number];

// ─── Component ───────────────────────────────────────────────────────────────

export default function PortalProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createForm, setCreateForm] = useState({
    name: '',
    description: '',
    status: 'active',
    startDate: '',
    dueDate: '',
    cloneFromProjectId: '' as string,
  });
  const [creating, setCreating] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');

  const load = () => {
    setLoading(true);
    fetch('/api/portal/projects')
      .then(r => r.json())
      .then(res => {
        if (res.success) {
          // Server returns a flat array of projects post-unification. The
          // legacy { agency, private } shape is gone but keep a fallback for
          // a single rolling deploy where the client may receive either shape.
          if (Array.isArray(res.data)) setProjects(res.data);
          else if (res.data?.agency || res.data?.private) {
            setProjects([...(res.data.agency ?? []), ...(res.data.private ?? [])]);
          }
        }
      })
      .finally(() => setLoading(false));
  };

  // eslint-disable-next-line react-hooks/set-state-in-effect -- pre-existing pattern, predates this change
  useEffect(() => { load(); }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createForm.name.trim()) return;
    setCreating(true);
    try {
      const cloneId = createForm.cloneFromProjectId
        ? parseInt(createForm.cloneFromProjectId, 10)
        : null;
      const res = await fetch('/api/portal/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: createForm.name,
          description: createForm.description,
          status: createForm.status,
          startDate: createForm.startDate,
          dueDate: createForm.dueDate,
          cloneFromProjectId: cloneId,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setShowCreateForm(false);
        setCreateForm({ name: '', description: '', status: 'active', startDate: '', dueDate: '', cloneFromProjectId: '' });
        load();
      }
    } finally {
      setCreating(false);
    }
  };

  const filtered = useMemo(() => {
    return projects.filter(p => {
      // Archived projects are hidden from the default "all" view — reachable
      // only by explicitly selecting the Archived tab.
      if (statusFilter === 'all') {
        if (p.status === 'archived') return false;
      } else if (p.status !== statusFilter) return false;
      if (search) {
        const s = search.toLowerCase();
        return p.name.toLowerCase().includes(s)
          || (p.description ?? '').toLowerCase().includes(s);
      }
      return true;
    });
  }, [projects, search, statusFilter]);

  const counts = useMemo(() => ({
    active: projects.filter(p => p.status === 'active').length,
    paused: projects.filter(p => p.status === 'paused').length,
    completed: projects.filter(p => p.status === 'completed').length,
    total: projects.filter(p => p.status !== 'archived').length,
  }), [projects]);

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <PortalPageHeader
        eyebrow="Entrega"
        title="Proyectos"
        subtitle="Todos los proyectos a los que tienes acceso, tanto del equipo como propios."
        actions={
          <div className="flex gap-2 flex-wrap">
            <Link
              href="/portal/projects/automations"
              className={pBtnGhost}
            >
              <span className="material-icons text-base">bolt</span>
              Automatizaciones
            </Link>
            <button
              onClick={() => setShowCreateForm(!showCreateForm)}
              className={pBtnPrimary}
            >
              <span className="material-icons text-base">{showCreateForm ? 'close' : 'add'}</span>
              {showCreateForm ? 'Cancelar' : 'Nuevo proyecto'}
            </button>
          </div>
        }
      />

      <DomainGetStarted domainKey="projects" />

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-card border border-border rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <span className="material-icons text-base text-green-600">play_circle</span>
            <span className="text-xs text-muted-foreground font-medium">Activos</span>
          </div>
          <p className="text-2xl font-display font-extrabold tracking-[-0.02em] text-foreground">{counts.active}</p>
        </div>
        <div className="bg-card border border-border rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <span className="material-icons text-base text-yellow-600">pause_circle</span>
            <span className="text-xs text-muted-foreground font-medium">En pausa</span>
          </div>
          <p className="text-2xl font-display font-extrabold tracking-[-0.02em] text-foreground">{counts.paused}</p>
        </div>
        <div className="bg-card border border-border rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <span className="material-icons text-base text-blue-600">check_circle</span>
            <span className="text-xs text-muted-foreground font-medium">Completados</span>
          </div>
          <p className="text-2xl font-display font-extrabold tracking-[-0.02em] text-foreground">{counts.completed}</p>
        </div>
        <div className="bg-card border border-border rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <span className="material-icons text-base text-muted-foreground">folder</span>
            <span className="text-xs text-muted-foreground font-medium">Total</span>
          </div>
          <p className="text-2xl font-display font-extrabold tracking-[-0.02em] text-foreground">{counts.total}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-2 px-3 py-2 bg-card border border-border rounded-xl flex-1 max-w-sm">
          <span className="material-icons text-muted-foreground text-base">search</span>
          <input
            className="bg-transparent text-sm outline-none flex-1 text-foreground placeholder:text-muted-foreground/50"
            placeholder="Buscar proyectos..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div className="flex gap-1 flex-wrap">
          {STATUS_TABS.map(s => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-colors capitalize ${
                statusFilter === s
                  ? 'bg-foreground text-background'
                  : 'border border-border text-muted-foreground hover:bg-accent'
              }`}
            >
              {STATUS_LABELS[s]}
            </button>
          ))}
        </div>
        {/* Cards / table view toggle */}
        <div className="flex gap-1 ml-auto">
          {([['cards', 'grid_view', 'Vista de tarjetas'], ['table', 'table_rows', 'Vista de tabla']] as const).map(([mode, icon, label]) => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              title={mode === 'cards' ? 'Vista de tarjetas' : 'Vista de tabla'}
              aria-label={mode === 'cards' ? 'Vista de tarjetas' : 'Vista de tabla'}
              aria-pressed={viewMode === mode}
              className={`p-1.5 rounded-xl transition-colors ${
                viewMode === mode
                  ? 'bg-foreground text-background'
                  : 'border border-border text-muted-foreground hover:bg-accent'
              }`}
            >
              <span className="material-icons text-base">{icon}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Create form */}
      {showCreateForm && (
        <form onSubmit={handleCreate} className="bg-card border border-border rounded-2xl p-5 space-y-4">
          <h2 className="text-sm font-display font-extrabold tracking-[-0.01em] text-foreground">Crear proyecto</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Nombre del proyecto <span className="text-destructive">*</span></label>
              <input
                value={createForm.name}
                onChange={e => setCreateForm(p => ({ ...p, name: e.target.value }))}
                required
                placeholder="p. ej., Campaña de marketing del segundo trimestre"
                className={pInput}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Estado</label>
              <select
                value={createForm.status}
                onChange={e => setCreateForm(p => ({ ...p, status: e.target.value }))}
                className={pSelect}
              >
                <option value="active">Activo</option>
                <option value="paused">En pausa</option>
                <option value="completed">Completado</option>
                <option value="archived">Archivado</option>
              </select>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <label className="text-sm font-medium text-foreground">Descripción</label>
              <textarea
                rows={2}
                value={createForm.description}
                onChange={e => setCreateForm(p => ({ ...p, description: e.target.value }))}
                placeholder="Opcional"
                className="w-full rounded-xl border border-border bg-card px-3.5 py-2.5 text-sm text-foreground outline-none transition placeholder:text-muted-foreground/50 focus:border-primary focus:ring-4 focus:ring-primary/15 resize-none"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Fecha de inicio</label>
              <input
                type="date"
                value={createForm.startDate}
                onChange={e => setCreateForm(p => ({ ...p, startDate: e.target.value }))}
                className={pInput}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Fecha límite</label>
              <input
                type="date"
                value={createForm.dueDate}
                onChange={e => setCreateForm(p => ({ ...p, dueDate: e.target.value }))}
                className={pInput}
              />
            </div>
            {projects.length > 0 && (
              <div className="space-y-1.5 sm:col-span-2">
                <label className="text-sm font-medium text-foreground">Clonar un proyecto existente</label>
                <select
                  value={createForm.cloneFromProjectId}
                  onChange={e => setCreateForm(p => ({ ...p, cloneFromProjectId: e.target.value }))}
                  className={pSelect}
                >
                  <option value="">— Empezar desde cero —</option>
                  {projects.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
                <p className="text-xs text-muted-foreground">Copia columnas, etiquetas y plantillas de tarjetas. Las tarjetas no se copian.</p>
              </div>
            )}
          </div>
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={creating}
              className={pBtnPrimary}
            >
              {creating && <span className="material-icons text-base animate-spin">refresh</span>}
              Crear proyecto
            </button>
          </div>
        </form>
      )}

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <span className="material-icons animate-spin text-primary text-2xl">refresh</span>
        </div>
      ) : viewMode === 'table' ? (
        <ProjectTable
          projects={filtered}
          emptyMessage={
            search || statusFilter !== 'all'
              ? 'No hay proyectos que coincidan con tus filtros.'
              : 'Aún no hay proyectos. Crea el primero o espera a que tu equipo configure uno.'
          }
        />
      ) : (
        <ProjectGrid
          projects={filtered}
          emptyMessage={
            search || statusFilter !== 'all'
              ? 'No hay proyectos que coincidan con tus filtros.'
              : 'Aún no hay proyectos. Crea el primero o espera a que tu equipo configure uno.'
          }
        />
      )}
    </div>
  );
}
