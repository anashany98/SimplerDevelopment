'use client';

/**
 * Brain Org Chart — admin page.
 *
 * Layout (≥md):
 *   ┌────────────────────────────────────┬──────────────────────┐
 *   │  Header: Org Chart · N units       │   Selected unit       │
 *   │  [New unit] [Compact / Expanded]   │   ─────────           │
 *   │                                    │   Breadcrumb          │
 *   │  <OrgUnitTree>                     │   Name (inline edit)  │
 *   │                                    │   description…       │
 *   │                                    │   Lead person         │
 *   │                                    │   Members (páginated)│
 *   │                                    │   [+ Add member]      │
 *   │                                    │   [Delete unit]       │
 *   └────────────────────────────────────┴──────────────────────┘
 *
 * Person-picking flows (set-lead modal, add-member dialog, create-unit lead
 * field) all drive the shared `<PersonPicker>` from
 * `components/brain/PersonPicker.tsx` via its `onChangeWithHit` callback —
 * which hands back the full PersonHit (`{ id, fullName, title, email }`) so
 * the caller can render the selection inline without a follow-up
 * `GET /people/<id>`.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import OrgUnitTree from '@/components/brain/OrgUnitTree';
import { PersonPicker, type PersonHit } from '@/components/brain/PersonPicker';
import type {
  BrainOrgUnitTreeNode,
  BrainOrgUnitWithDetails,
  OrgUnitMemberSummary,
} from '@/lib/brain/org-units';
import { PortalPageHeader } from '@/components/portal/PortalPageHeader';
import { pBtnPrimary, pBtnGhost, pCard, pInput, pSelect } from '@/components/portal/portal-ui';

// ─── Shared types ────────────────────────────────────────────────────────────

const MEMBERS_PAGE_SIZE = 25;
const COLOR_PRESETS = [
  '', '#ef4444', '#f97316', '#eab308', '#22c55e', '#14b8a6', '#3b82f6', '#8b5cf6', '#ec4899',
];
const ICON_PRESETS = [
  'groups', 'engineering', 'design_services', 'business_center', 'support_agent', 'campaign',
  'science', 'savings', 'gavel', 'school', 'rocket_launch', 'health_and_safety',
];

// ─── Page ────────────────────────────────────────────────────────────────────

export default function BrainOrgChartPage() {
  const [tree, setTree] = useState<BrainOrgUnitTreeNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [compactView, setCompactView] = useState(false);
  const [showNewUnitModal, setShowNewUnitModal] = useState(false);

  const loadTree = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch('/api/portal/brain/org-units?as=tree');
      const json = await r.json();
      if (!r.ok || !json.success) {
        setError(json.message || 'No se pudieron cargar las unidades organizativas.');
        return;
      }
      setTree((json.data?.tree as BrainOrgUnitTreeNode[]) ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error de red');
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch-on-mount. loadTree() sets state via setState calls inside async
  // callbacks — the lint rule trips on the synchronous setLoading(true) at
  // the head of loadTree. This is the standard "fetch on mount" pattern in
  // this codebase; suppressed in line with the rest of app/portal/**.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { loadTree(); }, [loadTree]);

  const flatCount = useMemo(() => {
    const walk = (nodes: BrainOrgUnitTreeNode[]): number =>
      nodes.reduce((acc, n) => acc + 1 + walk(n.children), 0);
    return walk(tree);
  }, [tree]);

  // ─── Tree actions ─────────────────────────────────────────────────────────
  const handleMove = useCallback(async (sourceId: number, newParentId: number | null) => {
    const r = await fetch(`/api/portal/brain/org-units/${sourceId}/move`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ newParentId }),
    });
    const json = await r.json().catch(() => ({}));
    if (!r.ok || !json.success) {
      alert(json.message || 'No se pudo mover la unidad.');
      return;
    }
    await loadTree();
  }, [loadTree]);

  const handleRename = useCallback(async (id: number, newName: string) => {
    const r = await fetch(`/api/portal/brain/org-units/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newName }),
    });
    const json = await r.json().catch(() => ({}));
    if (!r.ok || !json.success) {
      alert(json.message || 'No se pudo renombrar la unidad.');
      return;
    }
    await loadTree();
  }, [loadTree]);

  const handleDelete = useCallback(async (id: number, force: boolean) => {
    const r = await fetch(`/api/portal/brain/org-units/${id}${force ? '?force=true' : ''}`, {
      method: 'DELETE',
    });
    const json = await r.json().catch(() => ({}));
    if (!r.ok || !json.success) {
      alert(json.message || 'No se pudo eliminar la unidad.');
      return;
    }
    if (selectedId === id) setSelectedId(null);
    await loadTree();
  }, [loadTree, selectedId]);

  const handleMerge = useCallback(async (sourceId: number, targetId: number) => {
    const r = await fetch(`/api/portal/brain/org-units/${sourceId}/merge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetOrgUnitId: targetId }),
    });
    const json = await r.json().catch(() => ({}));
    if (!r.ok || !json.success) {
      alert(json.message || 'No se pudieron fusionar las unidades.');
      return;
    }
    if (selectedId === sourceId) setSelectedId(targetId);
    await loadTree();
  }, [loadTree, selectedId]);

  const handleCreateChild = useCallback(async (parentId: number | null, name: string) => {
    const r = await fetch('/api/portal/brain/org-units', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, parentId }),
    });
    const json = await r.json().catch(() => ({}));
    if (!r.ok || !json.success) {
      alert(json.message || 'No se pudo crear la unidad.');
      return;
    }
    await loadTree();
    if (typeof json.data?.id === 'number') setSelectedId(json.data.id);
  }, [loadTree]);

  // ─── Render ───────────────────────────────────────────────────────────────
  if (loading && tree.length === 0) {
    return (
      <div className="max-w-7xl mx-auto flex items-center justify-center py-16 text-muted-foreground">
        <span className="material-icons animate-spin mr-2">autorenew</span>Cargando…</div>
    );
  }

  if (error && tree.length === 0) {
    return (
      <div className="max-w-3xl mx-auto py-12">
        <div className="bg-destructive/10 border border-destructive/30 rounded-2xl p-4 text-sm text-destructive">
          <div className="flex items-center gap-2 font-medium mb-1">
            <span className="material-icons text-base">error_outline</span>
            No se pudo cargar el organigrama
          </div>
          <p>{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto py-6 px-4 space-y-4">
      <PortalPageHeader
        eyebrow="Cerebro de empresa"
        title={
          <span className="flex items-center gap-2">
            <span className="material-icons text-primary">account_tree</span>
            Organigrama
          </span>
        }
        subtitle={`${flatCount} unidad${flatCount === 1 ? '' : 'es'} · arrastra las filas para reorganizar`}
        actions={
          <div className="flex items-center gap-2">
            <div className="inline-flex border border-border rounded-xl overflow-hidden" role="group" aria-label="Densidad">
              <button
                type="button"
                onClick={() => setCompactView(false)}
                className={`px-3 py-2 text-xs inline-flex items-center gap-1 font-semibold transition ${!compactView ? 'bg-muted text-foreground' : 'text-muted-foreground hover:bg-muted/60'}`}
                aria-pressed={!compactView}
              >
                <span className="material-icons text-sm">density_medium</span>
                Expandido
              </button>
              <button
                type="button"
                onClick={() => setCompactView(true)}
                className={`px-3 py-2 text-xs inline-flex items-center gap-1 font-semibold transition ${compactView ? 'bg-muted text-foreground' : 'text-muted-foreground hover:bg-muted/60'}`}
                aria-pressed={compactView}
              >
                <span className="material-icons text-sm">density_small</span>
                Compacto
              </button>
            </div>
            <button
              type="button"
              onClick={() => setShowNewUnitModal(true)}
              className={pBtnPrimary}
            >
              <span className="material-icons text-base">add</span>
              Nueva unidad
            </button>
          </div>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className={`lg:col-span-2 overflow-hidden ${pCard}`}>
          <div className={compactView ? 'text-xs [&_.material-icons]:!text-sm' : ''}>
            <OrgUnitTree
              tree={tree}
              selectedUnitId={selectedId}
              onSelect={(u) => setSelectedId(u.id)}
              enableDragDrop
              onMove={handleMove}
              onRename={handleRename}
              onDelete={handleDelete}
              onMerge={handleMerge}
              onCreateChild={handleCreateChild}
              showMemberCounts
            />
          </div>
        </div>

        <aside className="lg:col-span-1">
          {selectedId === null ? (
            <EmptySidePanel />
          ) : (
            <UnitSidePanel
              unitId={selectedId}
              onChanged={loadTree}
              onDeleted={() => { setSelectedId(null); loadTree(); }}
            />
          )}
        </aside>
      </div>

      {showNewUnitModal && (
        <NewUnitModal
          tree={tree}
          onClose={() => setShowNewUnitModal(false)}
          onCreated={(created) => {
            setShowNewUnitModal(false);
            setSelectedId(created.id);
            loadTree();
          }}
        />
      )}
    </div>
  );
}

// ─── Empty side panel ───────────────────────────────────────────────────────

function EmptySidePanel() {
  return (
    <div className={`${pCard} p-6 text-center text-sm text-muted-foreground`}>
      <span className="material-icons text-4xl text-muted-foreground/60 mb-2 block">account_tree</span>
      <p className="font-medium text-foreground">Nada seleccionado</p>
      <p className="text-xs mt-1">Selecciona una unidad organizativa o arrastra las filas para reorganizar.</p>
    </div>
  );
}

// ─── Unit side panel ────────────────────────────────────────────────────────

function UnitSidePanel({
  unitId,
  onChanged,
  onDeleted,
}: {
  unitId: number;
  onChanged: () => void;
  onDeleted: () => void;
}) {
  const [details, setDetails] = useState<BrainOrgUnitWithDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Editable fields (local buffer, committed on blur / Enter).
  const [nameDraft, setNameDraft] = useState('');
  const [descDraft, setDescDraft] = useState('');
  const [savingField, setSavingField] = useState<string | null>(null);
  const [showAddMember, setShowAddMember] = useState(false);
  const [showLeadPicker, setShowLeadPicker] = useState(false);
  const [memberPage, setMemberPage] = useState(0);
  const [showDeleteUnit, setShowDeleteUnit] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`/api/portal/brain/org-units/${unitId}`);
      const json = await r.json();
      if (!r.ok || !json.success) {
        setError(json.message || 'No se pudo cargar la unidad.');
        return;
      }
      const data = json.data as BrainOrgUnitWithDetails;
      setDetails(data);
      setNameDraft(data.unit.name);
      setDescDraft(data.unit.description ?? '');
      setMemberPage(0);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error de red');
    } finally {
      setLoading(false);
    }
  }, [unitId]);

  // Same fetch-on-mount pattern as the top-level loadTree above.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  const patchUnit = async (patch: Record<string, unknown>, fieldLabel: string) => {
    setSavingField(fieldLabel);
    try {
      const r = await fetch(`/api/portal/brain/org-units/${unitId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      const json = await r.json().catch(() => ({}));
      if (!r.ok || !json.success) {
        alert(json.message || 'No se pudo actualizar la unidad.');
        return false;
      }
      await load();
      onChanged();
      return true;
    } finally {
      setSavingField(null);
    }
  };

  const removeMember = async (personId: number) => {
    const r = await fetch(`/api/portal/brain/org-units/${unitId}/members`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ personId }),
    });
    const json = await r.json().catch(() => ({}));
    if (!r.ok || !json.success) {
      alert(json.message || 'No se pudo quitar al miembro.');
      return;
    }
    await load();
    onChanged();
  };

  const setPrimary = async (personId: number, primary: boolean, roleInUnit: string | null) => {
    // The members POST endpoint upserts on (personId, orgUnitId). Re-POSTing
    // with primary=true also flips primary=false on the person's other
    // memberships (handled in `addMember` server-side).
    const r = await fetch(`/api/portal/brain/org-units/${unitId}/members`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ personId, primary, roleInUnit }),
    });
    const json = await r.json().catch(() => ({}));
    if (!r.ok || !json.success) {
      alert(json.message || 'No se pudo actualizar la unidad principal.');
      return;
    }
    await load();
    onChanged();
  };

  if (loading && !details) {
    return (
      <div className={`${pCard} p-6 text-center text-sm text-muted-foreground`}>
        <span className="material-icons animate-spin mr-2">autorenew</span>
        Cargando unidad…
      </div>
    );
  }

  if (error || !details) {
    return (
      <div className="bg-destructive/10 border border-destructive/30 rounded-2xl p-4 text-sm text-destructive">
        <div className="flex items-center gap-2 font-medium mb-1">
          <span className="material-icons text-base">error_outline</span>
          No se pudo cargar la unidad
        </div>
        <p>{error}</p>
      </div>
    );
  }

  const { unit, ancestors, members } = details;
  const pagedMembers = members.slice(
    memberPage * MEMBERS_PAGE_SIZE,
    memberPage * MEMBERS_PAGE_SIZE + MEMBERS_PAGE_SIZE,
  );
  const totalPages = Math.max(1, Math.ceil(members.length / MEMBERS_PAGE_SIZE));

  return (
    <div className={`${pCard} p-4 space-y-4`}>
      {/* Breadcrumb */}
      <div className="flex items-center flex-wrap gap-1 text-xs text-muted-foreground">
        {ancestors.length === 0 ? (
          <span>Raíz</span>
        ) : (
          ancestors.map((a, i) => (
            <span key={a.id} className="inline-flex items-center gap-1">
              {i > 0 && <span className="material-icons text-[14px]">chevron_right</span>}
              <span>{a.name}</span>
            </span>
          ))
        )}
        {ancestors.length > 0 && <span className="material-icons text-[14px]">chevron_right</span>}
        <span className="font-medium text-foreground">{unit.name}</span>
      </div>

      {/* Name (inline editable) */}
      <div>
        <label className="block text-[11px] uppercase tracking-wide text-muted-foreground font-medium mb-1">Nombre</label>
        <input
          value={nameDraft}
          onChange={(e) => setNameDraft(e.target.value)}
          onBlur={() => {
            const v = nameDraft.trim();
            if (v && v !== unit.name) patchUnit({ name: v }, 'nombre');
            else setNameDraft(unit.name);
          }}
          onKeyDown={(e) => { if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur(); }}
          className={`${pInput} font-medium`}
        />
      </div>

      {/* Description */}
      <div>
        <label className="block text-[11px] uppercase tracking-wide text-muted-foreground font-medium mb-1">Descripción</label>
        <textarea
          value={descDraft}
          onChange={(e) => setDescDraft(e.target.value)}
          onBlur={() => {
            const v = descDraft.trim();
            if (v !== (unit.description ?? '')) patchUnit({ description: v || null }, 'descripción');
          }}
          rows={2}
          placeholder="¿Qué hace esta unidad?"
          className={`${pInput} resize-y`}
        />
      </div>

      {/* Color + Icon */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-[11px] uppercase tracking-wide text-muted-foreground font-medium mb-1">
            Color
          </label>
          <div className="flex flex-wrap gap-1">
            {COLOR_PRESETS.map((c) => (
              <button
                key={c || 'none'}
                type="button"
                onClick={() => patchUnit({ color: c || null }, 'color')}
                title={c || 'Sin color'}
                className={`w-6 h-6 rounded-full border ${unit.color === c || (!unit.color && !c) ? 'ring-2 ring-primary ring-offset-1' : 'border-border'}`}
                style={{ backgroundColor: c || 'transparent', backgroundImage: c ? undefined : 'repeating-linear-gradient(45deg, var(--border, #ccc) 0 2px, transparent 2px 4px)' }}
              />
            ))}
          </div>
        </div>
        <div>
          <label className="block text-[11px] uppercase tracking-wide text-muted-foreground font-medium mb-1">Icono</label>
          <div className="flex flex-wrap gap-1">
            {ICON_PRESETS.map((icon) => (
              <button
                key={icon}
                type="button"
                onClick={() => patchUnit({ icon }, 'icono')}
                title={icon}
                className={`w-7 h-7 inline-flex items-center justify-center rounded border ${unit.icon === icon ? 'border-primary bg-primary/10' : 'border-border hover:bg-muted'}`}
              >
                <span className="material-icons text-base">{icon}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {savingField && (
        <p className="text-[10px] text-muted-foreground italic">Guardando {savingField}…</p>
      )}

      {/* Lead person */}
      <div>
        <label className="block text-[11px] uppercase tracking-wide text-muted-foreground font-medium mb-1">
          Persona responsable
        </label>
        {unit.leadPersonId === null ? (
          <button
            type="button"
            onClick={() => setShowLeadPicker(true)}
            className="text-sm text-primary hover:underline inline-flex items-center gap-1"
          >
            <span className="material-icons text-base">person_add</span>
            Definir responsable
          </button>
        ) : (
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm">
              <LeadPersonName personId={unit.leadPersonId} />
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setShowLeadPicker(true)}
                className="h-6 w-6 inline-flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted rounded"
                title="Cambiar responsable"
              >
                <span className="material-icons text-sm">edit</span>
              </button>
              <button
                type="button"
                onClick={() => patchUnit({ leadPersonId: null }, 'responsable')}
                className="h-6 w-6 inline-flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-muted rounded"
                title="Quitar responsable"
              >
                <span className="material-icons text-sm">close</span>
              </button>
            </div>
          </div>
        )}
        {showLeadPicker && (
          <PersonPickerDialog
            title="Definir responsable"
            onClose={() => setShowLeadPicker(false)}
            onPick={async (person) => {
              setShowLeadPicker(false);
              await patchUnit({ leadPersonId: person.id }, 'responsable');
            }}
          />
        )}
      </div>

      {/* Members */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className="block text-[11px] uppercase tracking-wide text-muted-foreground font-medium">
            Miembros ({members.length})
          </label>
          <button
            type="button"
            onClick={() => setShowAddMember(true)}
            className="text-xs text-primary hover:underline inline-flex items-center gap-1"
          >
            <span className="material-icons text-sm">person_add</span>
            Añadir miembro
          </button>
        </div>
        {members.length === 0 ? (
          <p className="text-xs text-muted-foreground italic">Aún no hay miembros.</p>
        ) : (
          <>
            <ul className="space-y-1 border border-border rounded-xl divide-y divide-border">
              {pagedMembers.map((m) => (
                <MemberRow
                  key={m.personId}
                  member={m}
                  onRemove={() => removeMember(m.personId)}
                  onTogglePrimary={() => setPrimary(m.personId, !m.primary, m.roleInUnit)}
                />
              ))}
            </ul>
            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-2 text-xs">
                <button
                  type="button"
                  onClick={() => setMemberPage((p) => Math.max(0, p - 1))}
                  disabled={memberPage === 0}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-muted-foreground hover:bg-muted disabled:opacity-40"
                >
                  <span className="material-icons text-sm">chevron_left</span>
                  Anterior
                </button>
                <span className="text-muted-foreground">
                  Página {memberPage + 1} de {totalPages}
                </span>
                <button
                  type="button"
                  onClick={() => setMemberPage((p) => Math.min(totalPages - 1, p + 1))}
                  disabled={memberPage >= totalPages - 1}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-muted-foreground hover:bg-muted disabled:opacity-40"
                >Siguiente<span className="material-icons text-sm">chevron_right</span>
                </button>
              </div>
            )}
          </>
        )}
        {showAddMember && (
          <AddMemberDialog
            onClose={() => setShowAddMember(false)}
            onAdd={async (personId, primary, role) => {
              const r = await fetch(`/api/portal/brain/org-units/${unitId}/members`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ personId, primary, roleInUnit: role || null }),
              });
              const json = await r.json().catch(() => ({}));
              if (!r.ok || !json.success) {
                alert(json.message || 'No se pudo añadir al miembro.');
                return;
              }
              setShowAddMember(false);
              await load();
              onChanged();
            }}
          />
        )}
      </div>

      {/* Danger zone */}
      <div className="pt-3 border-t border-border">
        <button
          type="button"
          onClick={() => setShowDeleteUnit(true)}
          className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-sm rounded border border-destructive/30 text-destructive hover:bg-destructive/10"
        >
          <span className="material-icons text-base">delete</span>
          Eliminar unidad
        </button>
        {showDeleteUnit && (
          <DeleteUnitInlineModal
            unitName={unit.name}
            memberCount={members.length}
            onClose={() => setShowDeleteUnit(false)}
            onConfirm={async (force) => {
              const r = await fetch(`/api/portal/brain/org-units/${unitId}${force ? '?force=true' : ''}`, { method: 'DELETE' });
              const json = await r.json().catch(() => ({}));
              if (!r.ok || !json.success) {
                alert(json.message || 'No se pudo eliminar la unidad.');
                return;
              }
              setShowDeleteUnit(false);
              onDeleted();
            }}
          />
        )}
      </div>
    </div>
  );
}

