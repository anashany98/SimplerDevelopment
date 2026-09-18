'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface CreateSnapshotButtonProps {
  siteId: number;
  siteName?: string;
}

/** Inline "Create snapshot" trigger for the site dashboard. POSTs to
 *  /api/portal/sites/[siteId]/export, then deep-links to the snapshots
 *  list so the user sees their new row immediately. */
export default function CreateSnapshotButton({ siteId, siteName }: CreateSnapshotButtonProps) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function handleClick() {
    if (busy) return;
    const defaultName = siteName ? `${siteName} instantánea` : 'Instantánea de la web';
    const name = window.prompt('Nombre de la instantánea', defaultName);
    if (!name) return;

    setBusy(true);
    try {
      const res = await fetch(`/api/portal/sites/${siteId}/export`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        alert(`Error al exportar: ${data.message || 'error desconocido'}`);
        return;
      }
      router.push('/portal/snapshots');
    } catch (err) {
      alert(`Error al exportar: ${err instanceof Error ? err.message : 'error desconocido'}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={busy}
      className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-md border border-border text-foreground hover:bg-accent disabled:opacity-50"
      title="Guardar esta web como instantánea portátil"
    >
      <span className="material-icons text-base">photo_library</span>
      {busy ? 'Guardando…' : 'Crear instantánea'}
    </button>
  );
}
