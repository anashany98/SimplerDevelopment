'use client';

// Site snapshots — list, create, import, download, delete.
// Snapshots are clone-able exports of an entire client website (blocks +
// posts + nav + custom code + post types). See lib/snapshots/* for the
// export/import mechanics.

import { useCallback, useEffect, useState } from 'react';
import { PortalPageHeader } from '@/components/portal/PortalPageHeader';
import { pBtnPrimary, pBtnGhost, pCard, pInput, pSelect, pSectionTitle } from '@/components/portal/portal-ui';

type Snapshot = {
  id: number;
  name: string;
  description: string | null;
  sourceSiteId: number | null;
  version: number;
  isPublic: boolean;
  createdAt: string;
};

type Website = {
  id: number;
  name: string;
};

export default function PortalSnapshotsPage() {
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [websites, setWebsites] = useState<Website[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createSiteId, setCreateSiteId] = useState<number | ''>('');
  const [createName, setCreateName] = useState('');
  const [createDescription, setCreateDescription] = useState('');
  const [importingForSnapshot, setImportingForSnapshot] = useState<Snapshot | null>(null);
  const [importTargetSiteId, setImportTargetSiteId] = useState<number | 'new'>('new');
  const [importNewName, setImportNewName] = useState('');
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<{ kind: 'success' | 'error'; message: string } | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const [snapRes, siteRes] = await Promise.all([
        fetch('/api/portal/snapshots').then((r) => r.json()),
        fetch('/api/portal/cms/websites').then((r) => r.json()),
      ]);
      if (snapRes.success) setSnapshots(snapRes.data);
      if (siteRes.success) setWebsites(siteRes.data);
    } catch (err) {
      console.error('Failed to fetch snapshots', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  function flashSuccess(message: string) {
    setFlash({ kind: 'success', message });
    window.setTimeout(() => setFlash(null), 4000);
  }
  function flashError(message: string) {
    setFlash({ kind: 'error', message });
    window.setTimeout(() => setFlash(null), 6000);
  }

  async function handleCreate() {
    if (!createSiteId) return;
    setCreating(true);
    try {
      const res = await fetch(`/api/portal/sites/${createSiteId}/export`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: createName.trim() || undefined,
          description: createDescription.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        flashError(data.message || 'Error al exportar');
        return;
      }
      flashSuccess('Instantánea creada');
      setShowCreate(false);
      setCreateSiteId('');
      setCreateName('');
      setCreateDescription('');
      await fetchData();
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(id: number) {
    if (!confirm('¿Eliminar esta instantánea? Esta acción no se puede deshacer.')) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/portal/snapshots/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok || !data.success) {
        flashError(data.message || 'Error al eliminar');
        return;
      }
      flashSuccess('Instantánea eliminada');
      await fetchData();
    } finally {
      setBusy(false);
    }
  }

  async function handleImport() {
    if (!importingForSnapshot) return;
    setBusy(true);
    try {
      const body: Record<string, unknown> = {};
      if (importTargetSiteId === 'new') {
        body.createNewSite = true;
        if (importNewName.trim()) body.newSiteName = importNewName.trim();
      } else {
        body.siteId = importTargetSiteId;
      }
      const res = await fetch(`/api/portal/snapshots/${importingForSnapshot.id}/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        flashError(data.message || 'Error al importar');
        return;
      }
      const conflictCount = data.data?.conflicts?.length ?? 0;
      flashSuccess(
        `Se importaron ${data.data?.postsCreated ?? 0} publicaciones en la web #${data.data?.siteId}` +
          (conflictCount > 0 ? ` (${conflictCount} conflictos de slug resueltos)` : ''),
      );
      setImportingForSnapshot(null);
      setImportTargetSiteId('new');
      setImportNewName('');
      await fetchData();
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto flex items-center justify-center py-16 text-muted-foreground">
        <span className="material-icons animate-spin mr-2">autorenew</span>
        Cargando instantáneas...
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6 p-6">
      <PortalPageHeader
        eyebrow="Historial"
        title="Instantáneas de webs"
        subtitle="Clona webs configuradas — exporta bloques, publicaciones, navegación, código personalizado y tipos de contenido como un paquete portátil, y luego impórtalo en una web nueva o existente."
        actions={
          <button
            onClick={() => setShowCreate((s) => !s)}
            className={pBtnPrimary}
          >
            <span className="material-icons text-base">add</span>Crear instantánea</button>
        }
      />

      {flash && (
        <div
          className={`flex items-center gap-2 p-3 rounded-md text-sm border ${
            flash.kind === 'success'
              ? 'bg-green-50 border-green-200 text-green-800 dark:bg-green-900/20 dark:border-green-800 dark:text-green-300'
              : 'bg-red-50 border-red-200 text-red-800 dark:bg-red-900/20 dark:border-red-800 dark:text-red-300'
          }`}
        >
          <span className="material-icons text-base">
            {flash.kind === 'success' ? 'check_circle' : 'error'}
          </span>
          {flash.message}
        </div>
      )}

      {showCreate && (
        <div className={`${pCard} p-4 space-y-3`}>
          <h2 className={pSectionTitle}>Crear instantánea desde una web</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Web de origen</label>
              <select
                value={createSiteId}
                onChange={(e) => setCreateSiteId(e.target.value ? parseInt(e.target.value, 10) : '')}
                className={pSelect}
              >
                <option value="">— Selecciona una web —</option>
                {websites.map((w) => (
                  <option key={w.id} value={w.id}>{w.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Nombre de la instantánea (opcional)</label>
              <input
                type="text"
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
                placeholder="p. ej. Web de marketing de Acme v1"
                className={pInput}
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Descripción (opcional)</label>
            <textarea
              value={createDescription}
              onChange={(e) => setCreateDescription(e.target.value)}
              rows={2}
              className={pInput}
            />
          </div>
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setShowCreate(false)}
              className={pBtnGhost}
            >Cancelar</button>
            <button
              onClick={handleCreate}
              disabled={!createSiteId || creating}
              className={pBtnPrimary}
            >
              {creating ? 'Creando…' : 'Crear instantánea'}
            </button>
          </div>
        </div>
      )}

      {snapshots.length === 0 ? (
        <div className={`${pCard} text-center py-12`}>
          <span className="material-icons text-4xl text-muted-foreground mb-2 block">photo_library</span>
          <p className="text-muted-foreground text-sm">Aún no hay instantáneas.</p>
          <p className="text-muted-foreground text-xs mt-1">Crea la primera para clonar una web.</p>
        </div>
      ) : (
        <div className={`${pCard} overflow-x-auto -mx-4 sm:mx-0`}>
          <table className="w-full text-sm min-w-[640px]">
            <thead className="bg-muted/50 text-muted-foreground">
              <tr>
                <th className="text-left font-medium px-4 py-2.5">Nombre</th>
                <th className="text-left font-medium px-4 py-2.5">Web de origen</th>
                <th className="text-left font-medium px-4 py-2.5">Creado</th>
                <th className="text-right font-medium px-4 py-2.5">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {snapshots.map((s) => {
                const source = s.sourceSiteId
                  ? websites.find((w) => w.id === s.sourceSiteId)?.name ?? `Web #${s.sourceSiteId}`
                  : 'Subida';
                return (
                  <tr key={s.id} className="border-t border-border">
                    <td className="px-4 py-3">
                      <div className="font-medium text-foreground">{s.name}</div>
                      {s.description && (
                        <div className="text-xs text-muted-foreground mt-0.5">{s.description}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{source}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {new Date(s.createdAt).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex items-center gap-1">
                        <a
                          href={`/api/portal/snapshots/${s.id}/download`}
                          className="inline-flex items-center gap-1 rounded-xl border border-border bg-card px-2.5 py-1 text-xs font-semibold text-foreground transition hover:border-foreground/25 hover:shadow-sm"
                          title="Descargar JSON"
                        >
                          <span className="material-icons text-base">download</span>Descargar</a>
                        <button
                          onClick={() => {
                            setImportingForSnapshot(s);
                            setImportTargetSiteId('new');
                            setImportNewName(s.name);
                          }}
                          className="inline-flex items-center gap-1 rounded-xl border border-border bg-card px-2.5 py-1 text-xs font-semibold text-foreground transition hover:border-foreground/25 hover:shadow-sm disabled:opacity-50"
                          title="Importar esta instantánea"
                          disabled={busy}
                        >
                          <span className="material-icons text-base">file_download</span>Importar</button>
                        <button
                          onClick={() => handleDelete(s.id)}
                          className="inline-flex items-center gap-1 rounded-xl border border-border bg-card px-2.5 py-1 text-xs font-semibold text-red-600 transition hover:border-red-300 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50"
                          title="Eliminar instantánea"
                          disabled={busy}
                        >
                          <span className="material-icons text-base">delete</span>Eliminar</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {importingForSnapshot && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => !busy && setImportingForSnapshot(null)}
        >
          <div
            className="bg-card border border-border rounded-2xl shadow-lg w-full max-w-md p-5 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div>
              <h2 className="text-base font-semibold text-foreground">Importar instantánea</h2>
              <p className="text-xs text-muted-foreground mt-1">Aplicar<span className="font-medium text-foreground">{importingForSnapshot.name}</span> en una web.
              </p>
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Objetivo</label>
              <select
                value={importTargetSiteId === 'new' ? 'new' : String(importTargetSiteId)}
                onChange={(e) => {
                  const v = e.target.value;
                  setImportTargetSiteId(v === 'new' ? 'new' : parseInt(v, 10));
                }}
                className={pSelect}
              >
                <option value="new">— Crear una web nueva —</option>
                {websites.map((w) => (
                  <option key={w.id} value={w.id}>{w.name} (superposición)</option>
                ))}
              </select>
            </div>
            {importTargetSiteId === 'new' && (
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Nuevo nombre del sitio</label>
                <input
                  type="text"
                  value={importNewName}
                  onChange={(e) => setImportNewName(e.target.value)}
                  className={pInput}
                />
              </div>
            )}
            {importTargetSiteId !== 'new' && (
              <div className="flex items-start gap-2 p-3 rounded-md bg-amber-50 border border-amber-200 text-amber-900 dark:bg-amber-900/20 dark:border-amber-800 dark:text-amber-200 text-xs">
                <span className="material-icons text-base">warning</span>
                <span>Las publicaciones con slugs en conflicto tendrán un sufijo<code>-imported-N</code>. La navegación
                  existente se reemplazará. Las publicaciones existentes se conservan.
                </span>
              </div>
            )}
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setImportingForSnapshot(null)}
                disabled={busy}
                className={pBtnGhost}
              >Cancelar</button>
              <button
                onClick={handleImport}
                disabled={busy}
                className={pBtnPrimary}
              >
                {busy ? 'Importando…' : 'Importar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