// Resolves a person id → name. Tiny cached fetch; keeps the side-panel
// markup simple. We cache in module scope so repeated lookups across
// re-renders don't hammer the API.
const personNameCache = new Map<number, string>();
function LeadPersonName({ personId }: { personId: number }) {
  // Seed from the module-scope cache on first render so repeated mounts
  // for the same id render the resolved name immediately. Derive from the
  // cache on every render — that lets a switch in personId pick up an
  // already-cached value without needing a sync setState inside the effect.
  const [resolved, setResolved] = useState<{ id: number; name: string } | null>(() => {
    const cached = personNameCache.get(personId);
    return cached ? { id: personId, name: cached } : null;
  });
  useEffect(() => {
    if (personNameCache.has(personId)) {
      // No setState — the render path below reads from the cache directly.
      return;
    }
    let cancelled = false;
    fetch(`/api/portal/brain/people/${personId}`)
      .then((r) => r.json())
      .then((j) => {
        if (cancelled) return;
        const n: string | undefined = j?.data?.person?.fullName;
        if (n) {
          personNameCache.set(personId, n);
          setResolved({ id: personId, name: n });
        } else {
          setResolved({ id: personId, name: `#${personId}` });
        }
      })
      .catch(() => { if (!cancelled) setResolved({ id: personId, name: `#${personId}` }); });
    return () => { cancelled = true; };
  }, [personId]);
  // Prefer the module cache (fresh after any sibling fetch), then the
  // local resolved state, else a placeholder.
  const display = personNameCache.get(personId)
    ?? (resolved?.id === personId ? resolved.name : null)
    ?? `#${personId}`;
  return <span>{display}</span>;
}

// ─── Member row ─────────────────────────────────────────────────────────────

function MemberRow({
  member,
  onRemove,
  onTogglePrimary,
}: {
  member: OrgUnitMemberSummary;
  onRemove: () => void;
  onTogglePrimary: () => void;
}) {
  const initials = member.fullName.split(/\s+/).filter(Boolean).slice(0, 2).map((s) => s[0]).join('').toUpperCase();
  return (
    <li className="flex items-center gap-2 px-2 py-1.5">
      <span className="shrink-0 w-7 h-7 rounded-full bg-muted text-muted-foreground inline-flex items-center justify-center text-[11px] font-semibold">
        {initials || <span className="material-icons text-base">person</span>}
      </span>
      <div className="flex-1 min-w-0">
        <div className="text-sm truncate">{member.fullName}</div>
        <div className="text-[11px] text-muted-foreground truncate">
          {member.roleInUnit || member.title || '—'}
        </div>
      </div>
      <button
        type="button"
        onClick={onTogglePrimary}
        title={member.primary ? 'Unidad principal (clic para desmarcar)' : 'Marcar como unidad principal'}
        className={`h-6 w-6 inline-flex items-center justify-center rounded hover:bg-muted ${member.primary ? 'text-yellow-500' : 'text-muted-foreground'}`}
      >
        <span className="material-icons text-base">{member.primary ? 'star' : 'star_outline'}</span>
      </button>
      <button
        type="button"
        onClick={onRemove}
        title="Quitar de la unidad"
        className="h-6 w-6 inline-flex items-center justify-center rounded text-muted-foreground hover:text-destructive hover:bg-muted"
      >
        <span className="material-icons text-base">close</span>
      </button>
    </li>
  );
}

// ─── Modals ─────────────────────────────────────────────────────────────────

function NewUnitModal({
  tree,
  onClose,
  onCreated,
}: {
  tree: BrainOrgUnitTreeNode[];
  onClose: () => void;
  onCreated: (created: { id: number }) => void;
}) {
  const [name, setName] = useState('');
  const [parentId, setParentId] = useState<number | null>(null);
  const [description, setDescription] = useState('');
  const [leadPersonId, setLeadPersonId] = useState<number | null>(null);
  const [leadPersonName, setLeadPersonName] = useState<string | null>(null);
  const [color, setColor] = useState<string>('');
  const [icon, setIcon] = useState<string>('groups');
  const [submitting, setSubmitting] = useState(false);
  const [showLeadPicker, setShowLeadPicker] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    const v = name.trim();
    if (!v) return;
    setSubmitting(true);
    setError(null);
    try {
      const r = await fetch('/api/portal/brain/org-units', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: v,
          parentId,
          description: description.trim() || null,
          leadPersonId,
          color: color || null,
          icon,
        }),
      });
      const json = await r.json().catch(() => ({}));
      if (!r.ok || !json.success) {
        setError(json.message || 'No se pudo crear la unidad.');
        return;
      }
      onCreated(json.data);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ModalShell title="Nueva unidad organizativa" onClose={onClose}>
      <div className="space-y-3">
        <Field label="Nombre">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
            placeholder="Ingeniería"
            className={pInput}
          />
        </Field>
        <Field label="Unidad superior">
          <ParentUnitPicker
            tree={tree}
            value={parentId}
            onChange={setParentId}
          />
        </Field>
        <Field label="Descripción (opcional)">
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            placeholder="¿Qué hace esta unidad?"
            className={`${pInput} resize-y`}
          />
        </Field>
        <Field label="Persona responsable (opcional)">
          {leadPersonId === null ? (
            <button
              type="button"
              onClick={() => setShowLeadPicker(true)}
              className="text-sm text-primary hover:underline inline-flex items-center gap-1"
            >
              <span className="material-icons text-base">person_add</span>
              Elegir responsable
            </button>
          ) : (
            <div className="flex items-center gap-2 text-sm">
              <span>{leadPersonName ?? `#${leadPersonId}`}</span>
              <button
                type="button"
                onClick={() => { setLeadPersonId(null); setLeadPersonName(null); }}
                className="text-muted-foreground hover:text-destructive"
                title="Limpiar"
              >
                <span className="material-icons text-base">close</span>
              </button>
            </div>
          )}
          {showLeadPicker && (
            <PersonPickerDialog
              title="Elegir responsable"
              onClose={() => setShowLeadPicker(false)}
              onPick={(p) => { setLeadPersonId(p.id); setLeadPersonName(p.fullName); setShowLeadPicker(false); }}
            />
          )}
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Color">
            <div className="flex flex-wrap gap-1">
              {COLOR_PRESETS.map((c) => (
                <button
                  key={c || 'none'}
                  type="button"
                  onClick={() => setColor(c)}
                  title={c || 'Sin color'}
                  className={`w-6 h-6 rounded-full border ${color === c ? 'ring-2 ring-primary ring-offset-1' : 'border-border'}`}
                  style={{ backgroundColor: c || 'transparent', backgroundImage: c ? undefined : 'repeating-linear-gradient(45deg, var(--border, #ccc) 0 2px, transparent 2px 4px)' }}
                />
              ))}
            </div>
          </Field>
          <Field label="Icono">
            <div className="flex flex-wrap gap-1">
              {ICON_PRESETS.map((it) => (
                <button
                  key={it}
                  type="button"
                  onClick={() => setIcon(it)}
                  title={it}
                  className={`w-7 h-7 inline-flex items-center justify-center rounded border ${icon === it ? 'border-primary bg-primary/10' : 'border-border hover:bg-muted'}`}
                >
                  <span className="material-icons text-base">{it}</span>
                </button>
              ))}
            </div>
          </Field>
        </div>
        {error && (
          <div className="bg-destructive/10 border border-destructive/30 rounded p-2 text-xs text-destructive">
            {error}
          </div>
        )}
        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className={pBtnGhost}
          >Cancelar</button>
          <button
            type="button"
            onClick={submit}
            disabled={submitting || !name.trim()}
            className={pBtnPrimary}
          >
            {submitting && <span className="material-icons animate-spin text-sm">autorenew</span>}
            Crear
          </button>
        </div>
      </div>
    </ModalShell>
  );
}

function ParentUnitPicker({
  tree,
  value,
  onChange,
}: {
  tree: BrainOrgUnitTreeNode[];
  value: number | null;
  onChange: (id: number | null) => void;
}) {
  // Flatten tree to a depth-prefixed list — preserves hierarchy visually
  // inside a single <select>.
  const items: Array<{ id: number; label: string; depth: number }> = [];
  const walk = (nodes: BrainOrgUnitTreeNode[], depth: number) => {
    for (const n of nodes) {
      items.push({ id: n.id, label: n.name, depth });
      walk(n.children, depth + 1);
    }
  };
  walk(tree, 0);
  return (
    <select
      value={value === null ? '' : String(value)}
      onChange={(e) => onChange(e.target.value === '' ? null : parseInt(e.target.value, 10))}
      className={pSelect}
    >
      <option value="">— Sin unidad superior (raíz) —</option>
      {items.map((it) => (
        <option key={it.id} value={String(it.id)}>
          {`${'  '.repeat(it.depth)}${it.depth > 0 ? '↳ ' : ''}${it.label}`}
        </option>
      ))}
    </select>
  );
}

function AddMemberDialog({
  onClose,
  onAdd,
}: {
  onClose: () => void;
  onAdd: (personId: number, primary: boolean, role: string) => Promise<void> | void;
}) {
  const [selected, setSelected] = useState<PersonHit | null>(null);
  const [primary, setPrimary] = useState(false);
  const [role, setRole] = useState('');
  const [submitting, setSubmitting] = useState(false);

  return (
    <ModalShell title="Añadir miembro" onClose={onClose}>
      <div className="space-y-3">
        <Field label="Persona">
          {selected ? (
            <div className="flex items-center justify-between gap-2 bg-muted/40 border border-border rounded-xl px-3 py-2">
              <div className="text-sm">
                <div>{selected.fullName}</div>
                {selected.title && <div className="text-[11px] text-muted-foreground">{selected.title}</div>}
              </div>
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="text-muted-foreground hover:text-foreground"
                title="Limpiar"
              >
                <span className="material-icons text-base">close</span>
              </button>
            </div>
          ) : (
            <PersonPicker
              onChange={() => { /* id-only flow unused — dialog needs the full hit */ }}
              onChangeWithHit={(hit) => { if (hit) setSelected(hit); }}
            />
          )}
        </Field>
        <Field label="Rol en la unidad (opcional)">
          <input
            value={role}
            onChange={(e) => setRole(e.target.value)}
            placeholder="Responsable técnico"
            className={pInput}
          />
        </Field>
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={primary}
            onChange={(e) => setPrimary(e.target.checked)}
          />
          <span>Unidad principal de esta persona</span>
        </label>
        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className={pBtnGhost}
          >Cancelar</button>
          <button
            type="button"
            disabled={!selected || submitting}
            onClick={async () => {
              if (!selected) return;
              setSubmitting(true);
              try { await onAdd(selected.id, primary, role.trim()); }
              finally { setSubmitting(false); }
            }}
            className={pBtnPrimary}
          >
            {submitting && <span className="material-icons animate-spin text-sm">autorenew</span>}
            Añadir
          </button>
        </div>
      </div>
    </ModalShell>
  );
}

/**
 * Modal wrapper around the shared `<PersonPicker>`. Renders the picker inside
 * a ModalShell and routes its `onChangeWithHit` to the caller's `onPick`. The
 * `onChange` handler is required by PersonPicker for the id-only flow but is
 * a no-op here — every consumer of this dialog needs the full PersonHit.
 */
function PersonPickerDialog({
  title,
  onClose,
  onPick,
}: {
  title: string;
  onClose: () => void;
  onPick: (p: PersonHit) => void;
}) {
  return (
    <ModalShell title={title} onClose={onClose}>
      <PersonPicker
        onChange={() => { /* id-only flow unused — dialog needs the full hit */ }}
        onChangeWithHit={(hit) => { if (hit) onPick(hit); }}
      />
    </ModalShell>
  );
}

function DeleteUnitInlineModal({
  unitName,
  memberCount,
  onClose,
  onConfirm,
}: {
  unitName: string;
  memberCount: number;
  onClose: () => void;
  onConfirm: (force: boolean) => Promise<void> | void;
}) {
  const [force, setForce] = useState(false);
  const needsForce = memberCount > 0;
  return (
    <ModalShell title={`¿Eliminar "${unitName}"?`} onClose={onClose}>
      <p className="text-xs text-muted-foreground mb-3">
        {needsForce
          ? `Esta unidad tiene ${memberCount} miembro${memberCount === 1 ? '' : 's'}. La eliminación forzada desvincula a los miembros y sube las unidades hijas un nivel.`
          : 'Esto eliminará la unidad de forma permanente.'}
      </p>
      {needsForce && (
        <label className="flex items-start gap-2 text-xs mb-3 cursor-pointer">
          <input type="checkbox" checked={force} onChange={(e) => setForce(e.target.checked)} className="mt-0.5" />
          <span><strong>Eliminar forzosamente</strong> (sube las unidades hijas al nivel superior y desvincula a todos los miembros)</span>
        </label>
      )}
      <div className="flex justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={onClose}
          className={pBtnGhost}
        >Cancelar</button>
        <button
          type="button"
          disabled={needsForce && !force}
          onClick={() => onConfirm(force)}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-destructive px-4 py-2.5 text-sm font-bold text-destructive-foreground transition hover:-translate-y-px hover:shadow-lg hover:shadow-destructive/20 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0"
        >
          <span className="material-icons text-base">delete</span>Eliminar</button>
      </div>
    </ModalShell>
  );
}

// ─── Small UI helpers ──────────────────────────────────────────────────────

function ModalShell({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/60 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md bg-card border border-border rounded-2xl shadow-xl p-5"
      >
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground"
            aria-label="Cerrar"
          >
            <span className="material-icons text-base">close</span>
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[11px] uppercase tracking-wide text-muted-foreground font-medium mb-1">
        {label}
      </label>
      {children}
    </div>
  );
}
